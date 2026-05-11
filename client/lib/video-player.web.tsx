// Web build of the player shim.
//
// VLC has no web implementation — react-native-vlc-media-player only ships
// native (iOS / Android) bindings. To keep the Replit web preview working
// for development we transparently fall back to expo-video on web.
//
// Native (iOS / Android, including Fire TV) loads `video-player.tsx`
// (the dispatching bridge) instead. Metro resolves the `.web.tsx`
// extension first when building for web, so this file only ever runs
// in the browser bundle.
//
// The `engine` option is accepted but ignored on web — there's only
// ever one underlying engine here (expo-video).
import {
  useVideoPlayer as useExpoVideoPlayer,
  VideoView as ExpoVideoView,
} from "expo-video";

export type { SubtitleTrack, AudioTrack, VideoPlayer } from "expo-video";
export type PlayerEngine = "vlc" | "expo";

export function useVideoPlayer(
  source: any,
  setup?: (player: any) => void,
  _opts?: { engine?: PlayerEngine },
) {
  return useExpoVideoPlayer(source, setup as any);
}

export function VideoView(props: any) {
  // Strip our custom `engine` prop so it never lands on the underlying view.
  const { engine: _engine, ...rest } = props;
  return <ExpoVideoView {...rest} />;
}
