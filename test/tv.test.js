import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTvConfig, isValidRatingKey, buildTvUrl, createTvClient, TvError } from "../tv.js";

const DEFAULT_TEMPLATE = "rivulet://play?ratingKey={ratingKey}&offset={offsetMs}";
const ENV = { TV_HA_URL: "http://ha.local:8123/", TV_HA_TOKEN: "secret-token-123", TV_HA_ENTITY: "media_player.tv" };

// Fake Home Assistant: scripted entity states (consumed one per GET, last one sticks) and
// per-service failures. Records every call as { method, path, body }.
function fakeHa({ states = ["idle"], fail = {} } = {}) {
  const calls = [];
  const queue = [...states];
  const fetch = async (url, opts = {}) => {
    const path = new URL(url).pathname;
    const method = opts.method || "GET";
    calls.push({ method, path, body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers });
    const service = path.split("/").pop();
    const f = fail[service];
    if (f && f.count > 0) {
      f.count--;
      if (f.network) throw new TypeError("fetch failed");
      return new Response("{}", { status: f.status });
    }
    if (method === "GET") {
      const state = queue.length > 1 ? queue.shift() : queue[0];
      return new Response(JSON.stringify({ state, attributes: { media_title: "Bluey", app_name: "Rivulet" } }), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  };
  return { fetch, calls, services: () => calls.filter((c) => c.method === "POST").map((c) => c.path.split("/").pop()) };
}

const noSleep = async () => {};
const client = (ha, opts = {}) =>
  createTvClient(loadTvConfig(ENV), { fetch: ha.fetch, sleep: noSleep, wakeTimeoutMs: 50, pollMs: 10, ...opts });

test("loadTvConfig is disabled unless url, token and entity are all set", () => {
  for (const missing of ["TV_HA_URL", "TV_HA_TOKEN", "TV_HA_ENTITY"]) {
    assert.equal(loadTvConfig({ ...ENV, [missing]: "" }).enabled, false, missing);
    const env = { ...ENV };
    delete env[missing];
    assert.equal(loadTvConfig(env).enabled, false, missing);
  }
});

test("loadTvConfig defaults name and template and strips the trailing slash", () => {
  const c = loadTvConfig(ENV);
  assert.equal(c.enabled, true);
  assert.equal(c.name, "TV");
  assert.equal(c.template, DEFAULT_TEMPLATE);
  assert.equal(c.haUrl, "http://ha.local:8123");
});

test("isValidRatingKey accepts digits only", () => {
  assert.equal(isValidRatingKey("18419"), true);
  for (const bad of ["", "12a", "123&x=1", "../1"]) assert.equal(isValidRatingKey(bad), false, bad);
});

test("buildTvUrl fills ratingKey and floors offset", () => {
  assert.equal(buildTvUrl(DEFAULT_TEMPLATE, { ratingKey: "18419", offsetMs: 600000.7 }), "rivulet://play?ratingKey=18419&offset=600000");
});

test("buildTvUrl uses offset 0 for missing, negative or non-numeric offsets", () => {
  for (const offsetMs of [undefined, -5, NaN]) {
    assert.equal(buildTvUrl(DEFAULT_TEMPLATE, { ratingKey: "7", offsetMs }), "rivulet://play?ratingKey=7&offset=0");
  }
});

test("playOnTv on an awake TV sends play_media only", async () => {
  const ha = fakeHa({ states: ["idle"] });
  const { url } = await client(ha).playOnTv({ ratingKey: "18419", offsetMs: 1000 });
  assert.equal(url, "rivulet://play?ratingKey=18419&offset=1000");
  assert.deepEqual(ha.services(), ["play_media"]);
  const play = ha.calls.find((c) => c.path.endsWith("/play_media"));
  assert.deepEqual(play.body, { entity_id: "media_player.tv", media_content_type: "url", media_content_id: url });
  assert.equal(play.headers.Authorization, "Bearer secret-token-123");
});

test("playOnTv wakes a sleeping TV before playing", async () => {
  const ha = fakeHa({ states: ["off", "off", "standby", "idle"] });
  await client(ha).playOnTv({ ratingKey: "1" });
  assert.deepEqual(ha.services(), ["turn_on", "play_media"]);
});

test("playOnTv gives up when the TV never wakes", async () => {
  const ha = fakeHa({ states: ["off"] });
  await assert.rejects(client(ha).playOnTv({ ratingKey: "1" }), (err) => {
    assert.ok(err instanceof TvError);
    assert.equal(err.userMessage, "TV didn't wake up");
    assert.equal(err.status, 504);
    return true;
  });
  assert.ok(!ha.services().includes("play_media"));
});

test("playOnTv retries play_media once after a network error", async () => {
  const ha = fakeHa({ fail: { play_media: { count: 1, network: true } } });
  await client(ha).playOnTv({ ratingKey: "1" });
  assert.deepEqual(ha.services(), ["play_media", "play_media"]);
});

test("playOnTv reports an unreachable Home Assistant after two network errors", async () => {
  const ha = fakeHa({ fail: { play_media: { count: 2, network: true } } });
  await assert.rejects(client(ha).playOnTv({ ratingKey: "1" }), (err) => {
    assert.equal(err.userMessage, "Couldn't reach Home Assistant");
    assert.equal(err.status, 502);
    return true;
  });
});

test("a Home Assistant that never answers times out instead of hanging", async () => {
  // Never resolves on its own; only an abort (the client's timeout) ends it.
  const hangingFetch = (url, opts = {}) =>
    new Promise((_, reject) => opts.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  const tvClient = createTvClient(loadTvConfig(ENV), { fetch: hangingFetch, sleep: noSleep, requestTimeoutMs: 20 });
  await assert.rejects(tvClient.getState(), (err) => {
    assert.equal(err.userMessage, "Couldn't reach Home Assistant");
    return true;
  });
});

test("a rejected token is reported without leaking it", async () => {
  const ha = fakeHa({ fail: { play_media: { count: 1, status: 401 } } });
  await assert.rejects(client(ha).playOnTv({ ratingKey: "1" }), (err) => {
    assert.equal(err.userMessage, "Home Assistant rejected the token");
    assert.equal(err.status, 502);
    assert.ok(!err.userMessage.includes("secret-token-123"));
    assert.ok(!err.message.includes("secret-token-123"));
    return true;
  });
});

test("getState maps the HA entity", async () => {
  const ha = fakeHa({ states: ["playing"] });
  assert.deepEqual(await client(ha).getState(), { state: "playing", title: "Bluey", app: "Rivulet" });
});

test("playPause calls media_play_pause", async () => {
  const ha = fakeHa();
  await client(ha).playPause();
  assert.deepEqual(ha.services(), ["media_play_pause"]);
});
