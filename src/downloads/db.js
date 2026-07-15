// IndexedDB persistence for offline downloads. One store; each record is a completed download
// keyed by "profileId:ratingKey" so downloads are scoped per managed user. In-flight download
// state lives in the manager (memory), not here — only finished blobs are persisted.
const DB_NAME = "plexKidsDownloads";
const DB_VERSION = 1;
const STORE = "items";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("profileId", "profileId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export const idFor = (profileId, ratingKey) => `${profileId}:${ratingKey}`;

function store(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putDownload(record) {
  const db = await openDB();
  await wrap(store(db, "readwrite").put(record));
}

export async function getDownload(profileId, ratingKey) {
  const db = await openDB();
  return (await wrap(store(db, "readonly").get(idFor(profileId, ratingKey)))) || null;
}

export async function getAllDownloads(profileId) {
  const db = await openDB();
  const idx = store(db, "readonly").index("profileId");
  return (await wrap(idx.getAll(IDBKeyRange.only(profileId)))) || [];
}

export async function deleteDownload(profileId, ratingKey) {
  const db = await openDB();
  await wrap(store(db, "readwrite").delete(idFor(profileId, ratingKey)));
}

export async function updateOffset(profileId, ratingKey, seconds) {
  const rec = await getDownload(profileId, ratingKey);
  if (!rec) return;
  rec.localViewOffset = seconds;
  rec.pendingSync = true; // flush this resume position to Plex on next connectivity (syncPending)
  await putDownload(rec);
}
