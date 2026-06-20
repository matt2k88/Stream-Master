---
name: YouTube PO token wall
description: YouTube requires Proof-of-Origin tokens from data-center IPs since 2025; server-side audio extraction is effectively blocked regardless of cookies or player client.
---

## The rule
All YouTube audio stream URL extraction from server-side (Replit/data-center IPs) fails with "Sign in to confirm you're not a bot" because YouTube now requires a **Proof-of-Origin (PO) token** alongside any session cookies.

**Why:** yt-dlp verbose shows `[youtube] [pot] PO Token Providers: none` — the yt-dlp-ejs 0.8.0 plugin provides JS cipher solving (deno runtime) but NOT PO token generation. PO tokens require executing BotGuard's JavaScript in a real browser context.

**Tested and all failing (June 2026):**
- `yt-dlp` with valid `--cookies` (properly formatted Netscape file)
- `yt-dlp` with `--extractor-args "youtube:player_client=android_creator/tv_embedded/mweb/ios"`
- `youtubei.js` v17 `getBasicInfo()` with any client type (ANDROID, TV, IOS, ANDROID_MUSIC)
- `youtubei.js` authenticated with cookies → `authenticated: true` but still `Streaming data not available`
- All public Invidious/Piped API instances (all returning errors/down)

**How to apply:**
- For YouTube **search**: use `youtubei.js` `Innertube.create({ retrieve_player: false })` → `yt.search(q, { type: 'video' })` — works fine (no streaming data needed)
- For YouTube **playback**: use a hidden `react-native-webview` loading YouTube IFrame API HTML. The device's own IP is not flagged; the browser engine handles PO tokens transparently. Use `key={videoId}` to remount on track change; control via `injectJavaScript('window.ytCmd("play")')`.
- Cookie normalization for YT_COOKIES_TXT: Replit strips newlines but preserves tabs. Regex to reformat: `stripped.replace(/((?:#HttpOnly_)?\.?[a-zA-Z][a-zA-Z0-9._-]+\t(?:TRUE|FALSE)\t)/g, '\n$1')` — kept in code even though cookies don't help server-side.
