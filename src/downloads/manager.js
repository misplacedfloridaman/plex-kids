// Offline download manager — a singleton that queues item downloads (one at a time), streams
// them from /api/items/:key/download.mp4 with progress, and persists the finished MP4 blob +
// thumbnail + metadata to IndexedDB. Holds the current profileId so UI hooks can look up an
// item's state without threading it through props. Downloads are profile-scoped.
import { getAllDownloads, getDownload, putDownload, deleteDownload, updateOffset, idFor } from "./db";

const DEFAULT_BUDGET_BYTES = 6 * 1024 * 1024 * 1024; // 6 GB soft cap (guardrail for "open to kids")
// The server caps downloads at ~4 Mbps but real average is lower (animation compresses well),
// so we estimate progress from duration×bitrate and never claim 100% until the stream ends.
// ~3.6 Mbps matches observed averages more closely so the bar lands near 100% at completion.
const EST_BYTES_PER_SEC = 3600 * 1000 / 8; // 450 KB/s
// Fold streamed chunks into a disk-backed Blob every ~16 MB so the JS heap never holds the
// whole file — iOS Safari OOM-kills large downloads (500 MB+) if all chunks sit in memory.
const FOLD_BYTES = 16 * 1024 * 1024;

class DownloadManager {
  constructor() {
    this.profileId = null;
    this.queue = [];                 // pending items (not yet started)
    this.active = null;              // ratingKey currently downloading
    this.states = new Map();         // id -> { status, progress, bytes, error }
    this.controllers = new Map();    // id -> AbortController
    this.listeners = new Set();
    this.budgetBytes = DEFAULT_BUDGET_BYTES;
    this.storage = { usage: 0, quota: 0, budget: DEFAULT_BUDGET_BYTES };
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) fn(); }

  // Called by App when the active profile changes: reload which items are already downloaded.
  async setProfile(profileId) {
    if (this.profileId === profileId) return;
    this.profileId = profileId;
    this.states.clear();
    if (profileId) {
      const all = await getAllDownloads(profileId).catch(() => []);
      for (const rec of all) {
        this.states.set(rec.id, { status: "complete", progress: 1, bytes: rec.bytes || 0 });
      }
    }
    this._refreshStorage();
    this._emit();
  }

  stateFor(ratingKey) {
    if (!this.profileId) return { status: "none", progress: 0 };
    return this.states.get(idFor(this.profileId, ratingKey)) || { status: "none", progress: 0 };
  }

  isDownloaded(ratingKey) { return this.stateFor(ratingKey).status === "complete"; }

  async getRecord(ratingKey) {
    if (!this.profileId) return null;
    return getDownload(this.profileId, ratingKey).catch(() => null);
  }

  // Record an on-device resume position for a downloaded item (called during local playback;
  // works offline). Flushed to Plex later by syncPending(). Throttling is the player's job.
  async recordLocalProgress(ratingKey, seconds) {
    if (!this.profileId || !seconds) return;
    await updateOffset(this.profileId, ratingKey, seconds).catch(() => {});
  }

  // Push resume positions captured during offline playback back to Plex. Scoped to the ACTIVE
  // profile so the server session's user token attributes progress to the right kid. Idempotent
  // and safe to call on every connectivity/app-load event; clears the pending flag on success.
  // Returns true if anything was synced (so the caller can refresh Continue Watching).
  async syncPending() {
    if (!this.profileId || !navigator.onLine) return false;
    const all = await getAllDownloads(this.profileId).catch(() => []);
    let synced = false;
    for (const rec of all) {
      if (!rec.pendingSync || !rec.localViewOffset) continue;
      const qs = new URLSearchParams({
        time: String(Math.floor(rec.localViewOffset * 1000)),
        duration: String(Math.floor(rec.item?.duration || 0)),
        state: "stopped",
      });
      try {
        const r = await fetch(`/api/items/${rec.ratingKey}/progress?${qs.toString()}`, {
          method: "POST", credentials: "same-origin",
        });
        if (r.ok) { rec.pendingSync = false; await putDownload(rec); synced = true; }
      } catch { /* leave pending; retry on next connectivity */ }
    }
    return synced;
  }

  // All completed downloads for the current profile (newest first). Video blobs come back as
  // lazy IndexedDB handles (bytes aren't loaded until played), so this is cheap to list.
  async list() {
    if (!this.profileId) return [];
    const all = await getAllDownloads(this.profileId).catch(() => []);
    return all.sort((a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0));
  }

  storageInfo() { return this.storage; }

  _set(id, patch) {
    this.states.set(id, { ...(this.states.get(id) || {}), ...patch });
    this._emit();
  }

  // Enqueue a single playable item (movie/episode), or a season (bulk = all its episodes).
  async enqueue(item) {
    if (!this.profileId) return;
    if (item.type === "season" || item.type === "show") {
      try {
        const res = await fetch(`/api/items/${item.key}/children`, { credentials: "same-origin" });
        const data = await res.json();
        for (const ep of data.items || []) this._enqueueOne(ep);
      } catch { /* offline / error — nothing to enqueue */ }
      return;
    }
    this._enqueueOne(item);
  }

  _enqueueOne(item) {
    const id = idFor(this.profileId, item.key);
    const st = this.states.get(id);
    if (st && (st.status === "complete" || st.status === "queued" || st.status === "downloading")) return;
    this.queue.push(item);
    this._set(id, { status: "queued", progress: 0, bytes: 0 });
    this._pump();
  }

  cancel(ratingKey) {
    const id = idFor(this.profileId, ratingKey);
    // If queued but not started, drop it from the queue.
    this.queue = this.queue.filter((it) => it.key !== ratingKey);
    const controller = this.controllers.get(id);
    if (controller) controller.abort();
    this.states.delete(id);
    this._emit();
  }

  async remove(ratingKey) {
    this.cancel(ratingKey);
    if (this.profileId) await deleteDownload(this.profileId, ratingKey).catch(() => {});
    this.states.delete(idFor(this.profileId, ratingKey));
    this._refreshStorage();
    this._emit();
  }

  _pump() {
    if (this.active || this.queue.length === 0) return;
    const item = this.queue.shift();
    this.active = item.key;
    this._run(item).finally(() => { this.active = null; this._pump(); });
  }

  async _run(item) {
    const id = idFor(this.profileId, item.key);
    const controller = new AbortController();
    this.controllers.set(id, controller);
    this._set(id, { status: "downloading", progress: 0, bytes: 0 });
    const wakeLock = await this._acquireWakeLock();
    try {
      if (await this._overBudget()) throw new Error("Downloads are full");

      const res = await fetch(`/api/items/${item.key}/download.mp4`, {
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`server ${res.status}`);

      const durS = (item.duration || 0) / 1000;
      const estTotal = durS > 0 ? EST_BYTES_PER_SEC * durS : 0;
      const reader = res.body.getReader();
      // Fold chunks into ~16 MB storage-backed Blob parts so peak JS heap stays ~FOLD_BYTES,
      // not the whole file — iOS Safari OOM-kills large downloads if all chunks sit in memory.
      const parts = [];      // array of Blobs (backed by storage, not JS heap)
      let pending = [];
      let pendingBytes = 0;
      let received = 0;
      let lastPct = -1;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        pending.push(value);
        pendingBytes += value.length;
        received += value.length;
        if (pendingBytes >= FOLD_BYTES) {
          parts.push(new Blob(pending));
          pending = [];
          pendingBytes = 0;
        }
        // Estimate-based; clamp to 99% until the stream actually ends.
        const progress = estTotal ? Math.min(received / estTotal, 0.99) : 0;
        const pct = Math.floor(progress * 100);
        if (pct !== lastPct) { lastPct = pct; this._set(id, { status: "downloading", progress, bytes: received }); }
      }
      if (pending.length) parts.push(new Blob(pending));
      const blob = new Blob(parts, { type: "video/mp4" });
      let thumbBlob = null;
      if (item.thumb) {
        thumbBlob = await fetch(`/api/image?path=${encodeURIComponent(item.thumb)}`, { credentials: "same-origin" })
          .then((r) => (r.ok ? r.blob() : null)).catch(() => null);
      }

      await putDownload({
        id,
        profileId: this.profileId,
        ratingKey: item.key,
        item,
        blob,
        thumbBlob,
        bytes: blob.size,
        downloadedAt: Date.now(),
        localViewOffset: 0,
      });
      this._set(id, { status: "complete", progress: 1, bytes: blob.size });
      this._refreshStorage();
      this._ensurePersisted();
    } catch (err) {
      if (err.name === "AbortError") { this.states.delete(id); this._emit(); }
      else this._set(id, { status: "error", progress: 0, error: err.message });
    } finally {
      this.controllers.delete(id);
      if (wakeLock) wakeLock.release().catch(() => {});
    }
  }

  // Keep the screen awake during a download — iOS suspends a backgrounded/locked PWA, which
  // silently kills an in-flight download. Returns a sentinel to release() later (or null).
  async _acquireWakeLock() {
    try { return await navigator.wakeLock?.request("screen"); }
    catch { return null; }
  }

  async _overBudget() {
    await this._refreshStorage();
    return this.storage.usage >= this.budgetBytes;
  }

  async _refreshStorage() {
    if (!navigator.storage?.estimate) return;
    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      this.storage = { usage, quota, budget: this.budgetBytes };
    } catch { /* ignore */ }
  }

  async _ensurePersisted() {
    try {
      if (navigator.storage?.persist && navigator.storage.persisted) {
        if (!(await navigator.storage.persisted())) await navigator.storage.persist();
      }
    } catch { /* ignore */ }
  }
}

export const downloadManager = new DownloadManager();
