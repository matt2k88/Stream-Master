import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  Text,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getApiUrl } from "@/lib/query-client";
import { Colors } from "@/constants/theme";

interface IntroPlayerProps {
  videoUrl: string;
  onDone: () => void;
}

function IntroPlayer({ videoUrl, onDone }: IntroPlayerProps) {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const doneRef = useRef(false);
  const [showSkip, setShowSkip] = useState(false);

  const dismiss = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 600,
      useNativeDriver: true,
    }).start(() => onDone());
  }, [fadeAnim, onDone]);

  // Player is created with the real URL — same pattern as PlayerScreen
  const player = useVideoPlayer(videoUrl, (p) => {
    p.muted = false;
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    const sub = player.addListener("statusChange", (e) => {
      if (e.status === "readyToPlay") setShowSkip(true);
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    const sub = player.addListener("playingChange", (e) => {
      if (e.isPlaying) setShowSkip(true);
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    const sub = player.addListener("playToEnd", () => {
      dismiss();
    });
    return () => sub.remove();
  }, [player, dismiss]);

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />

      {showSkip ? (
        <Pressable
          style={[styles.skipBtn, { top: insets.top + 12, right: insets.right + 16 }]}
          onPress={dismiss}
          hitSlop={10}
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

interface IntroOverlayProps {
  onDone: () => void;
}

export default function IntroOverlay({ onDone }: IntroOverlayProps) {
  const [videoUrl, setVideoUrl] = useState<string | null | false>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const base = getApiUrl();
        const res = await fetch(new URL("/api/intros", base).toString());
        if (!cancelled) {
          if (res.ok) {
            const data = await res.json();
            if (data?.video_url) {
              setVideoUrl(data.video_url);
            } else {
              setVideoUrl(false);
            }
          } else {
            setVideoUrl(false);
          }
        }
      } catch {
        if (!cancelled) setVideoUrl(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // false = no intro, skip straight through
  useEffect(() => {
    if (videoUrl === false) onDone();
  }, [videoUrl, onDone]);

  // null = still loading — black screen
  if (videoUrl === null) {
    return <View style={styles.overlay} />;
  }

  if (videoUrl === false) return null;

  return <IntroPlayer videoUrl={videoUrl} onDone={onDone} />;
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 9999,
  },
  skipBtn: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.5)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  skipText: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: "600",
    opacity: 0.9,
  },
});
