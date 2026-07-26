---
name: Metro web platform resolution
description: Metro must have 'web' in resolver.platforms for .web.tsx files to be preferred on the web bundle.
---

## Rule
`metro.config.js` must explicitly add `'web'` to `config.resolver.platforms`.

**Why:** Expo's `getDefaultConfig` only sets `platforms: ['ios', 'android']`. Without `'web'` in the list, Metro never applies platform-suffix resolution for the web bundle — files like `video-player.web.tsx` are ignored, and the native `video-player.tsx` (which has top-level `import * as VlcPkg from "react-native-vlc-media-player"`) loads in the browser, crashing it.

**How to apply:** In `metro.config.js`, inside the `config.resolver = { ... }` block:
```js
platforms: [...(config.resolver.platforms ?? ['ios', 'android']), 'web'],
```

This is safe — Metro uses the *current* request's `?platform=` param when deciding which suffix to prefer, so adding 'web' to the list doesn't affect native builds.
