// Continue Watching / progress now live in Plex (see /api/continue + /api/items/:key/progress).
// localStorage here only holds favorites (no clean per-user Plex primitive) and the device id.
const k = (profileId, base) => `${base}_${profileId}`;

export function loadFavorites(profileId) {
  try {
    return JSON.parse(localStorage.getItem(k(profileId, "plexKidsFavorites")) || "[]");
  } catch {
    return [];
  }
}

export function toggleFavoriteItem(profileId, item) {
  const existing = loadFavorites(profileId);
  const isAlready = existing.some((f) => f.key === item.key);
  const updated = isAlready
    ? existing.filter((f) => f.key !== item.key)
    : [item, ...existing];
  localStorage.setItem(k(profileId, "plexKidsFavorites"), JSON.stringify(updated));
  return updated;
}

export function getDeviceClientId(profileId) {
  const storageKey = k(profileId, "plexKidsDeviceId");
  let id = localStorage.getItem(storageKey);
  if (!id) {
    id = `plex-kids-${profileId}-` + Math.random().toString(36).slice(2, 11);
    localStorage.setItem(storageKey, id);
  }
  return id;
}

export function getSavedProfileId() {
  return localStorage.getItem("plexKidsActiveProfile");
}

export function saveProfileId(profileId) {
  localStorage.setItem("plexKidsActiveProfile", profileId);
}
