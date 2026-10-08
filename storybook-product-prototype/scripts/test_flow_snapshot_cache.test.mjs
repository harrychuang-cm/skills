// Snapshot cache tests: node --test storybook-product-prototype/scripts/test_flow_snapshot_cache.test.mjs
//
// The cache runs on the memory adapter here; the IndexedDB adapter shares its
// interface, and any adapter failure must leave a working memory-only cache.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  SNAPSHOT_CACHE_LIMITS,
  SNAPSHOT_DATABASE_NAME,
  SNAPSHOT_STORE_NAME,
  createMemoryAdapter,
  createSnapshotCache,
  getSnapshotKey,
} from "../assets/prototype-inspector/flow-snapshot-cache.js";

const day = 24 * 60 * 60 * 1000;
const kb = 1024;
const mb = 1024 * 1024;
const record = (bytes, lastUsedAt) => ({
  blob: { size: bytes },
  capturedAt: lastUsedAt,
  height: 812,
  lastUsedAt,
  markupHash: "0000000000abcd",
  previewHeight: 812,
  previewWidth: 375,
  width: 375,
});
const key = (routeId, version = 1) =>
  getSnapshotKey({
    formatVersion: version,
    prototypeId: "growth",
    routeId,
    storyId: "pages-prototypes-growth--default",
    viewportSignature: "phone:375x812",
  });

async function seededAdapter(entries) {
  const adapter = createMemoryAdapter();

  for (const [entryKey, value] of entries) {
    await adapter.put(entryKey, value);
  }

  return adapter;
}

test("the cache module imports nothing and keeps its names", () => {
  const source = fs.readFileSync(
    new URL("../assets/prototype-inspector/flow-snapshot-cache.js", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source.replace(/\/\/[^\n]*/g, ""), /^\s*import\b/m);
  assert.equal(SNAPSHOT_DATABASE_NAME, "prototype-inspector-snapshots");
  assert.equal(SNAPSHOT_STORE_NAME, "tiles");
  assert.deepEqual({ ...SNAPSHOT_CACHE_LIMITS }, { maxBytes: 60 * mb, maxRecords: 300 });
});

test("snapshot keys follow the spec format", () => {
  assert.equal(key("review"), "1|pages-prototypes-growth--default|growth|review|phone:375x812|default");
});

test("a write at 300 records removes the least recently used one (spec example)", async () => {
  const now = Date.UTC(2026, 9, 7);
  const entries = Array.from({ length: 300 }, (_, index) => [
    key(`route-${index}`),
    record(kb, index === 0 ? now - day : now - 60_000 + index),
  ]);
  const adapter = await seededAdapter(entries);
  const cache = createSnapshotCache({ adapter, formatVersion: 1, now: () => now });

  await cache.put(key("new"), record(20 * kb, now));

  assert.equal((await adapter.getAll()).length, 300);
  assert.equal(await cache.get(key("route-0")), null);
  assert.ok(await cache.get(key("new")));
  assert.ok(await cache.get(key("route-1")));
});

test("a write past 60 MB removes the least recently used records until it fits (spec example)", async () => {
  const now = Date.UTC(2026, 9, 7);
  const each = (59.99 * mb) / 120;
  const entries = Array.from({ length: 120 }, (_, index) => [key(`route-${index}`), record(each, now - 120_000 + index)]);
  const adapter = await seededAdapter(entries);
  const cache = createSnapshotCache({ adapter, formatVersion: 1, now: () => now });

  await cache.put(key("new"), record(40 * kb, now));

  const remaining = await adapter.getAll();
  const total = remaining.reduce((sum, [, value]) => sum + value.blob.size, 0);

  assert.ok(total <= 60 * mb, `total ${total}`);
  assert.equal(await cache.get(key("route-0")), null, "the least recently used record goes first");
  assert.ok(await cache.get(key("route-119")), "recently used records stay");
  assert.ok(await cache.get(key("new")));
});

test("an adapter that throws leaves a memory-only cache and no error (spec example)", async () => {
  const failing = {
    delete: async () => { throw new Error("blocked"); },
    get: async () => { throw new Error("blocked"); },
    getAll: async () => { throw new Error("IndexedDB open threw"); },
    put: async () => { throw new Error("blocked"); },
  };
  const cache = createSnapshotCache({ adapter: failing, formatVersion: 1 });

  await cache.put(key("review"), record(kb, 1));

  assert.equal((await cache.get(key("review"))).markupHash, "0000000000abcd");
});

test("records of another format version are never read and are deleted", async () => {
  const adapter = await seededAdapter([[key("review", 1), record(kb, 1)]]);
  const cache = createSnapshotCache({ adapter, formatVersion: 2 });

  assert.equal(await cache.get(key("review", 1)), null);
  assert.equal(await cache.get(key("review", 2)), null);
  assert.deepEqual(await adapter.getAll(), []);
});

test("getAllWithPrefix returns the open prototype's records", async () => {
  const other = getSnapshotKey({
    formatVersion: 1,
    prototypeId: "inventory",
    routeId: "list",
    storyId: "pages-prototypes-inventory--default",
    viewportSignature: "phone:375x812",
  });
  const adapter = await seededAdapter([[key("review"), record(kb, 1)], [key("intake"), record(kb, 2)], [other, record(kb, 3)]]);
  const cache = createSnapshotCache({ adapter, formatVersion: 1 });
  const prefix = "1|pages-prototypes-growth--default|growth|";

  assert.deepEqual((await cache.getAllWithPrefix(prefix)).map(([entryKey]) => entryKey).sort(), [key("intake"), key("review")].sort());
});

test("touch updates the last use and markStale flags records until the next write", async () => {
  let clock = 10;
  const cache = createSnapshotCache({ formatVersion: 1, now: () => clock });

  await cache.put(key("review"), record(kb, undefined));
  clock = 20;
  await cache.touch(key("review"));
  assert.equal((await cache.get(key("review"))).lastUsedAt, 20);

  cache.markStale((entryKey) => entryKey.includes("|growth|"));
  assert.equal(cache.isStale(key("review")), true);
  await cache.put(key("review"), record(kb, 30));
  assert.equal(cache.isStale(key("review")), false);
});

test("the open prototype's key prefix neither reads nor marks a prototype whose id only starts the same", async () => {
  const similar = getSnapshotKey({
    formatVersion: 1,
    prototypeId: "growth-plus",
    routeId: "review",
    storyId: "pages-prototypes-growth--default",
    viewportSignature: "phone:375x812",
  });
  const adapter = await seededAdapter([[key("review"), record(kb, 1)], [similar, record(kb, 2)]]);
  const cache = createSnapshotCache({ adapter, formatVersion: 1 });
  const prefix = ["1", "pages-prototypes-growth--default", "growth", ""].join("|");

  assert.deepEqual((await cache.getAllWithPrefix(prefix)).map(([entryKey]) => entryKey), [key("review")]);
  cache.markStale((entryKey) => entryKey.startsWith(prefix));
  assert.equal(cache.isStale(key("review")), true);
  assert.equal(cache.isStale(similar), false);
});
