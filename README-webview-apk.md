# Ultra Cast — WebView APK

A standalone Android application that loads the Ultra Cast web app inside a hardware-accelerated
WebView and exposes native **LibVLC** and **ExoPlayer (Media 3)** playback via a JavaScript bridge.
IPTV streams that browsers cannot decode (raw MPEG-TS, AC3 audio, exotic containers) are routed to
LibVLC; standard HLS/DASH/MP4 streams use ExoPlayer's optimised Media 3 pipeline.

---

## Architecture

```
┌──────────────────── Android Activity (FrameLayout) ────────────────────┐
│                                                                         │
│  WebView (full screen)          ← Ultra Cast web app loads here        │
│  ─ JavaScript detects window.__ULTRACAST_WEBVIEW__ === true            │
│  ─ Calls window.UltraCastPlayer.play(url, mimeHint, title)            │
│                                                                         │
│  SurfaceView (floats on top, GONE by default)                          │
│  ─ Becomes VISIBLE on setFullscreen(true)                              │
│  ─ LibVLC or ExoPlayer renders video here                              │
│                                                                         │
│  NativePlayerBridge (@JavascriptInterface)                             │
│  ─ Receives commands from JS on bridge thread                          │
│  ─ Routes to LibVLC (TS/RTSP/exotic) or ExoPlayer (HLS/DASH/MP4)     │
│  ─ Fires events back via evaluateJavascript("window.__ucPlayerEvent…") │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## JavaScript Bridge API

### JS → Native  (`window.UltraCastPlayer`)

| Method | Description |
|--------|-------------|
| `play(url, mimeHint, title)` | Start playback. `mimeHint`: `"hls"`, `"dash"`, `"mp4"`, or `""` (auto-detect) |
| `pause()` | Pause |
| `resume()` | Resume |
| `stop()` | Stop and release the decoder |
| `seekTo(ms)` | Seek to position in milliseconds |
| `setVolume(level)` | Volume 0–100 |
| `setFullscreen(on)` | `true` shows the SurfaceView overlay; `false` hides it |
| `setAspectRatio(ratio)` | `"16:9"`, `"4:3"`, `"FILL"` (LibVLC only) |

### Native → JS  (`window.__ucPlayerEvent(event, data)`)

| Event | Data |
|-------|------|
| `playing` | `{}` |
| `paused` | `{}` |
| `stopped` | `{}` |
| `error` | `{ message: string }` |
| `buffering` | `{ percent: number }` (LibVLC) or `{}` (ExoPlayer) |
| `timeUpdate` | `{ positionMs: number }` |
| `durationChange` | `{ durationMs: number }` |

### Detection

The APK injects `window.__ULTRACAST_WEBVIEW__ = true` before the page's own JS runs.
The web app checks this flag to decide which player implementation to activate.

---

## Building

### Prerequisites
- Android Studio Hedgehog (2023.1) or newer, **or** JDK 17 + Android SDK command-line tools
- Android SDK 34 (compile) / SDK 21 (minimum)

### 1. Update the target URL

Open `android-webview-apk/app/build.gradle` and change the `APP_URL` build field to your
deployed production URL:

```groovy
buildConfigField "String", "APP_URL", '"https://your-app.replit.app"'
```

### 2. Generate the Gradle wrapper JAR

The `gradlew` script requires `gradle/wrapper/gradle-wrapper.jar`. Generate it once:

```bash
cd android-webview-apk
# Option A — if Gradle is installed locally:
gradle wrapper --gradle-version 8.4

# Option B — open the project in Android Studio; it offers to download
# the wrapper automatically on first open.
```

### 3. Build a debug APK

```bash
cd android-webview-apk
./gradlew assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk
```

### 4. Build a release APK (requires signing)

```bash
# Generate a keystore (once):
keytool -genkey -v -keystore ultracast.jks -alias ultracast \
        -keyalg RSA -keysize 2048 -validity 10000

# Add signing config to app/build.gradle, then:
./gradlew assembleRelease
# Output: app/build/outputs/apk/release/app-release.apk
```

### 5. Install on device / Fire TV

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
# For Fire TV over Wi-Fi: adb connect <device-ip>:5555 first
```

---

## Engine routing logic

| URL pattern / mimeHint | Engine |
|------------------------|--------|
| `.m3u8` / `mimeHint="hls"` | ExoPlayer (Media 3 HLS) |
| `.mpd` / `mimeHint="dash"` | ExoPlayer (Media 3 DASH) |
| `.mp4` / `mimeHint="mp4"` | ExoPlayer |
| `.webm` | ExoPlayer |
| Anything else (Xtream, raw TS, RTSP, unknown) | LibVLC |

---

## Permissions

| Permission | Reason |
|------------|--------|
| `INTERNET` | Load web app and stream video |
| `ACCESS_NETWORK_STATE` | Check connectivity |
| `WAKE_LOCK` | Keep screen on during playback |
