# Ultra Cast v3 — Feature Reference

Detailed behaviour notes for each feature. `replit.md` keeps the short
summaries; this file holds the full implementation detail.

## Auth & Sync

- **Login Screen**: Two-step login — pick server from Supabase DB list, then enter username/password.
- **Auto Login**: Credentials are persisted per device (SecureStore on native, AsyncStorage on web). App logs in automatically on next launch.
- **Sync Screen**: On login/refresh, all categories and streams are fetched upfront. Shows an animated loading screen (LIVE TV / MOVIES / SERIES tiles) with progress bar.

## Home & Navigation

- **Home Screen**: Left 50% = 2×2 button grid: top row Live TV + Movies (bigger), bottom row Series + TV Guide (smaller). Right 50% = Advert carousel + Search + Recently Watched. Refresh, Messages, Profile, and Account buttons in header.
- **HomeScreen Landscape Layout**: Left panel = two sub-columns: Column A (Live TV big | Catch Up small ~44px | TV Guide medium) + Column B (Movies top 50% | Series bottom 50%). Right panel = Advert carousel + Search + Recently Watched (unchanged).
- **Advert Carousel**: Fetches from `/api/adverts`, auto-cycles every 5s with fade transition, dot indicators, fills the Coming Soon panel on both portrait and landscape.
- **Category Browse**: Uses cached DataContext data — instant, no per-screen fetches.
- **Content Lists**: Filtered from cached streams by category_id — instant navigation.
- **ContentList Sidebar**: 170px left sidebar in ContentListScreen shows all categories (from DataContext cache) with full TV focus/hover states. For movies/series, "Recently Watched" is pinned at the very top, then "Favourites", then real categories. For live TV only "Favourites" is pinned. Selecting a category updates content instantly without leaving the screen.
- **Card Rating Badge**: ContentListScreen rating is a dark pill overlaid top-right of the card thumbnail (keeps uniform card heights, avoids cut-off when titles wrap to 2 lines).

## Playback & Watch History

- **Video Player**: Full-screen video playback with play/pause controls.
- **Series Detail**: Season and episode navigation.
- **Live Preview Screen**: Tapping a live channel navigates to LivePreviewScreen — left side shows a mini VideoView (plays the stream), right side shows EPG (now + upcoming programmes from Xtream `get_short_epg` API, base64-decoded). "Watch Full Screen" button navigates to full PlayerScreen.
- **Continue Watching / Resume**: Player periodically saves `current_time` + `duration` to `recently_watched` (every ~10s, after the first 5s of playback). When playback enters the last 30s, the entry is marked `is_completed=true` (single-shot). The `recently_watched` table stores the **full lifetime watch history per profile for movies/series** (no cap, deduped by stream_id). **Live TV is capped at 20 entries per profile** — server trims older live rows on every insert, movies/series remain uncapped.
- **Watch Badges**: RecentlyWatchedCard on HomeScreen surfaces the top 2 deduped items. ContentListScreen cards (movies/series) and SeriesDetailScreen episode rows render a green WATCHED badge or orange CONTINUE badge + progress bar; tapping a movie/episode resumes from `current_time` automatically. All watch state is served from a single `WatchHistoryContext` with `getByStreamId` / `getBySeriesId` / `removeOne` helpers — no per-screen fetches.
- **Previously Watched Adaptive**: RecentlyWatchedCard on HomeScreen measures its available height via onLayout and shows 2 items if space allows (≥130px), 1 item otherwise.
- **Recently Watched Category (Movies/Series)**: Movies and Series CategoryScreens show a 50/50 row with "Recently Watched" (clock icon) left and "Favourites" (star icon) right, both with live counts. Tapping Recently Watched opens ContentListScreen filtered to all unique movies/series the active profile has ever played, newest-first (deduped per stream/series). Tapping a movie resumes from saved `current_time`; tapping a series opens SeriesDetailScreen with `initialSeason` pre-selected from the latest watched episode.
- **PlayerScreen Seek Keys**: Android APK — D-pad left/right (keyCodes 21/22) and media rewind/ff (89/90) are caught via `onKeyDown` directly on the SeekBar Pressable. When the bar has focus and is in "captured" mode (default on focus), keys seek with hold-to-accelerate (5/10/20/40/60s steps). Pressing OK toggles "released" mode so D-pad can navigate to CC/Audio; re-focusing the bar re-arms capture. Web — ArrowLeft/ArrowRight always seek ±10s while the player is active.
- **Watch Next Episode Prompt**: For series episodes, the Player pre-fetches the next episode (next ep in season, falling back to first ep of next numeric season). Within 30s of end an "UP NEXT" overlay appears with a 10s countdown that auto-`navigation.replace`s into the next episode's Player. The overlay is non-interactive so it never blocks remote/touch input.

## Favourites & Manage

- **Favourites**: Long-press any item (live/movies/series) to toggle favourite. Orange star badge shows on favourited cards. Each category screen has a Favourites button with live count that opens a filtered view of that type. Favourites are stored per profile in Supabase.
- **Series Favourites Header**: SeriesDetailScreen header has a star toggle (right side) wired to `FavouritesContext` for `type="series"`, mirroring the long-press behaviour on grids.
- **Player Favourite Button**: Star button in the PlayerScreen top bar adds/removes the current stream from Favourites, with an animated toast confirmation. Works on TV remote.
- **Manage Mode (TV-remote individual delete)**: ContentListScreen header has a "Manage / Done" toggle (next to Clear All). When active, single-press OK on a focused card performs an inline action — fully D-pad friendly:
  - Favourites view → removes that favourite
  - Recently Watched view → deletes that single watch entry (`DELETE /api/recently-watched/:id`)
  - Normal categories → toggles favourite (replaces the unreliable long-press for D-pad TV remotes)
  Cards in Manage mode show a red ✕ badge (delete) or orange ★/+ badge (favourite). Long-press still works for touch users.

## TV Guide & Catch Up

- **TV Guide**: Full EPG grid screen. Left panel = live categories. Right = channel rows with time-based EPG blocks. EPG is fetched lazily per-category when that category is selected (not during initial sync) and cached in local state. Refresh button refetches current category only. Orange NOW line indicator. TV remote left/right keys scroll the timeline (never jump rows).
- **Catch Up**: Dedicated screen for live TV channels with `tv_archive: 1`. Left sidebar = live categories filtered to those with catchup channels. Channel grid shows only archive-enabled channels with a badge showing archive duration. Tapping a channel switches to programme view: horizontal day tabs (today → N days back, capped at 7, based on `tv_archive_duration`), programme list fetched via `get_simple_data_table` API (cached per channel). Tapping a programme plays it via timeshift URL (`/timeshift/{user}/{pass}/{duration}/{YYYY-MM-DD}:{HH-MM}/{streamId}.ts`) as a VOD in PlayerScreen.

## Messaging & Updates

- **Message System**: MessageContext checks for user-targeted messages on login + every 60s. Popup shows first unread message with dismiss → logs to `message_seen`. Messages bell button in header (with unread badge) opens MessagesScreen showing all system messages.
- **App Version + Update Check**: Profile screen shows `v{expo.version}` under Switch Profile plus a "Check for Updates" button. Hits `GET /api/app-version` (latest row from Supabase `app_versions`, ordered by `released_at`) and alerts with the downloader code if a newer version is available.
- **What's New / Known Issues modal**: Profile "What's New" button opens a modal with two tabs. **What's New** fetches `GET /api/app-versions` + `GET /api/app-notes` and renders one section per version (newest first by `released_at`), with the version's change-type notes underneath — `app_notes.version_id` is the FK to `app_versions.id`. The most recent version gets a "LATEST" pill. **Known Issues** is global (notes with `type='issue'` and no `version_id`) in its own tab with a count badge.

## Account & Referrals

- **Account Info**: Subscription details and logout.
- **Referrals**: ReferralsScreen (reached via a "Referrals" ActionTile in AccountInfoScreen) shows referral stats, the user's referral code (copy or generate), how-it-works, store callout, promo tip, a Referral Notice warning, and a **Referral History** log. All data comes from the secondary **lifetime** Supabase (`lifetimeDb`) keyed by the Xtream username. Server routes: `GET /api/referrals?username=` (reads `profiles.referral_code/referral_count/referral_tokens`), `POST /api/referrals/generate` (RPC `create_referral_code_for_user`), and `GET /api/referrals/history?username=` (reads `referral_logs` where `referrer_username` = username, newest first, capped 200). Landscape layout: stats + code in a 33/33/33 row; "How it works" + "Referral Notice" 50/50.

## Football

- **Live Football Scores**: A football icon button in the Live TV fullscreen player top bar (next to Report; both VLC + Expo engines route through LivePreviewScreen's fullscreen overlay) toggles a floating, semi-transparent `FootballScoreTracker` overlay. The tracker is corner-positioned (per-profile choice of 6 corners), `pointerEvents="none"`, shows a per-profile number of visible lines (1–6, default 5, `football_prefs.visible_lines`) with an auto-scroll loop (down then back up), team names + score + minute (or HT/FT), lingers ~15min on FT games, and shows "No live games" when empty. It persists when player controls auto-hide (`showFootball` independent of `showFsOverlay`). The button only appears when the profile has the tracker enabled **and** the admin global switch is on.
  - **Global kill-switch**: a singleton Supabase `football_global` row (migration 013, read via `GET /api/football/global`, cached once on mount in `FootballContext` as `globalEnabled`) disables the whole feature for every client when `enabled=false` — the profile tile is hidden, the in-player button never shows, the tracker never fetches, and the server poller skips its api-football call — all regardless of each profile's `football_prefs.enabled`. Defaults to enabled and degrades gracefully until migration 013 is run.
  - **Settings**: `FootballSettingsScreen` (reached via an ActionTile in AccountInfoScreen) has an enable toggle, a broadcast-delay notice (scores can be slightly ahead of the delayed TV stream and may reveal a goal early), a grouped league/competition picker (incl. a "None (off)" option), a "Scorelines Shown" 1–6 picker, and a 6-corner picker — all TV-remote focusable. Prefs are per-profile in Supabase `football_prefs`.
  - **Server poller** (`server/football.ts`, started in `server/index.ts`) hits api-football `fixtures?live=all` (1 request = all live games) on an adaptive interval (~60s active, 5min idle), upserts to Supabase `football_scores`, marks vanished unfinished fixtures as FT, and purges finished rows after ~15min. It skips gracefully when `API_FOOTBALL_KEY` is missing and logs (without crashing) until migration 009 is run. Clients read the cached DB scores every 30s via `FootballContext` and never call api-football directly. API base `https://v3.football.api-sports.io`, header `x-apisports-key`, secret `API_FOOTBALL_KEY`.
  - **GOAL alerts**: the client detects a goal when a fixture's total score increases between polls — it flashes that row green (~15s) and adds a "GOAL!" announcement line below the ticker (~22s linger, up to 3 lines). The announcement shows scorer + minute when available: the server fetches `/fixtures/events` at most once per scoring fixture per poll and stores it in the `last_goal_*` columns (migration 012).

- **Football Centre**: Dedicated `FootballCentreScreen` reached via a football (soccer ball) icon button in the HomeScreen header, **between the Refresh and VPN buttons**. The button only shows when the global kill-switch (`football_global.enabled`, via `FootballContext.globalEnabled`) is on. Two tabs:
  - **Live Now** — live scores from the server-maintained `football_scores` cache, curated leagues via `GET /api/football/centre/scores`. Polls scores + channels every 30s while focused (`SCORES_POLL_MS = 30000`), so scores and minute/HT/FT labels update without leaving the screen.
  - **Upcoming** — fixtures from the `football_fixtures` cache via `GET /api/football/centre/fixtures`, fetched once on focus. Shows a `ChannelNotice` banner warning that TV channels aren't confirmed until a few hours before kick-off. Game time pills read `Kick Off HH:MM` (`kickoffLabel()`).
  - **Collapsible league groups** (`CollapsibleLeague`): a TV-remote-focusable `Touchable` header showing a chevron (right=collapsed, down=expanded), optional pref-league star, a game-count badge, then the league name (count sits to the **left** of the name). **All groups start collapsed** (`expandedGroups` Set, default empty; keys `live-<leagueId>` and `up-<dateKey>-<leagueId>`). Headers show a distinct focus/hover overlay (`leagueHeaderActive`, brighter than the pref-league tint) for D-pad navigation.
  - **Grouping/order**: both views group by league, ordered English-first via `leagueRank()` from `client/constants/football-leagues.ts` (`CURATED_LEAGUE_IDS`, incl. Finland's Ykkönen, api-football id 245, under "Other Leagues"); Upcoming additionally groups by day (Today/Tomorrow/weekday). Any fixture present in the live `football_scores` cache is excluded from Upcoming (`liveIds` filter) so an in-progress game only appears under Live Now.
  - **MatchCard**: responsive grid (`cardGrid` wrap; per-card width from `useWindowDimensions`, caps at 3–4 per row, a single match never spans full width). Right-aligned status pill (green live minute/HT/FT, accent Upcoming kickoff), home/away on two stacked lines each with team **badge/logo** (api-football logo URL via `expo-image` ~22px, same-size placeholder spacer when missing), score right-aligned (Live only), then channel badges footer.
  - **TV-channel links**: `football_fixture_channels` maps `fixture_id → channel_name + stream_id` (populated externally). Linked fixtures render a green channel badge; tapping it deep-links to `LivePreview` (resolves stream from `DataContext.liveStreams` by `stream_id`, builds URL via `xtreamApi.getLiveStreamUrl`). Fetched via `GET /api/football/centre/channels` (optional `?fixture_ids=` filter). If `stream_id` isn't found, the badge still shows but tapping shows "channel unavailable". On a `MatchCard` the channel badges are a **sibling below** the pressable card body (not nested), so tapping a channel never also opens the detail popup.
  - **Game detail popup** (live games only): the card body of a **live** `MatchCard` is a focusable `Touchable` (`onCardPress`, shown with a bar-chart hint icon + `cardPressableActive` overlay); pressing it opens `GameDetailModal` for that fixture. The modal header shows league, both teams/logos, the score + minute, and three TV-remote-focusable tabs: **Team Stats** (two-column home/stat/away table), **Lineups** (per-team formation, coach, Starting XI + Substitutes), and **Events** (timeline of goals/cards/subs with minute + icon). A **Watch Live** button appears at the top **only when the fixture has a linked channel** — it uses the **first** channel (`watchChannel = chans[0]`) and reuses the same `LivePreview` deep-link as the badges; hidden entirely when no channel exists. Detail is fetched on open via `GET /api/football/centre/fixture/:id`; tabs degrade to friendly "not available yet" messages. Upcoming cards are **not** clickable for detail.
  - **Server side**: `server/football.ts` exports `CURATED_LEAGUE_IDS` and `refreshUpcomingFixtures()` (next 7 days via ~7 `/fixtures?date=` calls/day, curated filter, upserts to `football_fixtures`, purges past days), guarded by the kill-switch and a 24h `lastFixturesFetch` interval (`maybeRefreshFixtures()` in the poller loop). It also exports `fetchFixtureDetail(fixtureId)` backing `GET /api/football/centre/fixture/:id` — three on-demand api-football calls (`/fixtures/statistics`, `/fixtures/lineups`, `/fixtures/events`) run in parallel **only when a user opens a game**, guarded by the kill-switch + `API_FOOTBALL_KEY` and cached in-memory for 20s (with expired-entry pruning) to absorb quick re-opens / the 30s screen poll. All centre endpoints degrade to `[]`/empty when the key/tables are missing.

## Theming

- **Holiday Themes (admin-controlled)**: Whole-app dashboard imagery + accent palette are driven by a single Supabase `app_theme` row the admin flips from an external panel. Clients fetch `GET /api/app-theme` on launch (cached in AsyncStorage) and apply the palette. Keys: `default` (orange/black neon), `halloween`, `bonfire`, `christmas`, `valentines`, `newyear`. Themed icon PNGs live under `assets/images/themes/{theme}/{liveTv,movies,series,catchUp,tvGuide}.png`; dashboard buttons swap to themed images via `ThemeContext`. The accent palette mutation updates inline runtime references (dynamic icon colour, count chip, header chevrons), but **module-scope `StyleSheet.create` styles are frozen at import and keep the original orange** — accepted by design (VPN badge / profile selector / branded surfaces stay orange). No in-app toggle — flip `app_theme.theme_key` and clients pick it up on next launch. DB row enforces a CHECK constraint so only the 6 valid keys are allowed.

## Android Min SDK / Fire OS 6 Compatibility

`app.json` sets `minSdkVersion: 24` (Android 7.0). The VLC player library
(`react-native-vlc-media-player`) declares minSdk 26, so the
`plugins/withVlcMinSdkOverride.js` config plugin injects
`tools:overrideLibrary="com.yuanzhou.vlc"` into the merged AndroidManifest
to let the APK install on API 24/25 devices anyway. To prevent VLC from
actually loading on those devices (its native code crashes on Android 7.x),
`client/lib/video-player.tsx` checks `Platform.Version < 26` at runtime and
transparently routes the player to the Expo engine instead. Net effect:
Fire OS 6 sticks (1st-gen Fire TV 4K) install and run the app, but lose
AC3/EAC3 surround channels that only VLC handles.
