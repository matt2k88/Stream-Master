---
name: YouTube audio extraction on server
description: How to reliably extract YouTube audio stream URLs from a server-side Node.js process when YouTube is enforcing JS challenges + bot walls.
---

YouTube blocks unauthenticated cloud IPs with a "Sign in to confirm you're not a bot" wall, AND requires solving a JavaScript signature/`n`-parameter challenge to get usable media URLs.

**Two independent pieces are needed — solving only one is not enough:**

1. **Cookies** (defeats the bot wall): export a logged-in browser session as Netscape `cookies.txt`. Pass `--cookies` to yt-dlp and a `Cookie:` header to ytdl-core / youtubei.js.
2. **JS challenge solver** (gets non-storyboard formats): yt-dlp needs the `yt-dlp-ejs` pip plugin **plus Deno 2.x** on PATH. Deno 1.x is detected but marked `(unsupported)`. Without the solver, `yt-dlp -F` only returns `sb0/sb1/...` storyboard images.

**Why:** YouTube migrated the web client to SABR (server-side ABR). Adaptive formats no longer ship a `url` or `signature_cipher` field — they ship a `cipher` blob that requires executing a piece of JS from YouTube's player script. yt-dlp's built-in interpreters can't keep up; the EJS plugin offloads JS execution to Deno. youtubei.js and `@distube/ytdl-core` also fail (they throw "No valid URL to decipher") because their bundled player scripts go stale quickly.

**How to apply:**
- Dev/prod must both have: `python` + `uv` + `yt-dlp` + `yt-dlp-ejs` (pip), and the Replit `deno-2` module (not the older nix `deno`).
- Spawn as `uv run yt-dlp ...` so the plugin resolves inside the uv-managed venv.
- Replit Cloud Run deployments do NOT auto-run `uv sync` — add it to the deployment build command (`uv sync --frozen && ...`) or the venv won't exist in prod.
- Verify with `yt-dlp --verbose ...` and look for `Optional libraries: yt_dlp_ejs-...` and `JS runtimes: deno-2.x.x` (no "(unsupported)" tag).

**Replit Secrets UI gotcha:** pasting a multi-line cookies.txt strips ALL newlines but preserves tabs. Re-insert newlines on the server. The correct normalization pattern:
```ts
const stripped = raw.replace(/\r?\n|\r/g, "");
const fixed = stripped.replace(
  /((?:#HttpOnly_)?\.?[a-zA-Z][a-zA-Z0-9._-]+\t(?:TRUE|FALSE)\t)/g,
  "\n$1"
);
await writeFile(path, "# Netscape HTTP Cookie File\n" + fixed.trimStart() + "\n");
```
**Critical**: use an unconditional replacement (no lookbehind on the preceding character). The comment section ends with spaces before the first domain, so any regex requiring a non-whitespace char immediately before the domain will silently fail and leave everything on one line — yt-dlp then rejects it as "invalid Netscape format".

**Symptom → cause cheat sheet:**
- "Sign in to confirm you're not a bot" → cookies missing/expired.
- "Requested format is not available" + `-F` shows only `sb*` → JS challenge unsolved (missing EJS plugin or wrong Deno version).
- "[music/cookies] 0 youtube cookies parsed" → newline-stripped secret, regex normalization didn't fire.
