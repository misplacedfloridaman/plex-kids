// Optional "Play on TV": send a movie/episode to a TV through Home Assistant instead of
// playing it on the device. HA's media_player.play_media opens a deep link on the TV (by
// default Rivulet's, a tvOS Plex client). Everything here runs server-side — the HA token
// never reaches the browser and never appears in an error message or log line.

const DEFAULT_TEMPLATE = "rivulet://play?ratingKey={ratingKey}&offset={offsetMs}";
// HA media_player states that mean "asleep": wake the TV before sending the link.
const ASLEEP_STATES = new Set(["off", "standby"]);

export class TvError extends Error {
  constructor(userMessage, status) {
    super(userMessage);
    this.userMessage = userMessage;
    this.status = status;
  }
}

export function loadTvConfig(env) {
  const haUrl = (env.TV_HA_URL || "").trim().replace(/\/+$/, "");
  const token = (env.TV_HA_TOKEN || "").trim();
  const entity = (env.TV_HA_ENTITY || "").trim();
  return {
    enabled: Boolean(haUrl && token && entity),
    name: (env.TV_NAME || "").trim() || "TV",
    haUrl,
    token,
    entity,
    template: (env.TV_URL_TEMPLATE || "").trim() || DEFAULT_TEMPLATE,
  };
}

// Plex ratingKeys are numeric; anything else never gets near a URL.
export function isValidRatingKey(key) {
  return /^\d+$/.test(String(key ?? ""));
}

export function buildTvUrl(template, { ratingKey, offsetMs }) {
  const offset = Number.isFinite(offsetMs) && offsetMs > 0 ? Math.floor(offsetMs) : 0;
  return template.replaceAll("{ratingKey}", String(ratingKey)).replaceAll("{offsetMs}", String(offset));
}

export function createTvClient(
  config,
  { fetch = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), wakeTimeoutMs = 10000, pollMs = 1000 } = {}
) {
  const headers = { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" };

  // One HA request. Network errors are retried once; HTTP errors are not.
  async function ha(path, options = {}) {
    let res;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetch(`${config.haUrl}${path}`, { ...options, headers });
        break;
      } catch {
        if (attempt >= 1) throw new TvError("Couldn't reach Home Assistant", 502);
      }
    }
    if (res.status === 401 || res.status === 403) throw new TvError("Home Assistant rejected the token", 502);
    if (!res.ok) throw new TvError(`Home Assistant error (${res.status})`, 502);
    return res.json();
  }

  const callService = (service, data = {}) =>
    ha(`/api/services/media_player/${service}`, {
      method: "POST",
      body: JSON.stringify({ entity_id: config.entity, ...data }),
    });

  async function getState() {
    const s = await ha(`/api/states/${config.entity}`);
    return { state: s.state, title: s.attributes?.media_title ?? null, app: s.attributes?.app_name ?? null };
  }

  async function wake() {
    if (!ASLEEP_STATES.has((await getState()).state)) return;
    await callService("turn_on");
    for (let waited = 0; waited < wakeTimeoutMs; waited += pollMs) {
      await sleep(pollMs);
      if (!ASLEEP_STATES.has((await getState()).state)) return;
    }
    throw new TvError("TV didn't wake up", 504);
  }

  async function playOnTv({ ratingKey, offsetMs }) {
    const url = buildTvUrl(config.template, { ratingKey, offsetMs });
    await wake();
    await callService("play_media", { media_content_type: "url", media_content_id: url });
    return { url };
  }

  const playPause = async () => {
    await callService("media_play_pause");
  };

  return { getState, playOnTv, playPause };
}
