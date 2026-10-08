// Snapshot records of the UI Flow level of detail: an in-memory least recently
// used index over an IndexedDB store, or memory alone when IndexedDB fails.
// Imports nothing and reads no browser global at load time, so node loads it
// directly in tests.

export const SNAPSHOT_DATABASE_NAME = "prototype-inspector-snapshots";
export const SNAPSHOT_STORE_NAME = "tiles";
export const SNAPSHOT_CACHE_LIMITS = Object.freeze({
  maxBytes: 60 * 1024 * 1024,
  maxRecords: 300,
});

// '<formatVersion>|<storyId>|<prototypeId>|<routeId>|<viewportSignature>|default'
export function getSnapshotKey({ formatVersion, prototypeId, routeId, storyId, viewportSignature }) {
  return [formatVersion, storyId, prototypeId, routeId, viewportSignature, "default"].join("|");
}

function recordBytes(record) {
  return Number(record?.blob?.size) || 0;
}

// Records are { blob, width, height, previewWidth, previewHeight, markupHash,
// capturedAt, lastUsedAt }. Every adapter failure switches the cache to memory
// only; records of another format version are deleted when the cache loads.
export function createSnapshotCache({
  adapter = createMemoryAdapter(),
  formatVersion,
  maxBytes = SNAPSHOT_CACHE_LIMITS.maxBytes,
  maxRecords = SNAPSHOT_CACHE_LIMITS.maxRecords,
  now = () => Date.now(),
} = {}) {
  const records = new Map();
  const stale = new Set();
  const versionPrefix = `${formatVersion}|`;
  let store = adapter;
  let loading = null;

  let fellBack = false;
  const call = async (operate) => {
    try {
      return await operate(store);
    } catch (error) {
      if (!fellBack) {
        fellBack = true;
        console.debug("[prototype-inspector] Snapshot cache keeps records in memory only:", error);
      }
      store = createMemoryAdapter();
      return undefined;
    }
  };
  const load = () => {
    loading ??= (async () => {
      for (const [key, record] of (await call((current) => current.getAll())) ?? []) {
        if (key.startsWith(versionPrefix)) {
          records.set(key, record);
        } else {
          await call((current) => current.delete(key));
        }
      }
    })();

    return loading;
  };
  const evict = async () => {
    let bytes = 0;

    records.forEach((record) => {
      bytes += recordBytes(record);
    });

    const byLastUse = [...records].sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt);

    while ((records.size > maxRecords || bytes > maxBytes) && byLastUse.length) {
      const [key, record] = byLastUse.shift();

      records.delete(key);
      stale.delete(key);
      bytes -= recordBytes(record);
      await call((current) => current.delete(key));
    }
  };

  return {
    async get(key) {
      await load();
      return records.get(key) ?? null;
    },
    // Every record whose key starts with prefix, for opening a prototype.
    async getAllWithPrefix(prefix) {
      await load();
      return [...records].filter(([key]) => key.startsWith(prefix));
    },
    isStale(key) {
      return stale.has(key);
    },
    // Marks every loaded record whose key matches (a key or a predicate).
    markStale(match) {
      records.forEach((_record, key) => {
        if (typeof match === "function" ? match(key) : key === match) {
          stale.add(key);
        }
      });
    },
    async put(key, record) {
      await load();
      const stored = { ...record, lastUsedAt: record.lastUsedAt ?? now() };

      records.set(key, stored);
      stale.delete(key);
      await call((current) => current.put(key, stored));
      await evict();
    },
    async touch(key) {
      await load();
      const record = records.get(key);

      if (!record) {
        return;
      }

      const touched = { ...record, lastUsedAt: now() };

      records.set(key, touched);
      await call((current) => current.put(key, touched));
    },
  };
}

export function createMemoryAdapter() {
  const entries = new Map();

  return {
    async delete(key) {
      entries.delete(key);
    },
    async get(key) {
      return entries.get(key);
    },
    async getAll() {
      return [...entries];
    },
    async put(key, record) {
      entries.set(key, record);
    },
  };
}

// The IndexedDB store "tiles" of databaseName. A blocked upgrade, a version
// change from another tab and every request error reject, so the cache falls
// back to memory.
export function createIndexedDbAdapter(databaseName = SNAPSHOT_DATABASE_NAME) {
  let opening = null;

  const open = () => {
    opening ??= new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(databaseName, 1);

      request.onupgradeneeded = () => {
        request.result.createObjectStore(SNAPSHOT_STORE_NAME);
      };
      request.onsuccess = () => {
        const database = request.result;

        database.onversionchange = () => {
          database.close();
          opening = Promise.reject(new Error("The snapshot database changed version."));
          opening.catch(() => {});
        };
        resolve(database);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Opening the snapshot database is blocked."));
    });

    return opening;
  };
  const run = async (mode, operate) => {
    const database = await open();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(SNAPSHOT_STORE_NAME, mode);
      const read = operate(transaction.objectStore(SNAPSHOT_STORE_NAME));

      transaction.oncomplete = () => resolve(read?.());
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Snapshot transaction aborted."));
    });
  };

  return {
    delete: (key) => run("readwrite", (store) => void store.delete(key)),
    get: (key) =>
      run("readonly", (store) => {
        const request = store.get(key);

        return () => request.result;
      }),
    getAll: () =>
      run("readonly", (store) => {
        const keys = store.getAllKeys();
        const values = store.getAll();

        return () => keys.result.map((key, index) => [key, values.result[index]]);
      }),
    put: (key, record) => run("readwrite", (store) => void store.put(record, key)),
  };
}
