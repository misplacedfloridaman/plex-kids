// Streaming-quality preference. This is a *per-device* setting (localStorage — not
// per-profile and not server-stored): the right bitrate depends on the network the iPad is
// on, which is the same regardless of which kid is watching on it.
//
// On the home LAN, Plex direct-streams the source at full bitrate and playback is fine. Off
// network (over Tailscale), shipping the full source bitrate is the buffering culprit, so we
// ask Plex's transcoder to cap the bitrate (and downscale). "Auto" measures the actual
// client↔server throughput — the real bottleneck — and picks a cap to match.

const QUALITY_KEY = "plexKidsStreamQuality";

// maxVideoBitrate is in kbps; 0 = no cap (original source). These get sent to
// /api/items/:key/stream.m3u8 and forwarded to Plex's universal transcoder.
export const QUALITY_PRESETS = {
  original: { maxVideoBitrate: 0 },
  high: { maxVideoBitrate: 8000, videoResolution: "1920x1080" },
  medium: { maxVideoBitrate: 4000, videoResolution: "1280x720" },
  low: { maxVideoBitrate: 2000, videoResolution: "720x480" },
};

export const QUALITY_OPTIONS = [
  { id: "auto", label: "Auto", hint: "Match the connection (recommended)" },
  { id: "original", label: "Original", hint: "Full quality — best on home Wi-Fi" },
  { id: "high", label: "High · ~8 Mbps", hint: "1080p" },
  { id: "medium", label: "Medium · ~4 Mbps", hint: "720p — good away from home" },
  { id: "low", label: "Low · ~2 Mbps", hint: "480p — slow connections" },
];

export function loadStreamQuality() {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    return v === "auto" || (v && v in QUALITY_PRESETS) ? v : "auto";
  } catch {
    return "auto";
  }
}

export function saveStreamQuality(id) {
  try {
    localStorage.setItem(QUALITY_KEY, id);
  } catch {
    /* ignore (private mode etc.) */
  }
}

// Cache the auto measurement for the session so we don't re-probe before every play.
let autoCache = { level: null, at: 0 };
const AUTO_TTL_MS = 5 * 60 * 1000;

// Map measured download throughput → a preset. Thresholds sit comfortably above each cap:
// a stream needs to fit well under the link's capacity (segments arrive in bursts) to avoid
// rebuffering.
function levelForMbps(mbps) {
  if (mbps >= 18) return "original";
  if (mbps >= 9) return "high";
  if (mbps >= 5) return "medium";
  return "low";
}

async function measureMbps() {
  const bytes = 1_500_000;
  const start = performance.now();
  const res = await fetch(`/api/netcheck?bytes=${bytes}&t=${Date.now()}`, { cache: "no-store" });
  const buf = await res.arrayBuffer();
  const seconds = (performance.now() - start) / 1000;
  if (seconds <= 0) return Infinity;
  return (buf.byteLength * 8) / seconds / 1_000_000;
}

// Resolve the current setting to concrete Plex params: { maxVideoBitrate, videoResolution? }.
// For "auto", measures throughput (cached for AUTO_TTL_MS) and falls back to "medium" if the
// probe fails — better a slightly-too-low cap than a stall.
export async function resolveStreamParams() {
  const setting = loadStreamQuality();
  if (setting !== "auto") return QUALITY_PRESETS[setting] || {};

  if (autoCache.level && Date.now() - autoCache.at < AUTO_TTL_MS) {
    return QUALITY_PRESETS[autoCache.level] || {};
  }
  let level = "medium";
  try {
    level = levelForMbps(await measureMbps());
  } catch {
    /* keep medium */
  }
  autoCache = { level, at: Date.now() };
  return QUALITY_PRESETS[level] || {};
}
