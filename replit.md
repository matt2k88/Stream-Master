# Ultra Cast v3

A React Native (Expo) IPTV Player application with Xtream Codes API integration.

## Overview

TV-optimized IPTV streaming application with orange/black neon theme. Users can stream Live TV, Movies, and Series content from their IPTV provider using Xtream Codes API credentials. Server list is pulled from Supabase.

## Features

- **Login Screen**: Two-step login — pick server from Supabase DB list, then enter username/password
- **Auto Login**: Credentials are persisted per device (SecureStore on native, AsyncStorage on web). App logs in automatically on next launch.
- **Sync Screen**: On login/refresh, all categories and streams are fetched upfront. Shows an animated loading screen (LIVE TV / MOVIES / SERIES tiles) with progress bar.
- **Home Screen**: Left 50% = 2×2 button grid: top row Live TV + Movies (bigger), bottom row Series + TV Guide (smaller). Right 50% = Advert carousel + Search + Recently Watched. Refresh, Messages, Profile, and Account buttons in header.
- **TV Guide**: Full EPG grid screen. Left panel = live categories. Right = channel rows with time-based EPG blocks. EPG is fetched lazily per-category when that category is selected (not during initial sync) and cached in local state. Refresh button refetches current category only. Orange NOW line indicator. TV remote left/right keys scroll the timeline (never jump rows).
- **Advert Carousel**: Fetches from `/api/adverts`, auto-cycles every 5s with fade transition, dot indicators, fills the Coming Soon panel on both portrait and landscape.
- **Message System**: MessageContext checks for user-targeted messages on login + every 60s. Popup shows first unread message with dismiss → logs to `message_seen`. Messages bell button in header (with unread badge) opens MessagesScreen showing all system messages.
- **Category Browse**: Uses cached DataContext data — instant, no per-screen fetches
- **Content Lists**: Filtered from cached streams by category_id — instant navigation
- **Series Detail**: Season and episode navigation
- **Video Player**: Full-screen video playback with play/pause controls
- **Account Info**: Subscription details and logout
- **Favourites**: Long-press any item (live/movies/series) to toggle favourite. Orange star badge shows on favourited cards. Each category screen has a Favourites button with live count that opens a filtered view of your favourited content for that type. Favourites are stored per profile in Supabase.
- **ContentList Sidebar**: 170px left sidebar in ContentListScreen shows all categories (from DataContext cache) with full TV focus/hover states. For movies/series, "Recently Watched" is pinned at the very top, then "Favourites", then real categories. For live TV only "Favourites" is pinned. Selecting a category updates content instantly without leaving the screen.
- **Recently Watched Category (Movies/Series)**: Movies and Series CategoryScreens show a 50/50 row with "Recently Watched" (clock icon) on the left and "Favourites" (star icon) on the right, both with live counts. Tapping Recently Watched opens ContentListScreen filtered to all unique movies/series the active profile has ever played, ordered newest-first (deduped per stream/series). Tapping a movie resumes from saved `current_time`; tapping a series opens SeriesDetailScreen with `initialSeason` pre-selected from the latest watched episode of that series.
- **Live Preview Screen**: Tapping a live channel navigates to LivePreviewScreen — left side shows a mini VideoView (plays the stream), right side shows EPG (now + upcoming programmes from Xtream `get_short_epg` API, base64-decoded). "Watch Full Screen" button navigates to full PlayerScreen.
- **Player Favourite Button**: Star button in the PlayerScreen top bar. Press it to add/remove the current stream from Favourites. An animated toast notification confirms the action. Works on TV remote.
- **Previously Watched Adaptive**: RecentlyWatchedCard on HomeScreen measures its available height via onLayout and shows 2 items if space allows (≥130px), 1 item otherwise.
- **Continue Watching / Resume**: Player periodically saves `current_time` + `duration` to `recently_watched` (every ~10s, after the first 5s of playback). When playback enters the last 30s, the entry is marked `is_completed=true` (single-shot). The `recently_watched` table stores the **full lifetime watch history per profile** (no cap, deduped by stream_id). RecentlyWatchedCard on HomeScreen still surfaces only the top 2 deduped items. ContentListScreen cards (movies/series) and SeriesDetailScreen episode rows render a green WATCHED badge or orange CONTINUE badge + progress bar; tapping a movie/episode resumes from `current_time` automatically. All watch state is served from a single `WatchHistoryContext` with `getByStreamId` / `getBySeriesId` helpers — no per-screen fetches.
- **Series Favourites Header**: SeriesDetailScreen header now has a star toggle (right side) wired to `FavouritesContext` for `type="series"`, mirroring the long-press behaviour on grids.
- **PlayerScreen Seek Keys**: Android APK — D-pad left/right (keyCodes 21/22) and media rewind/ff (89/90) are caught via `onKeyDown` directly on the SeekBar Pressable. When the bar has focus and is in "captured" mode (default on focus), keys seek with hold-to-accelerate (5/10/20/40/60s steps). Pressing OK toggles "released" mode so D-pad can navigate to CC/Audio; re-focusing the bar re-arms capture. Web — ArrowLeft/ArrowRight always seek ±10s while the player is active (no focus check needed — player is fullscreen).
- **Watch Next Episode Prompt**: For series episodes, the Player pre-fetches the next episode (next ep in season, falling back to first ep of next numeric season). When within 30s of end an "UP NEXT" overlay appears with a 10s countdown that auto-`navigation.replace`s into the next episode's Player. The overlay is non-interactive (no buttons) so it never blocks remote/touch input on the player.
- **Card Rating Badge**: ContentListScreen rating moved to a dark pill overlaid top-right of the card thumbnail (kept uniform card heights and avoids cut-off when titles wrap to 2 lines).
- **App Version + Update Check**: Profile screen shows `v{expo.version}` under Switch Profile plus a "Check for Updates" button. Hits `GET /api/app-version` (Supabase `app_version` table) and alerts the user with the downloader code if a newer version is available.
- **Catch Up**: Dedicated screen for live TV channels with `tv_archive: 1`. Left sidebar = live categories filtered to those with catchup channels. Channel grid shows only archive-enabled channels with badge showing archive duration. Tapping a channel switches to programme view: horizontal day tabs (today → N days back, capped at 7, based on `tv_archive_duration`), programme list fetched via `get_simple_data_table` API (cached per channel). Tapping a programme plays it via timeshift URL (`/timeshift/{user}/{pass}/{duration}/{YYYY-MM-DD}:{HH-MM}/{streamId}.ts`) as a VOD in PlayerScreen.
- **HomeScreen Landscape Layout**: Left panel = two sub-columns: Column A (Live TV big | Catch Up small ~44px | TV Guide medium) + Column B (Movies top 50% | Series bottom 50%). Right panel = Advert carousel + Search + Recently Watched (unchanged).

## Database Migrations
SQL migrations the user must run in Supabase SQL Editor live under `migrations/`. Current pending:
- `migrations/001_continue_watching.sql` — adds `current_time`, `duration`, `is_completed`, `series_id`, `season_num`, `episode_num` to `recently_watched`
- `migrations/002_content_reports.sql` — creates `content_reports` table (id, profile_id, stream_id, stream_name, stream_type, reason, other_text, created_at)
- `migrations/003_category_prefs.sql` — creates `category_prefs` table (id, profile_id, type, order_ids text[], hidden_ids text[], updated_at) with unique (profile_id, type). Stores per-profile category organise prefs (order + hidden) for Live/Movies/Series so they sync across devices.

## Tech Stack

- **Frontend**: React Native with Expo (SDK 54)
- **Backend**: Express.js server (port 5000)
- **Navigation**: React Navigation 7+
- **State Management**: AuthContext (auth) + DataContext (all IPTV content cache)
- **Data Fetching**: TanStack React Query + direct xtreamApi calls in DataContext
- **Video Playback**: expo-video
- **Styling**: React Native StyleSheet, orange/black neon theme, expo-linear-gradient
- **Database**: Supabase (server-side only via SUPABASE_URL + SUPABASE_ANON_KEY secrets)

## Project Structure

```
client/
├── App.tsx                    # Main entry: AuthProvider > DataProvider > nav
├── contexts/
│   ├── AuthContext.tsx         # Auth state, credential persistence
│   └── DataContext.tsx         # All IPTV data cache + sync logic
├── lib/
│   ├── xtream-api.ts           # Xtream Codes API client
│   └── supabase.ts             # Supabase fetch helper (via Express proxy)
├── navigation/
│   └── RootStackNavigator.tsx  # Stack navigator + SyncScreen overlay
├── screens/
│   ├── LoginScreen.tsx         # 2-step: server picker → credentials
│   ├── HomeScreen.tsx          # Main menu, refresh button, landscape layout
│   ├── CategoryScreen.tsx      # Category listing (uses DataContext cache)
│   ├── ContentListScreen.tsx   # Stream listing + category sidebar (170px left panel)
│   ├── LivePreviewScreen.tsx   # Live channel mini-player + EPG (now/next)
│   ├── SeriesDetailScreen.tsx  # Series episodes
│   ├── PlayerScreen.tsx        # Full-screen player + favourite star button + toast
│   ├── TvGuideScreen.tsx       # EPG grid: categories + time-based channel guide
│   └── AccountInfoScreen.tsx   # Account details
├── components/
│   ├── SyncScreen.tsx          # Full-screen data sync overlay
│   └── ErrorBoundary.tsx       # App crash handler
├── constants/
│   └── theme.ts                # Orange/black neon theme, spacing, typography
└── hooks/

server/
├── index.ts                    # Express server entry
└── routes.ts                   # /api/servers (Supabase), /api/auth proxy
```

## Key Architecture

### DataContext Sync Flow
1. App starts → AuthContext loads saved credentials → sets `isAuthenticated=true`
2. DataContext sees auth=true, hasData=false → triggers sync automatically
3. SyncScreen overlay shown during sync (fetches live, movies, series sequentially)
4. After sync: `hasData=true`, overlay removed, Home screen is fully usable
5. Refresh button on Home → re-runs sync, shows overlay again

### Supabase Integration
- Server table: `server` (id, name, url, created_at)
- Express route `/api/servers` queries Supabase server-side (secrets never exposed to client)
- LoginScreen fetches server list via Express proxy

## Running the App

```bash
npm run all:dev
```

Starts Expo (port 8081) and Express (port 5000).

### Testing
- Scan QR code in terminal with Expo Go (Android) or Camera app (iOS)
- Web preview at localhost:8081

## Design

- **Orientation**: Landscape (locked, TV-optimized)
- **Theme**: Dark black (#080808) with orange (#FF6600) neon glow accents
- **Touch Targets**: Large buttons, TV remote compatible with focus/hover states
- **Safe Zones**: TV-safe padding using insets

## User Preferences

- No mock data — all content from real API
- Remember login per device (no "remember me" toggle needed)
- Landscape orientation by default
- All content pre-fetched on login for lag-free navigation
- Movies/Series buttons double-height in landscape/TV view
