// Thin re-export of expo-video.
//
// Historically this file was a compatibility shim that backed the same
// expo-video-shaped API with react-native-video, then with libVLC, in
// search of broader codec support. Both attempts had Fire OS stability
// issues — particularly the 4K Max black-screen / HDMI-handshake hang.
// Reverting to expo-video (Google's official AndroidX Media3 path,
// which is what Fire OS itself is tuned for) restores the rock-solid
// stability the app had originally.
//
// Tradeoff accepted: expo-video doesn't ship the AC3 / EAC3 audio
// codecs or some exotic raw MPEG-TS variants. A small number of IPTV
// channels with surround audio may not play. That's the cost of
// Firestick stability.
//
// Consumer screens (PlayerScreen, LivePreviewScreen, IntroOverlay)
// keep importing from "@/lib/video-player" so this module stays the
// single point where the engine could be swapped again later.
export { useVideoPlayer, VideoView } from "expo-video";
export type {
  SubtitleTrack,
  AudioTrack,
  VideoPlayer,
} from "expo-video";
