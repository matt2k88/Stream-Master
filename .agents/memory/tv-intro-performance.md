---
name: TV intro interaction constraints
description: Device-specific reasons to keep focusable screens and catalogue parsing out of the intro.
---

Do not mount focusable app screens underneath an intro overlay on Android TV.
An overlay covering those screens does not reliably prevent D-pad focus.

**Why:** The user supplied a device-tested performance update reporting that
pressing OK to skip the intro on Fire TV also selected a hidden profile card,
making the profile picker appear to be skipped. The same update reported that
large catalogue parsing during the intro stalled the JavaScript thread and
made Skip focus sluggish, despite working acceptably on phones.

**How to apply:** Let lightweight account restoration run during the intro, but
hold screen mounting and expensive catalogue/cinema startup until it finishes.
Preserve this separation when changing intro replay, startup or theme behaviour.
Browser checks can confirm mount/request ordering, but do not establish native
Fire TV D-pad responsiveness or video-playback performance.