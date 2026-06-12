---
name: findNodeHandle on react-native-web
description: findNodeHandle throws on web and surfaces as an app-crash; guard it.
---

`findNodeHandle(ref.current)` is NOT supported on react-native-web — it throws
`findNodeHandle is not supported on web`, which bubbles up as an unhandled
runtime error and gets flagged by the platform as "the Mobile App artifact
crashed".

**Why:** We only call findNodeHandle to wire native Android-TV directional focus
(`nextFocus*` props). On web those tags are meaningless, but the throw still
breaks the page.

**How to apply:** Never call findNodeHandle unguarded. Either wrap with a helper
that returns null on web (`Platform.OS === "web" ? null : findNodeHandle(node)`)
or gate the call site with `Platform.OS !== "web"`. After fixing, do a CLEAN
dev-server restart before trusting logs — HMR hot-swaps can momentarily throw a
red-herring `Cannot destructure property 'StyleSheet' of 'ReactNative.default'`
that disappears on full reload.
