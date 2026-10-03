# Ultra Cast v3 — live TV redesign, remote fixes, hold-to-favourite

**Do not re-implement, re-derive or "improve" anything here. Copy the files in, overwriting.
That is the whole job.** Supersedes every earlier handoff.

Every file is byte-identical to the build confirmed working on a Fire TV Stick.
**The app version stays 3.0.3 — deliberately. Do not bump it.** No new dependencies.

---

## How to apply

Copy all 14 files into the repo at the same path, overwriting. Nothing else. Do not copy an
`android/` folder — it is generated.

---

## Files

### New (4)

| File | What it is |
|---|---|
| `client/components/LiveChannelRow.tsx` | A live channel as a row: logo, name, what's on now, progress |
| `client/lib/channel-name.ts` | Splits "FHD"/"5.1" markers out of channel names into badges |
| `client/lib/epg-cache.ts` | Shared, concurrency-capped, cached "what's on now" lookup |
| `client/lib/tv-long-press.ts` | Hold-OK-to-favourite on a remote |

### Changed (10)

`client/components/player/ControlButton.tsx` · `client/contexts/DataContext.tsx` ·
`client/lib/player-fonts.ts` · `client/lib/tv-event-handler.ts` ·
`client/screens/ContentListScreen.tsx` · `client/screens/LivePreviewScreen.tsx` ·
`client/screens/PlayerScreen.tsx` · `client/screens/VlcPlayerScreen.tsx` ·
`modules/tv-remote/android/src/main/java/expo/modules/tvremote/TvRemoteModule.kt` ·
`plugins/withTvRemoteKeys.js`

---

## The traps — read before changing any of this

**`plugins/withTvRemoteKeys.js` must REPLACE its injected block, never skip when one exists.**
It used to bail out if `TvRemoteKeyBus` already appeared in `MainActivity.kt`. Since the first version
had been injected long before, every later change to that plugin was silently discarded: `prebuild` ran,
the plugin ran, saw its own marker, and kept the old code. New native key handling compiled into the app
and was never called — nothing failed, nothing logged, it simply did nothing. The block is now fenced by
`// @ultracast-tv-remote begin/end` sentinels and replaced every time. **This cost several rounds of
"fixed" builds that could not possibly have worked.**

**Hold-to-favourite is timed, not repeat-counted.** `onPressIn`/`onPressOut`/`onLongPress` ride React
Native's *touch* system; a remote never produces a touch. The first native attempt waited for Android key
repeats, which plenty of Fire TV and HDMI-CEC remotes never send. It now measures how long OK was held
(600ms) and fires on threshold or on release, then swallows the key-up so the item does not also open.

**EPG is fetched from inside the row, on purpose.** Xtream has no bulk "now playing" endpoint —
`get_short_epg` is one request per channel — so a whole-library prefetch would be thousands of requests.
FlashList only mounts rows that are on screen, so the viewport caps the work for free. Concurrency is
capped at 4 (the provider throttles above that and returns empties), results held 10 minutes, empty
answers cached so dead channels are not retried, cleared on re-sync. **Do not turn this into a bulk
prefetch.**

**Manage mode keeps the old cards AND the old grid geometry.** The cards own the add-to-favourites /
add-to-group picker. Rows and cards are chosen by one flag, `liveAsRows`, which also drives `numColumns`
and `cardTotalH` — when those disagreed, Manage rendered cards into a 78px row box and the buttons
vanished. Keep the flag as the single source for both.

**Preview screen layout — three load-bearing properties:**

1. **`flexBasis: "100%"` on the guide, not `flex: 1` or `width: "100%"`.** `flex: 1` sets basis 0%, and
   in a wrapping row the *basis* decides line placement — basis 0 means "I fit here", so the guide sat
   beside the picture instead of below it.
2. **`alignContent: "flex-start"`.** `"stretch"` shares leftover height between the lines and opens a
   gap under the picture.
3. **The `VideoView` must stay the first child of `rightPanel`.** Everything else was added as later
   siblings. Wrapping it in a container to lay it out tears down the SurfaceView and reloads the stream.

**Buttons under the progress bar must not wrap or overflow.** Compact size, no flexible spacer between
them, `flexWrap: "nowrap"`, short label on the primary and icon-only for Favourite and Report. Stacking
pushed the column down; wrapping was fixed by shortening, not by allowing a second line.

**Quality badges are parsed conservatively.** Only known trailing tokens move (SD/HD/FHD/UHD/4K/5.1 and
similar); anything else stays in the name. Widening that list is how channel names get mangled.

**The info beside the picture reads the PLAYING channel** (`selectedId` via the EPG cache), not
`epgListings`, which follows the hovered channel and made the panel describe something not on screen.
`epgListings` still drives the guide, which *should* follow the hover.

**"UP NEXT" applies to one programme** — the one after the current. It used to label every future row.

**Fonts load per weight.** Importing from `@expo-google-fonts/archivo` root pulls every weight in the
family (3.7MB of unused .ttf). The per-weight subpaths bundle one file each.

---

## Checking it worked

```
npx tsc --noEmit 2>&1 | grep -c '^client/'
```

**42** — the pre-existing count, unrelated to this work. It must not go up.

On a device:

1. Live channel list shows rows with what's on; scrolling a big category stays smooth as listings fill in
2. Preview: guide full width below, channel info to the right, three buttons on one line
3. Scrolling the channel list changes the guide but **not** the programme beside the picture
4. Full screen and back keeps playing — no reload, no re-buffer
5. Hold OK to favourite — in the channel list, the content grids and the preview sidebar; a normal press
   still opens the item
6. **Manage** on the channel list still shows the cards with add-to-favourites / add-to-group
