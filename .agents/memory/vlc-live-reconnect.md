---
name: VLC live channel auto-reconnect
description: Why frozen live VLC streams don't self-recover and the three-part fix pattern.
---

# VLC live channel freeze / auto-reconnect

Live channels can freeze after a long session (≈3h) because the **provider's Xtream
connection cap** drops the stream server-side — there is NO 3h timer in our code. The
default engine for live is VLC (via the unified `useVideoPlayer` bridge in
`PlayerScreen` and `LivePreviewScreen`; standalone `VlcPlayerScreen` is VOD-only).

A frozen VLC stream historically never recovered because of three independent gaps —
all three must be addressed together:

1. **Missing `--http-reconnect`** in the shared VLC init options. Without it libvlc
   sits on the last decoded frame forever instead of reopening the dropped HTTP(S)
   connection. The VOD path already had it; the shared `DEFAULT_INIT_OPTIONS` did not.

2. **Stall-watchdog gate short-circuit.** The gate `if (!player.playing) { reset; return; }`
   defeats the currentTime-stagnation detector, because a frozen VLC reports
   **not-playing**, so the watchdog resets every tick and never fires.
   **Fix:** make the gate engine-aware — for VLC reset ONLY on an explicit user pause
   (`player._paused`, which the bridge maintains in `play()`/`pause()`), otherwise fall
   through so a frozen-but-not-paused stream trips the reload. Keep `!player.playing`
   for the expo engine (there it also legitimately covers buffering).

3. **`playToEnd` dead-ends.** A live stream never legitimately ends, so a `playToEnd`
   (bridge `_onEnd`) on live = a clean-stop disconnect. Route it into the existing
   reconnect backoff. In `PlayerScreen` guard with `if (!isLive) return` so VOD
   next-episode/completion is untouched; `LivePreviewScreen` is always live.

**Why:** the three reconnect signals (statusChange:error, stall watchdog, playToEnd)
are complementary — a disconnect can surface as any one of them, and only error was
wired before. Both screens' retry schedulers clear existing timers before re-arming,
so multiple signals landing together advance the attempt counter but don't spawn
parallel reconnect loops.

**How to apply:** any new live playback surface on the VLC bridge needs all three, and
must not assume `!player.playing` means "stop counting" for VLC.
