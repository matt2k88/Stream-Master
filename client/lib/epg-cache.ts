import { useEffect, useState } from "react";
import { xtreamApi, type EpgListing } from "@/lib/xtream-api";

// "What's on now" for a channel, fetched once and shared.
//
// Xtream has no bulk endpoint for this — get_short_epg is one request PER
// channel — so fetching the whole library up front would mean thousands of
// requests and a loading screen measured in minutes. Instead this fetches only
// what a screen actually asks for (the rows on screen), caches the answer, and
// never asks twice.
//
// The endpoint is also unreliable under parallel load: firing 50+ at once makes
// the provider throttle and return empties for a random subset, which is why
// TvGuideScreen already caps concurrency and retries. Same discipline here.

const TTL_MS = 10 * 60 * 1000;   // a programme rarely changes within 10 minutes
const MAX_IN_FLIGHT = 4;         // deliberately conservative; the panel throttles
const LISTINGS_PER_CHANNEL = 2;  // now + next is all a row needs

type Entry = { listings: EpgListing[]; fetchedAt: number };

const cache = new Map<number, Entry>();
const inFlight = new Set<number>();
const queue: number[] = [];
const listeners = new Set<() => void>();

let active = 0;

function notify(): void {
  for (const l of listeners) l();
}

function pump(): void {
  while (active < MAX_IN_FLIGHT && queue.length) {
    const streamId = queue.shift()!;
    if (cache.has(streamId) && Date.now() - cache.get(streamId)!.fetchedAt < TTL_MS) continue;
    if (inFlight.has(streamId)) continue;

    inFlight.add(streamId);
    active++;
    xtreamApi
      .getShortEpg(streamId, LISTINGS_PER_CHANNEL)
      .then((listings) => {
        // Cache empty answers too: a channel with no guide should not be
        // retried on every scroll. The TTL still lets it recover later.
        cache.set(streamId, { listings: listings ?? [], fetchedAt: Date.now() });
      })
      .catch(() => {
        cache.set(streamId, { listings: [], fetchedAt: Date.now() });
      })
      .finally(() => {
        inFlight.delete(streamId);
        active--;
        notify();
        pump();
      });
  }
}

/** Ask for a channel's listings. Safe to call repeatedly — it de-duplicates. */
export function requestEpg(streamId: number): void {
  if (!streamId) return;
  const hit = cache.get(streamId);
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) return;
  if (inFlight.has(streamId) || queue.includes(streamId)) return;
  queue.push(streamId);
  pump();
}

/** Queue a batch, e.g. the rows currently on screen. */
export function requestEpgBatch(streamIds: number[]): void {
  for (const id of streamIds) requestEpg(id);
}

export function getNowPlaying(streamId: number): EpgListing | null {
  const hit = cache.get(streamId);
  if (!hit || !hit.listings.length) return null;
  const flagged = hit.listings.find((l) => l.now_playing === 1);
  return flagged ?? hit.listings[0];
}

/** 0–100 through the current programme, or null when it cannot be known. */
export function getProgress(streamId: number): number | null {
  const now = getNowPlaying(streamId);
  const start = Number(now?.start_timestamp) || 0;
  const stop = Number(now?.stop_timestamp) || 0;
  if (!start || !stop || stop <= start) return null;
  const pct = ((Date.now() / 1000 - start) / (stop - start)) * 100;
  return Math.max(0, Math.min(100, pct));
}

/** Re-renders the caller whenever any pending fetch completes. */
export function useEpgCacheVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return version;
}

/** Called when the library re-syncs, so stale listings are not shown. */
export function clearEpgCache(): void {
  cache.clear();
  queue.length = 0;
}
