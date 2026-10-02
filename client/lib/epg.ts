// Shared EPG helpers.
//
// Xtream's get_short_epg returns titles and descriptions base64-encoded, and
// timestamps as unix seconds. Three screens were each doing this decoding with
// their own private copy (TvGuideScreen's `b64`, LivePreviewScreen's
// `decodeEpgString` / `formatEpgTime`); this is the one implementation.

export function decodeEpg(value: string | undefined | null): string {
  if (!value) return "";
  try {
    // Already-plain text comes back unchanged from a failed decode on some
    // panels, so fall back to the original rather than showing nothing.
    return atob(value);
  } catch {
    return value;
  }
}

/** 24-hour HH:MM for an EPG unix timestamp (seconds). */
export function epgClock(timestamp: number | string | undefined | null): string {
  const seconds = typeof timestamp === "string" ? Number(timestamp) : timestamp;
  if (!seconds || Number.isNaN(seconds)) return "";
  const d = new Date(seconds * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
