# IPTV Player

A React Native (Expo) IPTV Player application with Xtream Codes API integration.

## Overview

This is a mobile-first IPTV streaming application optimized for TV viewing. Users can stream Live TV, Movies, and Series content from their IPTV provider using Xtream Codes API credentials.

## Features

- **Login Screen**: Authenticate with Xtream Codes server (URL, username, password)
- **Home Screen**: Three main category boxes (Live TV, Movies, Series) + Account Info button
- **Category Browse**: Browse content categories from the IPTV provider
- **Content Lists**: View streams/content within each category with thumbnails
- **Series Detail**: Season and episode navigation for TV series
- **Video Player**: Full-screen video playback with play/pause controls
- **Account Info**: View subscription details and logout

## Tech Stack

- **Frontend**: React Native with Expo (SDK 54)
- **Backend**: Express.js server
- **Navigation**: React Navigation 7+
- **State Management**: React Context (AuthContext)
- **Data Fetching**: TanStack React Query
- **Video Playback**: expo-video
- **Styling**: React Native StyleSheet with dark theme

## Project Structure

```
client/
├── App.tsx                 # Main app entry with providers
├── contexts/
│   └── AuthContext.tsx     # Authentication state management
├── lib/
│   └── xtream-api.ts       # Xtream Codes API client
├── navigation/
│   └── RootStackNavigator.tsx  # Stack navigator with all routes
├── screens/
│   ├── LoginScreen.tsx     # Server authentication
│   ├── HomeScreen.tsx      # Main menu with category boxes
│   ├── CategoryScreen.tsx  # Category listing
│   ├── ContentListScreen.tsx # Content/stream listing
│   ├── SeriesDetailScreen.tsx # Series episodes
│   ├── PlayerScreen.tsx    # Video player
│   └── AccountInfoScreen.tsx # Account details
├── constants/
│   └── theme.ts            # Dark theme colors and spacing
└── components/             # Reusable UI components

server/
├── index.ts                # Express server entry
└── routes.ts               # API routes
```

## Running the App

The app is configured to run with:
```bash
npm run all:dev
```

This starts both the Expo development server (port 8081) and Express backend (port 5000).

### Testing on Device
- Scan the QR code in the terminal with Expo Go (Android) or Camera app (iOS)
- Web preview available at localhost:8081

## Design

- **Orientation**: Landscape (optimized for TV viewing)
- **Theme**: Dark mode (#0A0E27 background)
- **Touch Targets**: Large buttons suitable for remote/touch interaction
- **Safe Zones**: TV-safe padding around content

## API Integration

The app uses Xtream Codes API for:
- User authentication (`player_api.php?username=&password=`)
- Live TV categories and streams
- VOD (Movies) categories and streams
- Series categories, seasons, and episodes
- Stream URL generation for playback

## User Preferences

- Dark theme for comfortable TV viewing
- Landscape orientation by default
- Auto-hiding controls in video player
- No mock data - all content from real API
