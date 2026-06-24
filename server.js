import "dotenv/config";
import express from "express";
import session from "express-session";
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";

const PORT = process.env.PORT || 6767;
// Optional library allowlist. Empty (the default now) means "let Plex decide" — each
// managed user's token already scopes which libraries they see, so we don't double-filter.
// Set it only if you want to further restrict beyond Plex's own per-user access.
const ALLOWED_LIBRARIES = (process.env.ALLOWED_LIBRARIES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
function libraryAllowed(title) {
  return ALLOWED_LIBRARIES.length === 0 || ALLOWED_LIBRARIES.includes(title);
}

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLEX_SERVER = process.env.PLEX_SERVER;
const PLEX_TOKEN = process.env.PLEX_TOKEN;
// Stable identifier Plex associates with this app's client; reused for all plex.tv calls.
const PLEX_CLIENT_ID = process.env.PLEX_CLIENT_ID || "plex-kids-server";
// If unset, a strong secret is generated on first boot and persisted to /config
// (see getSessionSecret below) — so a fresh install needs zero session config.
const SESSION_SECRET_ENV = process.env.SESSION_SECRET;
// App settings (e.g. profiles hidden from the picker). Persisted to a mounted volume
// so it survives container rebuilds.
const SETTINGS_PATH = process.env.SETTINGS_PATH || "/config/settings.json";

// Global admin settings:
//   hiddenProfiles — profiles hidden from the picker
//   recommendedLibraries — legacy global default for the Wild Card feed (per-user now)
//   lockHomeLayout — require the settings PIN to change a profile's home layout
//   homeLayouts — per-profile (by uuid) home-page layout prefs
function loadSettings() {
  const defaults = { hiddenProfiles: [], recommendedLibraries: [], lockHomeLayout: false, homeLayouts: {} };
  try { return { ...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")) }; }
  catch { return defaults; }
}
function saveSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

// The home rows, in their default top-to-bottom order. "libraries" = the block of per-library
// rows. sectionOrder (below) lets each profile rearrange these; on/off stays in `sections`.
const DEFAULT_SECTION_ORDER = [
  "favorites", "continueWatching", "nextUp", "recentlyAdded",
  "watchAgain", "libraries", "shortPicks", "wildCard",
];
// Sanitize a stored/incoming order: keep only known keys (no dupes), then append any known
// keys it's missing — so old saved layouts and newly-added sections both stay complete.
function normalizeSectionOrder(order) {
  const seen = new Set();
  const result = [];
  if (Array.isArray(order)) {
    for (const k of order) {
      if (DEFAULT_SECTION_ORDER.includes(k) && !seen.has(k)) { seen.add(k); result.push(k); }
    }
  }
  for (const k of DEFAULT_SECTION_ORDER) if (!seen.has(k)) result.push(k);
  return result;
}

// Per-profile home-page layout. Default: every rail on, default order, Wild Card from all libraries.
const DEFAULT_HOME_LAYOUT = {
  sections: {
    favorites: true,
    continueWatching: true,
    nextUp: true,
    recentlyAdded: true,
    watchAgain: true,
    shortPicks: true,
    wildCard: true,
  },
  sectionOrder: DEFAULT_SECTION_ORDER,
  libraryRows: null,     // null = a row for every accessible library; [] = none; or an explicit list of names
  wildcardLibraries: [], // [] = all the profile's accessible libraries
};
function getHomeLayout(uuid) {
  const saved = (loadSettings().homeLayouts || {})[uuid];
  // libraryRows: an explicit array of library names (incl. []), or null = every accessible library
  // gets its own row. Migrate the old blanket `libraries` toggle: false => no rows; else default.
  let libraryRows;
  if (saved && "libraryRows" in saved) libraryRows = saved.libraryRows;
  else if (saved?.sections?.libraries === false) libraryRows = [];
  else libraryRows = null;
  return {
    sections: { ...DEFAULT_HOME_LAYOUT.sections, ...(saved?.sections || {}) },
    sectionOrder: normalizeSectionOrder(saved?.sectionOrder),
    libraryRows,
    wildcardLibraries: saved?.wildcardLibraries || [],
  };
}
function setHomeLayout(uuid, layout) {
  const s = loadSettings();
  const layouts = { ...(s.homeLayouts || {}) };
  layouts[uuid] = {
    sections: { ...DEFAULT_HOME_LAYOUT.sections, ...(layout?.sections || {}) },
    sectionOrder: normalizeSectionOrder(layout?.sectionOrder),
    libraryRows: Array.isArray(layout?.libraryRows) ? layout.libraryRows.map(String) : null,
    wildcardLibraries: Array.isArray(layout?.wildcardLibraries) ? layout.wildcardLibraries.map(String) : [],
  };
  saveSettings({ ...s, homeLayouts: layouts });
}

// Persisted auth state (volume, secret — never returned by GET /api/settings):
//   adminToken — obtained via the owner's Plex OAuth sign-in (replaces hardcoded PLEX_TOKEN)
//   pinSalt/pinHash — the settings PIN (daily guard; Plex OAuth is only for set/reset)
const AUTH_PATH = process.env.AUTH_PATH || "/config/auth.json";
let authStore = (() => {
  try { return JSON.parse(fs.readFileSync(AUTH_PATH, "utf8")); } catch { return {}; }
})();
function saveAuth(patch) {
  authStore = { ...authStore, ...patch };
  try {
    fs.mkdirSync(path.dirname(AUTH_PATH), { recursive: true });
    fs.writeFileSync(AUTH_PATH, JSON.stringify(authStore, null, 2));
  } catch (err) {
    console.error("Failed to persist auth state", err.message);
  }
}
function getAdminToken() {
  return authStore.adminToken || PLEX_TOKEN;
}
function saveAdminToken(token) {
  saveAuth({ adminToken: token });
}

// Session signing key: an explicit SESSION_SECRET env var always wins. Otherwise we
// generate one once and persist it to the /config volume (alongside the auth store) so
// it's stable across restarts/rebuilds and a fresh install requires no manual secret.
// saveAuth updates authStore in memory even if the volume isn't writable, so this still
// yields a working (process-lifetime) secret in that edge case.
function getSessionSecret() {
  if (SESSION_SECRET_ENV) return SESSION_SECRET_ENV;
  if (!authStore.sessionSecret) {
    saveAuth({ sessionSecret: crypto.randomBytes(32).toString("hex") });
    console.log("No SESSION_SECRET set — generated one and persisted it to the config volume.");
  }
  return authStore.sessionSecret;
}
const SESSION_SECRET = getSessionSecret();
function hasPin() {
  return !!(authStore.pinSalt && authStore.pinHash);
}
function setPin(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(pin), salt, 32).toString("hex");
  saveAuth({ pinSalt: salt, pinHash: hash });
}
function verifyPin(pin) {
  if (!hasPin()) return false;
  const hash = crypto.scryptSync(String(pin), authStore.pinSalt, 32).toString("hex");
  // timing-safe compare
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(authStore.pinHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

if (!PLEX_SERVER) {
  console.error("Missing PLEX_SERVER — set it in docker-compose.yml.");
  process.exit(1);
}
if (!getAdminToken()) {
  console.warn("No admin token yet — open the app's settings gear and sign in with Plex to bootstrap.");
}

app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Per-device session holds the chosen Plex Home user's token server-side (never sent to
// the client). secure:false because the app is served over both HTTP (LAN) and HTTPS
// (tailnet) and is tailnet-private — not on the public internet.
app.use(session({
  name: "plexkids.sid",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 1000 * 60 * 60 * 24 * 30 },
}));

app.use(express.json());

// Token used for a given request: the active profile's per-user token if a profile has
// been selected on this device, otherwise the admin token (catalog reads, pre-login).
function activeToken(req) {
  return req.session?.plexUserToken || getAdminToken();
}

function plexUrl(path, token = getAdminToken()) {
  const separator = path.includes("?") ? "&" : "?";
  return `${PLEX_SERVER}${path}${separator}X-Plex-Token=${token}`;
}

// Calls the plex.tv cloud API (Home users, profile switching) — distinct from the local
// Plex Media Server. Defaults to the admin token + the app's client identifier; pass a
// different token for per-user calls.
async function plexTvJson(apiPath, { method = "GET", token = getAdminToken() } = {}) {
  const res = await fetch(`https://plex.tv${apiPath}`, {
    method,
    headers: {
      Accept: "application/json",
      "X-Plex-Token": token,
      "X-Plex-Client-Identifier": PLEX_CLIENT_ID,
    },
  });
  if (!res.ok) throw new Error(`plex.tv ${res.status} for ${apiPath}`);
  return res.json();
}

// This server's machineIdentifier, cached. Needed to find the per-user access token.
let machineId = null;
async function getMachineId() {
  if (!machineId) {
    const d = await fetchPlexJson("/identity");
    machineId = d.MediaContainer.machineIdentifier;
  }
  return machineId;
}

// The Plex account that owns this server (the Home admin), cached. Used to gate the
// settings page: only this account, signed in via OAuth, counts as admin.
let ownerUuid = null;
async function getOwnerUuid() {
  if (!ownerUuid) {
    const u = await plexTvJson("/api/v2/user");
    ownerUuid = u.uuid;
  }
  return ownerUuid;
}

// A Plex Home switch returns a *cloud* account token, which the local PMS rejects (401).
// To talk to this server as that user we need the per-user *resource access token*:
// look the server up in the user's plex.tv resource list by machineIdentifier.
async function resolveServerAccessToken(cloudToken) {
  const id = await getMachineId();
  const resources = await plexTvJson("/api/v2/resources?includeHttps=1", { token: cloudToken });
  const server = (resources || []).find((r) => r.clientIdentifier === id);
  return server?.accessToken || null;
}

// Guards user-supplied paths before they reach plexUrl(). Without this, a path like
// "@evil.com/x" turns the Plex host into URL userinfo and exfiltrates the token to
// an attacker-controlled host. Only allow server-relative Plex paths we actually use.
function isSafePlexPath(p) {
  if (typeof p !== "string" || !p.startsWith("/") || p.startsWith("//")) return false;
  if (p.includes("@") || p.includes("\\") || p.includes("..") || p.includes("://")) return false;
  return /^\/(library|photo)\//.test(p);
}

const PLEX_ORIGIN = (() => {
  try { return new URL(PLEX_SERVER).origin; } catch { return null; }
})();

// Single place for the fetch → JSON pattern against the Plex API. Throws on a
// non-2xx response so callers' catch blocks fire instead of silently parsing junk.
async function fetchPlexJson(path, token = getAdminToken()) {
  const res = await fetch(plexUrl(path, token), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Plex API ${res.status} for ${path.split("?")[0]}`);
  return res.json();
}

function formatPlexItem(item) {
  return {
    key: item.ratingKey,
    title: item.title,
    type: item.type,
    year: item.year,
    thumb: item.thumb,
    mediaKey: item.Media?.[0]?.Part?.[0]?.key,
    grandparentTitle: item.grandparentTitle || null,
    // Per-user resume position (ms) when fetched with a user token; absent for fresh items.
    viewOffset: item.viewOffset ?? null,
    duration: item.duration ?? null,
    // Fraction (0–1) for the card's progress bar, when we know both.
    progress: item.viewOffset && item.duration ? item.viewOffset / item.duration : null,
    // Per-user watch state (for the Watch Again rail / Next Up split).
    viewCount: item.viewCount ?? 0,
    lastViewedAt: item.lastViewedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Library item cache — rebuilt on startup and refreshed every hour.
// Keeps /api/recommended fast regardless of library size.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const cache = {
  items: null,
  timestamp: 0,
  inflightPromise: null,
};

// Builds the item pool with a given token. With a managed user's token, Plex applies
// that user's library access AND content-rating/label restrictions — so titles the kid
// isn't allowed to watch never come back (this is what makes a mixed library like
// "Shows" safe to add: the Sopranos is filtered out, nature docs stay).
async function fetchAllLibraryItems(token = getAdminToken()) {
  const sectionsData = await fetchPlexJson("/library/sections", token);
  const sections = (sectionsData.MediaContainer.Directory || []).filter((s) =>
    libraryAllowed(s.title)
  );

  const itemArrays = await Promise.all(
    sections.map(async (section) => {
      try {
        // Fetch episodes for show libraries so tapping a card plays immediately.
        const typeSuffix = section.type === "show" ? "?type=4" : "";
        const d = await fetchPlexJson(`/library/sections/${section.key}/all${typeSuffix}`, token);
        return (d.MediaContainer.Metadata || []).map((i) => ({ ...formatPlexItem(i), library: section.title }));
      } catch (err) {
        console.error(`[cache] Section ${section.title} failed:`, err.message);
        return [];
      }
    })
  );

  return itemArrays.flat();
}

// Admin-token pool (used pre-login and as a fallback).
async function getCachedItems() {
  if (cache.items && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.items;
  }
  if (!cache.inflightPromise) {
    cache.inflightPromise = fetchAllLibraryItems()
      .then((items) => {
        cache.items = items;
        cache.timestamp = Date.now();
        cache.inflightPromise = null;
        console.log(`[cache] Refreshed — ${items.length} items`);
        return items;
      })
      .catch((err) => {
        cache.inflightPromise = null;
        throw err;
      });
  }
  return cache.inflightPromise;
}

// Per-profile item pool, cached by uuid (1h), built with the profile's own token so
// Plex's per-user restrictions apply. Falls back to the admin pool before login.
const userCaches = new Map(); // uuid -> { items, timestamp, inflightPromise }
async function getUserItems(req) {
  const uuid = req.session.user?.uuid;
  if (!uuid) return getCachedItems();
  const token = activeToken(req);
  let entry = userCaches.get(uuid);
  if (entry?.items && Date.now() - entry.timestamp < CACHE_TTL_MS) return entry.items;
  if (entry?.inflightPromise) return entry.inflightPromise;
  const inflightPromise = fetchAllLibraryItems(token)
    .then((items) => {
      userCaches.set(uuid, { items, timestamp: Date.now(), inflightPromise: null });
      return items;
    })
    .catch((err) => {
      userCaches.set(uuid, { items: entry?.items || null, timestamp: entry?.timestamp || 0, inflightPromise: null });
      throw err;
    });
  userCaches.set(uuid, { ...(entry || { items: null, timestamp: 0 }), inflightPromise });
  return inflightPromise;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/api/config", (req, res) => {
  res.json({ allowedLibraries: ALLOWED_LIBRARIES });
});

// Liveness probe for the Docker healthcheck — cheap, no Plex round-trip. A hung
// event loop won't answer this, so Docker can detect and recycle the container.
app.get("/healthz", (req, res) => {
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Identity — Plex Home managed users (the kids). The "who's watching" picker is
// backed by the real Plex Home users; selecting one switches this device's session
// to that user's token so playback/history attribute to them in Plex.
// ---------------------------------------------------------------------------

// Managed (restricted) Home users = the kids' profiles. Admin is intentionally hidden.
// Profiles hidden via Settings are excluded unless ?all=1 (used by the settings page).
app.get("/api/profiles", async (req, res) => {
  try {
    const home = await plexTvJson("/api/v2/home/users");
    const hidden = new Set(loadSettings().hiddenProfiles || []);
    let profiles = (home.users || [])
      .filter((u) => u.restricted)
      .map((u) => ({ uuid: u.uuid, id: u.id, title: u.title, thumb: u.thumb, hidden: hidden.has(u.uuid) }));
    if (req.query.all !== "1") profiles = profiles.filter((p) => !p.hidden);
    res.json({ profiles });
  } catch (err) {
    console.error("Failed to fetch profiles", err.message);
    res.status(502).json({ error: "Could not reach Plex", profiles: [] });
  }
});

// App settings (currently just which profiles are hidden from the picker).
app.get("/api/settings", (req, res) => {
  res.json(loadSettings());
});

app.put("/api/settings", requireAdmin, (req, res) => {
  // Merge so updating one field doesn't clobber the other.
  const next = loadSettings();
  if (Array.isArray(req.body?.hiddenProfiles)) next.hiddenProfiles = req.body.hiddenProfiles.map(String);
  if (Array.isArray(req.body?.recommendedLibraries)) next.recommendedLibraries = req.body.recommendedLibraries.map(String);
  if (typeof req.body?.lockHomeLayout === "boolean") next.lockHomeLayout = req.body.lockHomeLayout;
  try {
    saveSettings(next);
    res.json(next);
  } catch (err) {
    console.error("Failed to save settings", err.message);
    res.status(500).json({ error: "Could not save settings" });
  }
});

// Per-profile home layout (rail on/off + Wild Card libraries). Read is open; writing is
// gated by the settings PIN only when the admin has locked home-layout editing.
app.get("/api/home/layout", (req, res) => {
  const uuid = req.session.user?.uuid;
  res.json({
    ...getHomeLayout(uuid),
    locked: !!loadSettings().lockHomeLayout,
    unlocked: !!req.session.isAdmin,
  });
});

app.put("/api/home/layout", (req, res) => {
  const uuid = req.session.user?.uuid;
  if (!uuid) { res.status(400).json({ error: "No active profile" }); return; }
  if (loadSettings().lockHomeLayout && !req.session.isAdmin) {
    res.status(403).json({ error: "Locked — enter the settings PIN to change the home layout." });
    return;
  }
  setHomeLayout(uuid, req.body || {});
  res.json(getHomeLayout(uuid));
});

// Switch this device's session to a managed user → store their per-user token.
// Boys are PIN-less, so no PIN is required here.
app.post("/api/session/switch/:uuid", async (req, res) => {
  try {
    const user = await plexTvJson(`/api/v2/home/users/${req.params.uuid}/switch`, { method: "POST" });
    if (!user.authToken) throw new Error("switch response missing authToken");
    // Exchange the cloud token for this server's per-user access token.
    const accessToken = await resolveServerAccessToken(user.authToken);
    if (!accessToken) {
      console.error(`Profile ${user.title} has no access to this Plex server`);
      res.status(403).json({ error: "This profile doesn't have access to the Plex server. Grant library access in Plex, then try again." });
      return;
    }
    req.session.plexUserToken = accessToken;
    req.session.user = { uuid: user.uuid, id: user.id, title: user.title, thumb: user.thumb };
    res.json({ user: req.session.user });
  } catch (err) {
    console.error("Profile switch failed", err.message);
    res.status(502).json({ error: "Switch failed" });
  }
});

// Current device's active profile (so the client can skip the picker on reload).
app.get("/api/session", (req, res) => {
  res.json({ user: req.session.user || null });
});

// Clear the device's profile selection (switch profiles).
app.post("/api/session/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ---------------------------------------------------------------------------
// Admin auth (Plex PIN OAuth) — gates the settings page. Only the Plex account
// that owns this server counts as admin. Verified status is held per-device in
// the session, so a parent signs in once per device and kids' devices never do.
// ---------------------------------------------------------------------------

function requireAdmin(req, res, next) {
  if (req.session?.isAdmin) return next();
  res.status(403).json({ error: "Settings locked" });
}

// Drives the settings gate UI: is a token bootstrapped, is a PIN set, is this device
// unlocked, and has the owner verified via Plex this session (allows setting a new PIN).
app.get("/api/admin/state", (req, res) => {
  res.json({
    hasToken: !!getAdminToken(),
    hasPin: hasPin(),
    unlocked: !!req.session.isAdmin,
    ownerVerified: !!req.session.ownerVerified,
  });
});

// Daily settings unlock — enter the PIN (the practical guard; kids don't know it).
app.post("/api/admin/pin/verify", (req, res) => {
  if (verifyPin(String(req.body?.pin || ""))) {
    req.session.isAdmin = true;
    res.json({ ok: true });
  } else {
    res.json({ ok: false });
  }
});

// Set / reset the PIN — only right after the owner verified via Plex OAuth this session.
app.post("/api/admin/pin/set", (req, res) => {
  if (!req.session.ownerVerified) { res.status(403).json({ error: "Verify with Plex first" }); return; }
  const pin = String(req.body?.pin || "");
  if (!/^\d{4,8}$/.test(pin)) { res.status(400).json({ error: "PIN must be 4–8 digits" }); return; }
  setPin(pin);
  req.session.isAdmin = true;
  res.json({ ok: true });
});

// Start sign-in: create a Plex PIN and return the code + the URL to approve it.
app.post("/api/admin/auth/start", async (req, res) => {
  try {
    const pin = await fetch("https://plex.tv/api/v2/pins?strong=true", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-Plex-Product": "Plex Kids",
        "X-Plex-Client-Identifier": PLEX_CLIENT_ID,
      },
    }).then((r) => r.json());
    const authUrl = `https://app.plex.tv/auth#?clientID=${encodeURIComponent(PLEX_CLIENT_ID)}` +
      `&code=${encodeURIComponent(pin.code)}` +
      `&context%5Bdevice%5D%5Bproduct%5D=${encodeURIComponent("Plex Kids")}`;
    res.json({ pinId: pin.id, code: pin.code, authUrl });
  } catch (err) {
    console.error("Admin auth start failed", err.message);
    res.status(502).json({ error: "Could not start sign-in" });
  }
});

// Poll: once the PIN has a token, confirm the signed-in user owns this server.
app.get("/api/admin/auth/poll", async (req, res) => {
  const pinId = String(req.query.pinId || "").replace(/[^0-9]/g, "");
  if (!pinId) { res.status(400).json({ error: "bad pinId" }); return; }
  try {
    const pin = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
      headers: { Accept: "application/json", "X-Plex-Client-Identifier": PLEX_CLIENT_ID },
    }).then((r) => r.json());
    if (!pin.authToken) { res.json({ pending: true }); return; }
    const user = await fetch("https://plex.tv/api/v2/user", {
      headers: { Accept: "application/json", "X-Plex-Token": pin.authToken, "X-Plex-Client-Identifier": PLEX_CLIENT_ID },
    }).then((r) => r.json());

    // Normally: must match the known server owner. Cold-start (no token at all yet):
    // trust the first valid Plex sign-in as the owner (TOFU) so a fresh deploy can
    // bootstrap without a hardcoded token.
    let knownOwner = null;
    if (getAdminToken()) {
      try { knownOwner = await getOwnerUuid(); } catch { knownOwner = null; }
    }
    const isOwner = knownOwner ? user.uuid === knownOwner : !!user.uuid;

    if (isOwner) {
      ownerUuid = ownerUuid || user.uuid;
      // Owner proved identity → may set/reset the PIN. Does NOT directly unlock settings
      // for daily use; that's the PIN's job (Plex login is too frictionless when saved).
      req.session.ownerVerified = true;
      // Persist the OAuth token as the admin token — this is what retires the hardcoded
      // PLEX_TOKEN: after one admin sign-in the app runs on this token.
      saveAdminToken(pin.authToken);
      // Warm the catalog cache (important if this was a cold, token-less bootstrap).
      cache.items = null;
      cache.timestamp = 0;
      getCachedItems().catch(() => {});
    }
    res.json({ pending: false, admin: isOwner });
  } catch (err) {
    console.error("Admin auth poll failed", err.message);
    res.status(502).json({ error: "poll failed" });
  }
});

app.post("/api/admin/logout", (req, res) => {
  req.session.isAdmin = false;
  req.session.ownerVerified = false;
  res.json({ ok: true });
});

app.get("/api/libraries", async (req, res) => {
  try {
    const data = await fetchPlexJson("/library/sections", activeToken(req));
    const libraries = (data.MediaContainer.Directory || [])
      .filter((section) => libraryAllowed(section.title))
      .map((section) => ({
        name: section.title,
        key: section.key,
        type: section.type,
      }));
    res.json({ libraries });
  } catch (err) {
    console.error("Failed to fetch libraries", err.message);
    res.status(502).json({ error: "Could not reach Plex", libraries: [] });
  }
});

app.get("/api/libraries/:key/items", async (req, res) => {
  try {
    const data = await fetchPlexJson(`/library/sections/${req.params.key}/all`, activeToken(req));
    const items = (data.MediaContainer.Metadata || []).map(formatPlexItem);
    res.json({ items });
  } catch (err) {
    console.error("Failed to fetch library items", err.message);
    res.status(502).json({ error: "Could not reach Plex", items: [] });
  }
});

app.get("/api/items/:key/children", async (req, res) => {
  try {
    const data = await fetchPlexJson(`/library/metadata/${req.params.key}/children`, activeToken(req));
    const items = (data.MediaContainer.Metadata || []).map(formatPlexItem);
    res.json({ items });
  } catch (err) {
    console.error("Failed to fetch children", err.message);
    res.status(502).json({ error: "Could not reach Plex", items: [] });
  }
});

app.get("/api/image", async (req, res) => {
  try {
    const imagePath = req.query.path;
    if (!isSafePlexPath(imagePath)) { res.status(400).end(); return; }
    const response = await fetch(plexUrl(imagePath));
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
    Readable.fromWeb(response.body).pipe(res);
  } catch (err) {
    console.error("Failed to fetch image", err.message);
    res.status(502).end();
  }
});

app.get("/api/search", async (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) return res.json({ items: [] });

  try {
    const [sectionsData, searchData] = await Promise.all([
      fetchPlexJson("/library/sections", activeToken(req)),
      fetchPlexJson(`/hubs/search?query=${encodeURIComponent(query)}&limit=40`, activeToken(req)),
    ]);

    const allowedKeys = new Set(
      (sectionsData.MediaContainer.Directory || [])
        .filter((s) => libraryAllowed(s.title))
        .map((s) => String(s.key))
    );

    const items = (searchData.MediaContainer.Hub || [])
      .flatMap((hub) => hub.Metadata || [])
      .filter((item) => allowedKeys.has(String(item.librarySectionID)))
      .map(formatPlexItem);

    res.json({ items });
  } catch (err) {
    console.error("Search failed", err.message);
    res.status(502).json({ error: "Search failed", items: [] });
  }
});

app.get("/api/recommended", async (req, res) => {
  try {
    const all = await getUserItems(req);
    // Wild Card feed: filter by the active profile's chosen libraries (empty = all),
    // falling back to the legacy global setting if a profile hasn't picked any.
    const uuid = req.session.user?.uuid;
    const perUser = uuid ? getHomeLayout(uuid).wildcardLibraries : [];
    const libs = perUser.length ? perUser : (loadSettings().recommendedLibraries || []);
    const pool = libs.length ? all.filter((i) => libs.includes(i.library)) : all;
    const count = Math.min(parseInt(req.query.count) || 5, 50);
    res.json({ items: shuffle(pool).slice(0, count) });
  } catch (err) {
    console.error("Failed to get recommended items", err.message);
    res.status(502).json({ error: "Could not reach Plex", items: [] });
  }
});

// Call this after adding new content to Plex — no server restart needed.
app.post("/api/cache/refresh", async (req, res) => {
  cache.items = null;
  cache.timestamp = 0;
  userCaches.clear(); // also drop per-profile pools so new content/permissions show
  try {
    const items = await getCachedItems();
    res.json({ ok: true, count: items.length });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/libraries/:key/thumb", async (req, res) => {
  try {
    const d = await fetchPlexJson(`/library/sections/${req.params.key}/all?X-Plex-Container-Start=0&X-Plex-Container-Size=20`);
    const items = (d.MediaContainer.Metadata || []).filter((i) => i.thumb);
    const item = items[Math.floor(Math.random() * items.length)];
    res.json({ thumb: item?.thumb ?? null });
  } catch (err) {
    console.error("Failed to fetch library thumb", err.message);
    res.status(502).json({ thumb: null });
  }
});

app.get("/api/items/:key/details", async (req, res) => {
  try {
    const d = await fetchPlexJson(`/library/metadata/${req.params.key}`, activeToken(req));
    const meta = d.MediaContainer.Metadata?.[0];
    const media = meta?.Media?.[0];
    const part = media?.Part?.[0];
    res.json({
      file: part?.file ?? null,
      size: part?.size ?? null,
      container: media?.container ?? null,
      videoCodec: media?.videoCodec ?? null,
      audioCodec: media?.audioCodec ?? null,
      videoResolution: media?.videoResolution ?? null,
      width: media?.width ?? null,
      height: media?.height ?? null,
      bitrate: media?.bitrate ?? null,
      duration: media?.duration ?? null,
      // Per-user resume position so the player can resume from where this kid left off.
      viewOffset: meta?.viewOffset ?? null,
    });
  } catch (err) {
    console.error("Failed to fetch item details", err.message);
    res.status(502).json({ error: "Could not reach Plex" });
  }
});

// ---------------------------------------------------------------------------
// Progress sync — Plex owns watch progress (replaces the old localStorage store).
// /:/timeline requires identifier=com.plexapp.plugins.library to actually persist.
// ---------------------------------------------------------------------------

app.post("/api/items/:key/progress", async (req, res) => {
  const key = req.params.key;
  const time = parseInt(req.query.time, 10);
  const duration = parseInt(req.query.duration, 10);
  const state = ["playing", "paused", "stopped"].includes(req.query.state) ? req.query.state : "playing";
  if (!Number.isFinite(time)) { res.status(400).end(); return; }
  try {
    const params = new URLSearchParams({
      ratingKey: String(key),
      key: `/library/metadata/${key}`,
      identifier: "com.plexapp.plugins.library",
      state,
      time: String(time),
    });
    if (Number.isFinite(duration)) params.set("duration", String(duration));
    await fetch(plexUrl(`/:/timeline?${params.toString()}`, activeToken(req)), {
      headers: { Accept: "application/json", "X-Plex-Client-Identifier": PLEX_CLIENT_ID },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Progress report failed", err.message);
    res.status(502).json({ error: "progress failed" });
  }
});

// Continue Watching = On Deck items that are partway through (viewOffset > 0).
app.get("/api/continue", async (req, res) => {
  try {
    const d = await fetchPlexJson("/library/onDeck", activeToken(req));
    const items = (d.MediaContainer.Metadata || []).map(formatPlexItem).filter((i) => i.viewOffset > 0);
    res.json({ items });
  } catch (err) {
    console.error("Failed to fetch continue watching", err.message);
    res.status(502).json({ error: "Could not reach Plex", items: [] });
  }
});

// Next Up = On Deck items not yet started (the next episode of watched shows).
app.get("/api/nextup", async (req, res) => {
  try {
    const d = await fetchPlexJson("/library/onDeck", activeToken(req));
    const items = (d.MediaContainer.Metadata || []).map(formatPlexItem).filter((i) => !i.viewOffset);
    res.json({ items });
  } catch (err) {
    console.error("Failed to fetch next up", err.message);
    res.status(502).json({ error: "Could not reach Plex", items: [] });
  }
});

// Recently Added across the profile's allowed libraries.
app.get("/api/recently-added", async (req, res) => {
  try {
    const d = await fetchPlexJson("/library/recentlyAdded", activeToken(req));
    const raw = (d.MediaContainer.Metadata || []).filter((m) => libraryAllowed(m.librarySectionTitle));
    // Condense episodes/seasons up to their show, so a show appears once instead of once per
    // season (e.g. several "Franklin" seasons collapse to a single Franklin card).
    const seen = new Set();
    const items = [];
    for (const m of raw) {
      if (m.type === "episode" || m.type === "season") {
        const showKey = m.grandparentRatingKey || m.parentRatingKey; // episode→show, season→show
        if (!showKey || seen.has(String(showKey))) continue;
        seen.add(String(showKey));
        items.push({
          ...formatPlexItem(m),
          key: String(showKey),
          type: "show", // tapping drills into the show (children), not straight to playback
          title: m.grandparentTitle || m.parentTitle || m.title,
          thumb: m.grandparentThumb || m.parentThumb || m.thumb,
          grandparentTitle: null,
          viewOffset: null, duration: null, progress: null,
        });
      } else {
        if (seen.has(String(m.ratingKey))) continue;
        seen.add(String(m.ratingKey));
        items.push(formatPlexItem(m));
      }
      if (items.length >= 20) break;
    }
    res.json({ items });
  } catch (err) {
    console.error("Failed to fetch recently added", err.message);
    res.status(502).json({ error: "Could not reach Plex", items: [] });
  }
});

// Watch Again = things this profile has finished, most-recently-watched first.
app.get("/api/watch-again", async (req, res) => {
  try {
    const token = activeToken(req);
    const sec = await fetchPlexJson("/library/sections", token);
    const sections = (sec.MediaContainer.Directory || []).filter((s) => libraryAllowed(s.title));
    const arrays = await Promise.all(sections.map(async (s) => {
      try {
        const typeSuffix = s.type === "show" ? "&type=4" : "";
        const d = await fetchPlexJson(`/library/sections/${s.key}/all?sort=lastViewedAt:desc&X-Plex-Container-Start=0&X-Plex-Container-Size=15${typeSuffix}`, token);
        return (d.MediaContainer.Metadata || []).map(formatPlexItem).filter((i) => i.viewCount > 0);
      } catch { return []; }
    }));
    const items = arrays.flat().sort((a, b) => (b.lastViewedAt || 0) - (a.lastViewedAt || 0)).slice(0, 20);
    res.json({ items });
  } catch (err) {
    console.error("Failed to fetch watch again", err.message);
    res.status(502).json({ error: "Could not reach Plex", items: [] });
  }
});

// A shuffled rail for one library (from the profile's own pool — restriction-filtered).
app.get("/api/library-rail", async (req, res) => {
  try {
    const lib = String(req.query.library || "");
    const all = await getUserItems(req);
    res.json({ items: shuffle(all.filter((i) => i.library === lib)).slice(0, 20) });
  } catch (err) {
    console.error("Failed to fetch library rail", err.message);
    res.status(502).json({ error: "Could not reach Plex", items: [] });
  }
});

// Short Picks = items under ~10 minutes (from the profile's own pool).
app.get("/api/short-picks", async (req, res) => {
  try {
    const all = await getUserItems(req);
    const pool = all.filter((i) => i.duration && i.duration < 10 * 60 * 1000);
    res.json({ items: shuffle(pool).slice(0, 20) });
  } catch (err) {
    console.error("Failed to fetch short picks", err.message);
    res.status(502).json({ error: "Could not reach Plex", items: [] });
  }
});

// Remove an item from Continue Watching (unscrobble clears the in-progress state).
app.post("/api/items/:key/unscrobble", async (req, res) => {
  try {
    const params = new URLSearchParams({
      key: String(req.params.key),
      identifier: "com.plexapp.plugins.library",
    });
    await fetch(plexUrl(`/:/unscrobble?${params.toString()}`, activeToken(req)), {
      headers: { Accept: "application/json", "X-Plex-Client-Identifier": PLEX_CLIENT_ID },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Unscrobble failed", err.message);
    res.status(502).json({ error: "unscrobble failed" });
  }
});

app.get("/api/sessions", async (req, res) => {
  try {
    const d = await fetchPlexJson("/status/sessions");
    const sessions = (d.MediaContainer.Metadata || []).map((s) => ({
      ratingKey: s.ratingKey,
      title: s.title,
      user: s.User?.title ?? null,
      playerState: s.Player?.state ?? null,
      playerDevice: s.Player?.title ?? null,
      transcode: s.TranscodeSession
        ? {
            videoDecision: s.TranscodeSession.videoDecision,
            audioDecision: s.TranscodeSession.audioDecision,
            progress: s.TranscodeSession.progress,
            speed: s.TranscodeSession.speed,
            throttled: s.TranscodeSession.throttled,
            width: s.TranscodeSession.width,
            height: s.TranscodeSession.height,
          }
        : null,
    }));
    res.json({ sessions });
  } catch (err) {
    console.error("Failed to fetch sessions", err.message);
    res.status(502).json({ error: "Could not reach Plex", sessions: [] });
  }
});

// Rewrites Plex URLs in an m3u8 manifest to route through /api/hls-proxy,
// keeping all requests on our HTTPS origin and avoiding mixed-content blocks.
// baseUrl is the URL the manifest was fetched from, used to resolve relative URLs.
function rewriteM3u8(text, baseUrl) {
  function resolve(url) {
    try { return new URL(url, baseUrl).href; } catch { return url; }
  }

  return text.split("\n").map((line) => {
    const trimmed = line.trim();

    // Rewrite URI="..." attributes (e.g. EXT-X-MAP, EXT-X-KEY)
    const rewrittenLine = line.replace(/URI="([^"]+)"/g, (match, uri) => {
      const abs = resolve(uri);
      if (abs.startsWith(PLEX_SERVER)) {
        return `URI="/api/hls-proxy?url=${encodeURIComponent(abs)}"`;
      }
      return match;
    });

    // Rewrite bare URL lines (non-comment, non-empty)
    if (trimmed && !trimmed.startsWith("#")) {
      const abs = resolve(trimmed);
      if (abs.startsWith(PLEX_SERVER)) {
        return `/api/hls-proxy?url=${encodeURIComponent(abs)}`;
      }
    }

    return rewrittenLine;
  }).join("\n");
}

// Builds Plex transcode quality constraints from the client's requested cap. Returns "" for
// no cap (Plex direct-streams the source at full bitrate — fine on the LAN, the buffering
// culprit off-network). maxVideoBitrate is kbps; videoResolution is "WxH". With a cap set,
// Plex remuxes when the source fits and transcodes down when it doesn't.
function streamQualityParams(query) {
  const kbps = Number.parseInt(query.maxVideoBitrate, 10);
  if (!Number.isFinite(kbps) || kbps <= 0) return "";
  const capped = Math.min(Math.max(kbps, 200), 60000);
  let params = `&maxVideoBitrate=${capped}&videoQuality=100`;
  if (/^\d{2,4}x\d{2,4}$/.test(String(query.videoResolution || ""))) {
    params += `&videoResolution=${query.videoResolution}`;
  }
  return params;
}

app.get("/api/items/:key/stream.m3u8", async (req, res) => {
  const plexMetadataPath = `/library/metadata/${req.params.key}`;
  const clientId = String(req.query.clientId || "plex-kids-local").replace(
    /[^a-zA-Z0-9-_]/g, ""
  );
  const qualityParams = streamQualityParams(req.query);
  // Use the active profile's token so Plex attributes the play session/history to the
  // right kid (falls back to admin token before a profile is selected).
  const streamUrl = plexUrl(
    `/video/:/transcode/universal/start.m3u8?path=${encodeURIComponent(plexMetadataPath)}&mediaIndex=0&partIndex=0&protocol=hls&directPlay=0&directStream=1&subtitleSize=100&audioBoost=100${qualityParams}&X-Plex-Product=PlexKids&X-Plex-Version=0.1&X-Plex-Client-Identifier=${encodeURIComponent(clientId)}&X-Plex-Platform=Web`,
    activeToken(req)
  );
  console.log("Starting Plex stream", { key: req.params.key, clientId, quality: qualityParams || "original", user: req.session.user?.title || "admin" });
  try {
    const m3u8Res = await fetch(streamUrl);
    if (!m3u8Res.ok) { res.status(502).end(); return; }
    const text = await m3u8Res.text();
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache");
    res.send(rewriteM3u8(text, streamUrl));
  } catch (err) {
    console.error("Stream fetch failed", err.message);
    res.status(502).end();
  }
});

// Lightweight download probe: the client times this to measure its real throughput to us.
// The client↔server hop (Tailscale/WAN when off-network) is the streaming bottleneck — not
// server↔Plex, which is always LAN — so this is what "Auto" quality keys off of. Returns N
// zero bytes (never touches Plex).
app.get("/api/netcheck", (req, res) => {
  const bytes = Math.min(Math.max(Number.parseInt(req.query.bytes, 10) || 1_500_000, 1), 5_000_000);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", String(bytes));
  res.end(Buffer.alloc(bytes));
});

// Proxies HLS sub-playlists and segments from Plex through our HTTPS origin.
app.get("/api/hls-proxy", async (req, res) => {
  const targetUrl = req.query.url;
  // Strict origin check — startsWith(PLEX_SERVER) is bypassable via userinfo
  // injection (e.g. "http://<plex-host>@evil.com/..." passes a prefix check).
  let targetOrigin;
  try { targetOrigin = new URL(targetUrl).origin; } catch { targetOrigin = null; }
  if (!targetOrigin || targetOrigin !== PLEX_ORIGIN) {
    res.status(400).end();
    return;
  }
  try {
    const proxyRes = await fetch(targetUrl);
    if (!proxyRes.ok) {
      const shortUrl = new URL(targetUrl).pathname.split("/").slice(-2).join("/");
      console.error(`HLS proxy: Plex returned ${proxyRes.status} for ${shortUrl}`);
      res.status(proxyRes.status).end();
      return;
    }
    const contentType = proxyRes.headers.get("content-type") || "";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-cache");
    if (contentType.toLowerCase().includes("mpegurl") || targetUrl.includes(".m3u8")) {
      const text = await proxyRes.text();
      res.send(rewriteM3u8(text, targetUrl));
    } else {
      Readable.fromWeb(proxyRes.body).pipe(res);
    }
  } catch (err) {
    console.error("HLS proxy failed", err.message);
    if (!res.headersSent) res.status(502).end();
  }
});

const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Plex Kids running on port ${PORT}`);
  console.log(`Plex server: ${PLEX_SERVER}`);
  console.log(`Libraries: ${ALLOWED_LIBRARIES.length ? ALLOWED_LIBRARIES.join(", ") : "all (Plex-controlled per user)"}`);

  // Warm the cache immediately so the first page load is fast.
  getCachedItems().catch((err) => console.warn("[cache] Warm-up failed:", err.message));
});
