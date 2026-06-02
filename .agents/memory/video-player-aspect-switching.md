---
name: Video player aspect-ratio live switching
description: Why native video surfaces (expo-video & VLC) need a keyed remount to apply aspect/contentFit changes live.
---

# Live aspect-ratio switching on native video players

Changing `contentFit` (expo-video) / `resizeMode`+aspect (react-native-vlc-media-player)
on an already-playing surface does NOT reliably re-apply on native — the picture
only changes after the surface is torn down and recreated (e.g. backing out of the
content and resuming). Android VLC additionally has effectively no `resizeMode`
support and its native prop names collide.

**Rule:** to switch aspect mode live, force a surface remount with `key={`asp-${mode}`}`
on the `VideoView` / `VLCPlayer`.

**Why:** prop-only updates are ignored by the native layer mid-playback.

**How to apply:**
- expo-video: remount only the `VideoView`. The player from `useVideoPlayer` is a
  separate object, so playback continues seamlessly across the remount.
- VLC: a remount reloads the stream, so stash the current position
  (`pendingSeekSecondsRef = currentTimeRef`, set `resumeAppliedRef = true`) on mode
  change; the `onLoad`/`onPlaying` handler re-seeks to resume.

**Forced ratios (16:9 / 4:3):** do NOT size the box with
`height:'100%' + aspectRatio + maxWidth:'100%'` — RN sizes this unreliably and the
letterboxing looks "off". Compute an explicit numeric `{width,height}` box fitted to
the window dimensions (centred parent gives correct letter/pillarbox), with
`contentFit:'fill'` so the decoded frame is forced to that exact ratio. Shared helper:
`aspectInnerStyle(mode, w, h)` in `client/lib/aspect-ratio.ts`.
