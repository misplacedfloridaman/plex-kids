# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## What this is

A YouTube Kids-style web app that streams from a local Plex Media Server, packaged as a Docker container. The Express backend proxies Plex API calls (keeping the token server-side) and serves the built React frontend as a SPA. Runs on port **6767**.

The canonical reference version (pm2/Node on the Mac mini) lives at `../plex-kids/plex-kids/`. This directory is the Docker port of that app — tested and confirmed working.

**Current version: v3.7.7** — displayed in the UI below the logo (`PlexKidsLogo.jsx`). Bump the patch version in `PlexKidsLogo.jsx` and this table with every meaningful commit.

**v3.0.0 = Plex-native architecture:** Tailscale Serve (private delivery), Plex Home managed users for identity, and Plex timeline progress sync (Continue Watching = Plex On Deck; localStorage progress retired). Favorites remain local. Remaining v3 work (Phase D): OAuth login flow + open-source prep. See the plan file `nice-seems-to-be-agile-snowglobe.md`.

| Version | Change |
|---|---|
| v2.0.0 | Initial Docker port |
| v2.1.0 | HTTPS HLS proxy — streaming works via Tailscale (`/api/hls-proxy`, `rewriteM3u8`) |
| v2.1.1 | Fix HLS proxy relative URL resolution; version label in UI |
| v2.1.2 | Center version label under logo |
| v2.1.3 | Restore season grouping in library view (show → seasons → episodes) |
| v2.1.4 | Log Plex non-200 proxy errors; increase HLS.js frag retry tolerance for concurrent streams |
| v2.1.5 | Auto-recover from fatal HLS network/media errors before surfacing error UI |
| v2.1.6 | Harden API: validate /api/image path (token-exfil fix), strict origin check on hls-proxy (SSRF), remove open CORS |
| v2.2.0 | /healthz + Docker healthcheck; search request cancellation; remove node-fetch (native fetch + Readable.fromWeb piping); fetchPlexJson helper; favorites Set lookup; extract StreamInfoPanel; Dockerfile cache clean |
| v2.3.0 | Plex Home managed users replace the trust-based profile picker; server-side session holds per-user token; streaming attributes to the right kid. (Delivery already moved Funnel→private Tailscale Serve.) |
| v2.3.1 | Fix managed-user streaming: exchange the cloud switch token for this server's per-user resource access token (the local PMS 401s the raw cloud token). Verified a managed user plays end-to-end. |
| v3.0.0 | Plex-native progress: report playback to Plex timeline (throttled), resume from per-user viewOffset, Continue Watching = Plex On Deck (localStorage progress retired; favorites stay local). Catalog reads use the per-user token. Settings page to hide profiles from the picker (persisted to /config volume). |
| v3.1.0 | Move player "i" button below the iOS safe-area inset (clears status bar/battery); Home button in library/season nav; Settings: choose which libraries feed Recommended. |
| v3.2.0 | Disable zoom + full-bleed black background (no gray edges). v3 Phase D start: gate Settings behind Plex admin sign-in (PIN OAuth; verify Home owner; per-device session); PUT /api/settings requires admin. |
| v3.3.0 | Phase D2: admin token obtained via OAuth sign-in and persisted to /config/auth.json (getAdminToken = persisted ?? env), so PLEX_TOKEN no longer must be hardcoded. Cold-start TOFU: first valid sign-in becomes owner when no token exists. |
| v3.4.0 | Settings guarded by a PIN (daily unlock); Plex OAuth only for setting/resetting the PIN ("Forgot PIN?") + token bootstrap. Settings gear moved to center-bottom of the picker. User icons now use real Plex profile photos (thumb) with emoji fallback. |
| v3.5.0 | Per-user customizable home: toggleable rails (Continue Watching, Next Up, Recently Added, Watch Again, per-library rows, Short Picks) via a ✨ Customize panel (server-stored per profile); random feed renamed "Wild Card" with per-user library selection moved here; admin "Require PIN to change home layout" option. ("Because they watched" still deferred.) |
| v3.6.0 | Rails scroll horizontally (Wild Card stays a vertical wall); more space above section headers; per-profile item pools (`getUserItems` built with the profile's token) so Plex content-rating/label restrictions hide disallowed titles — makes a mixed library like "Shows" safe to add. |
| v3.6.1 | ALLOWED_LIBRARIES now optional (empty = let Plex decide per managed user); removed from compose. Library list loads per-profile, so per-library rails + Wild Card library options auto-reflect exactly what each user can access. |
| v3.6.2 | Phase D3 (open-source prep): rewrote README + .env.example + docker-compose.example.yml for the current architecture (Plex Home users, OAuth+PIN bootstrap, /config volume, Tailscale Serve, no required token/ALLOWED_LIBRARIES); gitignore the config volume; genericized real IP/hostname out of docs. Docs only — no app change. |
| v3.7.0 | Responsive layout: fluid `clamp()` sizing for page padding, headers, grids, and rail cards so the app scales from iPhone (~2-col grids, smaller cards) to iPad (unchanged) to desktop. MediaCard thumbnail switched from fixed 190px height to 16/9 aspect ratio. Page padding respects safe-area insets. Was iPad-only (fixed px); single giant column on phones. |
| v3.7.1 | Uniform media cards: reserve a fixed text area (always 2 title lines + 1 subtitle line, rendered empty when absent) so movies/seasons/episodes/long-name items are all equal height within a rail/grid. Dropped the bare year subtitle (keeps explicit subtitle + episode show name). |
| v3.7.2 | Open-source distribution: GitHub Actions workflow publishes a multi-arch image to GHCR (`ghcr.io/<owner>/plex-kids`) on version tags; example compose defaults to pulling that image (no build). `SESSION_SECRET` now auto-generated + persisted to /config when unset, so `PLEX_SERVER` is the only required config. (Auto-discover PLEX_SERVER from the Plex sign-in = flagged for later.) |
| v3.7.3 | Docs: document changing the host port in `docker-compose.example.yml` (HOST:CONTAINER mapping; change left side, or set `PORT` + update healthcheck for the internal port) and a README note. Docs only — no app change. |
| v3.7.4 | Privacy/cleanup (post open-source audit): genericized `PROFILE_COSMETICS` to `{}` with an example comment (removed real first names; Plex profile photos are the real icons anyway); vite dev `allowedHosts: true` (was a personal hostname; dev-only). Public git history rewritten to a clean snapshot to scrub the names from prior commits. |
| v3.7.5 | Docs: explain the optional autoheal sidecar (healthcheck = detector, autoheal = actuator; restarts unhealthy containers; Docker-socket caveat) in README + MIGRATION.md. Docs only — no app change. |
| v3.7.6 | New PWA app icon (orange Plex play-chevron + "Kids"): replaced `public/icon.png` (apple-touch-icon) and `public/icon.svg` (manifest); bumped apple-touch cache-buster to `?v=3`; manifest `purpose` → `any` (finished icon with its own background; avoids maskable cropping) + added a PNG manifest entry for Android. |
| v3.7.7 | Recently Added condenses episodes/seasons to their show (one card per show, taps drill in). Home customization reworked: Wild Card is now a toggleable row (can disable the endless feed); the blanket "row per library" + separate Wild Card library list merged into one **Libraries** section with two per-library toggles (Own row / Wild Card). New layout fields `libraryRows` (null=all) + `sections.wildCard`; old `sections.libraries` migrated. |

**Planned: offline downloads** — deferred. The library is MKV; Safari cannot play MKV natively. Blocked until a transcoding or format solution is found.

## Commands

```bash
# Build and run with Docker Compose
docker-compose up --build       # build image and start
docker-compose up -d --build    # same, detached
docker-compose down             # stop and remove container
docker-compose logs -f          # tail logs

# Force-refresh the library cache without restarting
curl -X POST http://localhost:6767/api/cache/refresh

# Local development (no Docker — requires Node 20+)
npm install
npm run dev        # Vite dev server on :5173 (hot reload)
npm run server     # Express API server on :6767

# Build for production locally
npm run build
node server.js

# Lint
npm run lint
```

**Dev API gap**: The Vite dev server (`:5173`) has no `/api` proxy configured, so API calls fail in hot-reload mode. For end-to-end testing, `npm run build && node server.js` and access via `:6767`. Or add `proxy: { '/api': 'http://localhost:6767' }` under `server:` in `vite.config.js`.

## Configuration

Config lives directly in `docker-compose.yml` (gitignored — never commit). Use `docker-compose.example.yml` as the template:

```bash
cp docker-compose.example.yml docker-compose.yml
# then set PLEX_SERVER and SESSION_SECRET. PLEX_TOKEN is optional (bootstrapped via the
# in-app Plex sign-in); ALLOWED_LIBRARIES is optional (empty = Plex decides per user).
```

**PLEX_SERVER gotcha**: Inside the container, `localhost` refers to the container itself — not the host. Use:
- The Mac's **LAN IP** (e.g. `http://192.168.1.x:32400`) — works on any Docker host
- `http://host.docker.internal:32400` — works on Docker Desktop for Mac/Windows only

## Architecture

```
Dockerfile                 Multi-stage: builder (Vite) → runner (Express + dist/)
docker-compose.yml         Gitignored — contains real credentials
docker-compose.example.yml Committed template with placeholder values
server.js                  Express 5, ES modules — proxies Plex API, serves dist/
src/
  App.jsx          Root component — all navigation state, data fetching, render switching
  styles.js        Shared inline style objects
  profiles.js      PROFILES array — add/remove user profiles here
  storage.js       All localStorage utilities (profile-scoped keys)
  hooks/
    usePlayer.js   All video playback logic: HLS setup, scrubbing, autoplay
  components/
    Player.jsx         Fullscreen-only video player UI + controls overlay + stream info panel
    MediaCard.jsx      Thumbnail card
    RecommendedFeed.jsx  Infinite scroll feed via IntersectionObserver
    ProfilePicker.jsx  Full-screen "Who's watching?" screen
    PlexKidsLogo.jsx   Logo image component
```

### package.json dependency split

`react`, `react-dom`, and `hls.js` are in `devDependencies` — they get bundled into `dist/` by Vite and don't need to be present in the final runtime image. Only `express`, `cors`, `dotenv`, and `node-fetch` are runtime dependencies installed in the second Docker stage.

### Data flow

1. **Server caches all library items** in memory on startup (refreshed hourly). The `/api/recommended` endpoint returns a random Fisher-Yates shuffle from this cache.
2. **Streaming** goes through `/api/items/:key/stream.m3u8`, which proxies Plex's HLS transcoding endpoint. The app never calls Plex's scrobble/timeline endpoints, so play counts and watch history in Plex are unaffected.
3. **localStorage** is scoped per profile: keys follow `plexKids{Thing}_{profileId}`. Profiles are defined in `profiles.js` — there is no auth, just client-side profile switching.

### Navigation state machine (App.jsx)

Render order (first truthy wins):
1. `!activeProfile` → `<ProfilePicker>` (always shown on page load — no profile is persisted)
2. `loading` → loading screen
3. `selectedLibrary` → library grid view
4. `showLibraryPicker` → library picker overlay
5. default → home screen (Favorites + Continue Watching + RecommendedFeed)

### Player

The player is **fullscreen-only** — CSS fixed overlay, no browser Fullscreen API. Tapping the video toggles play/pause. The ✕ button closes and clears the player.

### Adding a library

Just share it to the managed user(s) in Plex (with any content-rating limit). It appears
automatically as a per-library rail + Wild Card option for that profile — no app config or
rebuild. Optional emoji/color/display-name mappings live in the helper functions at the bottom
of `App.jsx`. (The `ALLOWED_LIBRARIES` env var still works as an optional extra restriction but
is unset by default — Plex's per-user access is the source of truth.)
