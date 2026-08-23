---
name: Android SAF offline playback
description: How selected Android download folders interact with the offline player.
---

Downloads selected through Android's Storage Access Framework are stored as durable `content://` document URIs, not app-private file paths.

**Why:** The app-private filesystem is only suitable as a temporary staging area because Expo's resumable download API requires a file destination. VLC's existing bridge is optimized for provider network streams and does not reliably open persisted SAF document URIs. Expo/Media3 supports Android document URIs directly.

**How to apply:** Require a selected SAF folder before a new Android download starts, copy the staged file into that folder after completion, persist the resulting document URI as the offline media source, and force offline playback through the Expo/Media3 engine. Do not attach HTTP request headers to local `file://` or `content://` sources.

When a provider reports an MKV source, asking it for an `.mp4` URL is only an availability probe, not a conversion. Accept the result only after checking for an MP4 container signature; never rename or label MKV bytes as MP4. If the provider cannot deliver valid MP4, real conversion needs an explicit native transcoder and codec-compatibility decision.