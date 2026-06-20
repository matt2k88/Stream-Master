---
name: YouTube audio extraction on server
description: Server-side YouTube streaming is blocked by PO tokens since 2025. Use hidden WebView IFrame API for playback and youtubei.js for search.
---

## Current architecture (June 2026)

**Search:** `youtubei.js` v17 on the Express server — no PO token needed for metadata.
```typescript
const { Innertube } = await import('youtubei.js');
const yt = await Innertube.create({ cache: undefined, retrieve_player: false });
const results = await yt.search(q, { type: 'video' });
// v.id, v.title?.text, v.author?.name, v.duration (object with .seconds or .text), v.thumbnails[]
```

**Playback:** Hidden `react-native-webview` on the device (not server-side).
- Build HTML string with YouTube IFrame API; `height/width: 1`, `autoplay: 1`, `playsinline: 1`
- Call `e.target.unMute(); e.target.setVolume(100); e.target.playVideo()` in `onReady`
- Use `key={videoId}` on the WebView to remount it when the track changes
- Progress: `setInterval` in the iframe posts `{type:'progress', currentTime, duration}`
- Controls: `webViewRef.current.injectJavaScript('window.ytCmd("play"); true;')`
- States: PLAYING=1, PAUSED=2, BUFFERING=3, ENDED=0, UNSTARTED=-1

**Why device-side works:** Residential/consumer device IPs are trusted by YouTube's IFrame API. Replit data-center IPs are blocked by PO token enforcement added 2025.

## Historical note (pre-2025 approach — no longer works)
yt-dlp with `--cookies` + yt-dlp-ejs (Deno 2 for JS cipher) could extract stream URLs. Now YouTube additionally requires a Proof-of-Origin (PO) token from BotGuard (requires real browser context). yt-dlp-ejs 0.8.0 + Deno 2.6.4 are installed but only solve cipher, not PO. See `youtube-pot-wall.md`.

**Replit Secrets UI gotcha (still relevant for cookies passed to youtubei.js):** Secrets UI strips ALL newlines but preserves tabs. To reformat cookie files:
```ts
const stripped = raw.replace(/\r?\n|\r/g, "");
const fixed = stripped.replace(
  /((?:#HttpOnly_)?\.?[a-zA-Z][a-zA-Z0-9._-]+\t(?:TRUE|FALSE)\t)/g,
  "\n$1"
);
```
Use unconditional replace (no lookbehind) — comment section ends with spaces before first domain row.
