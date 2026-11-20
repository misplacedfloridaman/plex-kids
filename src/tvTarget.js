// "Play on TV" preferences. Per-device (localStorage), like streaming quality: whether this
// device may send to the TV is a parent's choice for that device, not for a kid's profile.
//
//   allowed — set only from the PIN-guarded Settings page. Kids' devices stay off.
//   target  — flipped by the home-screen pill on allowed devices: the TV or this device.

const ALLOWED_KEY = "plexKidsTvAllowed";
const TARGET_KEY = "plexKidsPlayTarget";

export function loadTvAllowed() {
  try {
    return localStorage.getItem(ALLOWED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveTvAllowed(allowed) {
  try {
    localStorage.setItem(ALLOWED_KEY, allowed ? "1" : "0");
  } catch {
    /* ignore (private mode etc.) */
  }
}

// Defaults to the TV: once a parent allows it, taps go there until the pill says otherwise.
export function loadPlayTarget() {
  try {
    return localStorage.getItem(TARGET_KEY) === "device" ? "device" : "tv";
  } catch {
    return "tv";
  }
}

export function savePlayTarget(target) {
  try {
    localStorage.setItem(TARGET_KEY, target === "device" ? "device" : "tv");
  } catch {
    /* ignore (private mode etc.) */
  }
}

// Where a tap actually plays: the TV only when the server has it configured, a parent allowed
// this device, and the pill points at the TV.
export function effectiveTarget(target, allowed, tvEnabled) {
  return tvEnabled && allowed && target === "tv" ? "tv" : "device";
}
