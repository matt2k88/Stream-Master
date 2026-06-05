---
name: Overlaying UI above the native video player
description: How to guarantee an RN overlay renders above the fullscreen video on Fire TV/Android
---

# Overlaying UI above native video

A root-mounted `position:absolute` View with high zIndex/elevation is NOT reliably
painted above the native video SurfaceView (expo-video / VLC) on Android / Fire OS —
the video punches through and hides the overlay.

**Rule:** wrap any overlay that must appear over the fullscreen player in a
transparent React Native `<Modal transparent statusBarTranslucent>`. The Modal lives
in a separate top-most native window, so it always renders above the video surface
and on every screen.

**Why:** native SurfaceViews sit in their own z-order layer that ignores RN view
z-index; only a separate window (Modal/dialog) is guaranteed above them.

**How to apply:** used for `MatchReminderOverlay`. Tradeoff: while the Modal is
visible it owns touch focus for its window, so underlying player controls aren't
tappable until dismissed — acceptable for a transient banner.
