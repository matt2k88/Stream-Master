---
name: YouTube audio extraction on server
description: How to extract playable audio stream URLs from YouTube server-side with youtubei.js on Replit data-center IPs.
---

## Current working approach (June 2026)

Server-side stream URL extraction works using `{ client: 'IOS' }` on `getInfo()`.

```typescript
const { Innertube } = await import('youtubei.js');
const yt = await Innertube.create({ cache: undefined, cookie: "..." });
// IOS client bypasses SABR delivery — returns direct googlevideo.com URLs
const info = await yt.getInfo(videoId, { client: 'IOS' });
const audioFormats = info.streaming_data?.adaptive_formats
  .filter(f => f.has_audio && !f.has_video)
  .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0)) ?? [];
// format.url may still be absent for some formats — decipher() handles that
const streamUrl = best.url ?? await best.decipher(yt.session.player);
```

**Why IOS client:** Default WEB client uses SABR (Server ABR) — YouTube returns format metadata with NO URL fields (`url`, `signature_cipher`, `cipher` all undefined). `format.decipher()` then throws `PlayerError: No valid URL to decipher`. The IOS client bypasses SABR entirely.

**Quality:** Sort m4a candidates by bitrate descending → itag 140 (128 kbps, mp4a.40.2 AAC-LC) preferred over itag 139 (48 kbps, mp4a.40.5 HE-AAC). AAC-LC is more compatible on Fire TV.

**decipher fallback:** `best.url ?? await best.decipher(yt.session.player)` — covers any remaining signature-cipher formats. Player is available when `retrieve_player` is not explicitly false (default is true).

**How to apply:** Try clients in sequence — `IOS → TV_EMBEDDED → ANDROID → ANDROID_VR`. The Replit dev IP may accept IOS while the production IP rejects it; the fallback chain ensures at least one client works. Only reset `_yt = null` if ALL clients fail (not on per-video errors).

## Search (metadata only)

For search/resolve (no streaming data needed), `retrieve_player: false` is fine and faster:
```typescript
const yt = await Innertube.create({ cache: undefined, retrieve_player: false });
const results = await yt.search(q, { type: 'video' });
```

## Replit Secrets UI gotcha (cookie parsing)

Secrets UI strips ALL newlines but preserves tabs. `parseYTCookies()` in `server/routes.ts` handles this by splitting on `\t` and domain-filtering lines.

## Historical notes

- Pre-fix (WEB client default): formats had no URL fields at all due to SABR → "No valid URL to decipher"
- Pre-2025: yt-dlp with --cookies worked. PO tokens from BotGuard broke that.
- WebView IFrame API (device-side) also works but Silk browser on Fire TV can't autoplay → not usable on Fire Stick.
