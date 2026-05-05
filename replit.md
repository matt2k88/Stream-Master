# Ultra Cast v3

A React Native (Expo) IPTV Player application with Xtream Codes API integration.

## Overview

TV-optimized IPTV streaming application with orange/black neon theme. Users can stream Live TV, Movies, and Series content from their IPTV provider using Xtream Codes API credentials. Server list is pulled from Supabase.

## Features

- **Login Screen**: Two-step login — pick server from Supabase DB list, then enter username/password
- **Auto Login**: Credentials are persisted per device (SecureStore on native, AsyncStorage on web). App logs in automatically on next launch.
- **Sync Screen**: On login/refresh, all categories and streams are fetched upfront. Shows an animated loading screen (LIVE TV / MOVIES / SERIES tiles) with progress bar.
- **Home Screen**: Left 50% = large Live TV button + doubled-height Movies/Series row (landscape). Right 50% = Advert carousel (images from Supabase `adverts` table, 16:9, auto-cycling with dots). Refresh, Messages, Profile, and Account buttons in header.
- **Advert Carousel**: Fetches from `/api/adverts`, auto-cycles every 5s with fade transition, dot indicators, fills the Coming Soon panel on both portrait and landscape.
- **Message System**: MessageContext checks for user-targeted messages on login + every 60s. Popup shows first unread message with dismiss → logs to `message_seen`. Messages bell button in header (with unread badge) opens MessagesScreen showing all system messages.
- **Category Browse**: Uses cached DataContext data — instant, no per-screen fetches
- **Content Lists**: Filtered from cached streams by category_id — instant navigation
- **Series Detail**: Season and episode navigation
- **Video Player**: Full-screen video playback with play/pause controls
- **Account Info**: Subscription details and logout
- **Favourites**: Long-press any item (live/movies/series) to toggle favourite. Orange star badge shows on favourited cards. Each category screen has a Favourites button with live count that opens a filtered view of your favourited content for that type. Favourites are stored per profile in Supabase.
- **ContentList Sidebar**: 170px left sidebar in ContentListScreen shows all categories (from DataContext cache) with full TV focus/hover states. "Favourites" is always pinned at the top. Selecting a category updates content instantly without leaving the screen.
- **Live Preview Screen**: Tapping a live channel navigates to LivePreviewScreen — left side shows a mini VideoView (plays the stream), right side shows EPG (now + upcoming programmes from Xtream `get_short_epg` API, base64-decoded). "Watch Full Screen" button navigates to full PlayerScreen.
- **Player Favourite Button**: Star button in the PlayerScreen top bar. Press it to add/remove the current stream from Favourites. An animated toast notification confirms the action. Works on TV remote.
- **Previously Watched Adaptive**: RecentlyWatchedCard on HomeScreen measures its available height via onLayout and shows 2 items if space allows (≥130px), 1 item otherwise.

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
