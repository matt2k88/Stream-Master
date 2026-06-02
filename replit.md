# Ultra Cast v3

A React Native (Expo) IPTV Player application with Xtream Codes API integration.

## Overview

TV-optimized IPTV streaming application with orange/black neon theme. Users stream Live TV, Movies, and Series content from their IPTV provider using Xtream Codes API credentials. The server list is pulled from Supabase.

## Documentation

- **[docs/FEATURES.md](docs/FEATURES.md)** — full per-feature behaviour and implementation notes.
- **[docs/MIGRATIONS.md](docs/MIGRATIONS.md)** — Supabase SQL migrations the user must run (under `migrations/`).

## Features (summary)

See [docs/FEATURES.md](docs/FEATURES.md) for the detail behind each of these.

- **Auth & Sync**: Two-step login (server picker → credentials), per-device auto-login, upfront sync with an animated SyncScreen.
- **Home & Navigation**: 2×2 button grid + advert carousel/search/recently-watched; cached DataContext makes category/content browsing instant; 170px category sidebar in ContentListScreen.
- **Playback & Watch History**: Full-screen player, Live Preview mini-player + EPG, lifetime Continue Watching / resume (Live TV capped at 20), WATCHED/CONTINUE badges, seek keys, auto "Up Next" episode prompt.
- **Favourites & Manage**: Per-profile favourites (long-press or in-player star), TV-remote Manage mode for individual delete/favourite.
- **TV Guide & Catch Up**: Lazy-loaded EPG grid; Catch Up timeshift playback for archive-enabled channels.
- **Messaging & Updates**: System messages with unread badge, version/update check, What's New / Known Issues modal.
- **Account & Referrals**: Account info + logout; referral stats/code/history from the secondary "lifetime" Supabase.
- **Football**: In-player Live Football Scores tracker (with GOAL alerts + global kill-switch) and a dedicated Football Centre (Live Now + Upcoming, collapsible league groups, team badges, TV-channel deep-links). Live Now auto-polls every 30s.
- **Theming**: Admin-controlled holiday themes via the `app_theme` Supabase row.

## Tech Stack

- **Frontend**: React Native with Expo (SDK 54)
- **Backend**: Express.js server (port 5000)
- **Navigation**: React Navigation 7+
- **State Management**: AuthContext (auth) + DataContext (all IPTV content cache)
- **Data Fetching**: TanStack React Query + direct xtreamApi calls in DataContext
- **Video Playback**: expo-video (with VLC fallback on capable Android; see Fire OS 6 notes in docs/FEATURES.md)
- **Styling**: React Native StyleSheet, orange/black neon theme, expo-linear-gradient
- **Database**: Supabase (server-side only via SUPABASE_URL + SUPABASE_ANON_KEY secrets), plus a secondary "lifetime" Supabase for referrals

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
│   ├── FootballCentreScreen.tsx # Live Now + Upcoming football
│   └── AccountInfoScreen.tsx   # Account details
├── components/
│   ├── SyncScreen.tsx          # Full-screen data sync overlay
│   └── ErrorBoundary.tsx       # App crash handler
├── constants/
│   └── theme.ts                # Orange/black neon theme, spacing, typography
└── hooks/

server/
├── index.ts                    # Express server entry + football poller start
├── routes.ts                   # /api/servers (Supabase), /api/auth proxy, etc.
└── football.ts                 # api-football poller + fixture refresh
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
