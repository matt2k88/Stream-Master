import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseSearch, normalisedName, warmSearchIndex } from "./search";

test("shared title normalization preserves punctuation/accent search results", () => {
  for (const [title, query] of [
    ["Café", "cafe"],
    ["Spider-Man", "spiderman"],
    ["RuPaul's Drag Race", "ru pauls drag race"],
    ["It's Always Sunny", "itsalwayssunny"],
  ]) {
    assert.ok(normalisedName({ name: title }).includes(normaliseSearch(query)));
  }
  assert.equal(normalisedName({ name: null }), "");
  assert.equal(normalisedName({}), "");
});

test("normalizes each catalogue object only once, including empty titles", () => {
  let reads = 0;
  const item = { get name() { reads++; return "Café"; } };
  assert.equal(normalisedName(item), "cafe");
  assert.equal(normalisedName(item), "cafe");
  assert.equal(reads, 1);
  let emptyReads = 0;
  const empty = { get name() { emptyReads++; return ""; } };
  normalisedName(empty);
  normalisedName(empty);
  assert.equal(emptyReads, 1);
  // A refreshed catalogue uses new objects, which must not inherit stale names.
  assert.equal(normalisedName({ name: "Spider-Man" }), "spiderman");
});

test("warms huge catalogues in bounded asynchronous slices without array spreading", () => {
  const original = global.setTimeout;
  const tasks: Array<() => void> = [];
  global.setTimeout = ((callback: () => void) => {
    tasks.push(callback);
    return 0;
  }) as any;
  try {
    let reads = 0;
    const catalogue = Array.from({ length: 150001 }, () => ({
      get name() { reads++; return "Café"; },
    }));
    warmSearchIndex([[], catalogue, [{ name: "Spider-Man" }], []]);
    assert.equal(reads, 0, "warm-up must yield before doing any normalization");
    tasks.shift()!();
    assert.equal(reads, 2000, "each callback handles at most 2000 objects");
    assert.equal(tasks.length, 1, "remaining work is scheduled separately");
    while (tasks.length) tasks.shift()!();
    assert.equal(reads, catalogue.length);
    assert.equal(normalisedName(catalogue[0]), "cafe");
    assert.equal(reads, catalogue.length, "screens reuse warmed titles");
    warmSearchIndex([catalogue]);
    while (tasks.length) tasks.shift()!();
    assert.equal(reads, catalogue.length, "repeated warming doesn't redo work");
    warmSearchIndex([[], []]);
    assert.equal(tasks.length, 0);
  } finally {
    global.setTimeout = original;
  }
});