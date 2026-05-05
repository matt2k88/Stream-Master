# Ultra Cast v3

A React Native (Expo) IPTV Player application with Xtream Codes API integration.

## Overview

TV-optimized IPTV streaming application with orange/black neon theme. Users can stream Live TV, Movies, and Series content from their IPTV provider using Xtream Codes API credentials. Server list is pulled from Supabase.

## Features

- **Login Screen**: Two-step login — pick server from Supabase DB list, then enter username/password
- **Auto Login**: Credentials are persisted per device (SecureStore on native, AsyncStorage on web). App logs in automatically on next launch.
- **Sync Screen**: On login/refresh, all categories and streams are fetched upfront. Shows an animated loading screen (LIVE TV / MOVIES / SERIES tiles) with progress bar.
- **Home Screen**: Left 50% = large Live TV button + doubled-height Movies/Series row (landscape). Right 50% = Coming Soon panel. Refresh button + Account button in header.
- **Category Browse**: Uses cached DataContext data — instant, no per-screen fetches
- **Content Lists**: Filtered from cached streams by category_id — instant navigation
- **Series Detail**: Season and episode navigation
- **Video Player**: Full-screen video playback with play/pause controls
- **Account Info**: Subscription details and logout

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
│   ├── ContentListScreen.tsx   # Stream listing (uses DataContext cache)
│   ├── SeriesDetailScreen.tsx  # Series episodes
│   ├── PlayerScreen.tsx        # Video player
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
