// Web build of the player shim.
//
// VLC has no web implementation — react-native-vlc-media-player only ships
// native (iOS / Android) bindings. To keep the Replit web preview working
// for development we transparently fall back to expo-video on web.
//
// Native (iOS / Android, including Fire TV) loads `video-player.tsx`
// (the VLC-backed bridge) instead. Metro resolves the `.web.tsx`
// extension first when building for web, so this file only ever runs
// in the browser bundle.
export { useVideoPlayer, VideoView } from "expo-video";
export type { SubtitleTrack, AudioTrack, VideoPlayer } from "expo-video";
