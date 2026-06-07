---
name: VLC hardware-decode preference
description: How the per-profile player_hw_decode (auto/on/off) maps to libVLC flags across the two different VLC playback paths.
---

Per-profile `player_hw_decode` ("auto" | "on" | "off") controls VLC hardware
decoding so users can rescue devices whose hardware decoder produces
green/garbled frames, stutter, or no audio (other VLC apps work fine there).

**Flag mapping differs between the two VLC paths — keep them in sync conceptually but NOT literally:**
- Bridge path (`video-player.tsx`, used by live/expo-fallback/iOS/web): `buildVlcInitOptions(hw)` →
  - `auto` → add NO `--avcodec-hw` flag (this is the only way to truly preserve prior behaviour)
  - `on` → `--avcodec-hw=any`
  - `off` → `--avcodec-hw=none`
- Raw Android VOD screen (`VlcPlayerScreen.tsx`): the default chain is
  `--codec=mediacodec_ndk,mediacodec,all` + `--avcodec-hw=mediacodec` (needed for 4K/HDR).
  - `auto` and `on` are intentionally EQUIVALENT here → keep the mediacodec chain
  - `off` → `--codec=all` + `--avcodec-hw=none` (pure software)

**Why:** "auto" must mean "no change from before" on every path, so it must
*omit* the flag on the bridge path rather than pass a value. The Expo engine
ignores hwDecode entirely.

**How to apply:** Preference is captured at MOUNT via a ref (same lifecycle as
the engine choice); it applies on the next stream session, not mid-playback.
The Android VOD `source` useMemo deps are `[streamUrl]` on purpose — the ref is
read at mount only. Persisted via `PUT /api/profiles/:id` (whitelist +
`migrations/020_player_hw_decode.sql`, default 'auto') and guest AsyncStorage.
