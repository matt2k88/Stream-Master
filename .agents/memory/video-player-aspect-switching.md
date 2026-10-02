---
name: Video player aspect-ratio live switching
description: Device-tested player handoff supersedes earlier advice to remount video surfaces for aspect changes.
---

# Live aspect-ratio switching on native video players

Do not reintroduce aspect-keyed remounts of the Expo video surface.

**Why:** The supplied externally tested player handoff reports that these remounts
crashed on Fire TV; its tests cover Fire TV, phone and BlueStacks. This supersedes
the previous assumption that a remount was necessary.

**How to apply:** Preserve the supplied live aspect-switching implementation.
VLC Android does not implement the library's JavaScript `resizeMode` prop;
its native aspect controls must not be replaced with that prop.

For this externally tested player handoff, the user's instruction is:
"Copy these files in, overwriting. Do not rewrite, re-implement or improve anything."

**Why:** The user explicitly required exact copies, and the handoff notes describe
subtle device regressions caused by seemingly equivalent rewrites.

**How to apply:** Treat these supplied player files as authoritative. Do not
recreate them from prose or use old memory to override their tested behaviour.
