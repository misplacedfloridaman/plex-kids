// Profiles come from Plex Home (managed users) via GET /api/profiles. This is just
// optional cosmetic styling for the picker, keyed by the lowercased Plex user title.
// Anyone without an entry falls back to their Plex avatar (thumb) or DEFAULT_COSMETIC,
// so this is purely a fallback when a managed user has no Plex profile photo.
// Add your own entries, e.g.:
//   export const PROFILE_COSMETICS = {
//     spacekid: { emoji: "🚀", color: "#6366f1" },
//     thunder:  { emoji: "⚡", color: "#f59e0b" },
//   };
export const PROFILE_COSMETICS = {};

export const DEFAULT_COSMETIC = { emoji: "🎬", color: "#6b7280" };

export function cosmeticFor(title) {
  return PROFILE_COSMETICS[String(title || "").toLowerCase()] || DEFAULT_COSMETIC;
}
