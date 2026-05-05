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

interface IntroOverlayProps {
  onDone: () => void;
}

export default function IntroOverlay({ onDone }: IntroOverlayProps) {
  const insets = useSafeAreaInsets();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const doneRef = useRef(false);

  const dismiss = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 600,
      useNativeDriver: true,
    }).start(() => onDone());
  }, [fadeAnim, onDone]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const base = getApiUrl();
        const res = await fetch(new URL("/api/intros", base).toString());
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data?.video_url) {
            setVideoUrl(data.video_url);
          } else {
            onDone();
          }
        } else {
          onDone();
        }
      } catch {
        onDone();
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const player = useVideoPlayer(videoUrl ?? "", (p) => {
    p.muted = false;
    p.loop = false;
    if (videoUrl) p.play();
  });

  useEffect(() => {
    if (!player || !videoUrl) return;
    const sub = player.addListener("playingChange", (e) => {
      if (e.isPlaying) setReady(true);
    });
    const subStatus = player.addListener("statusChange", (e) => {
      if (e.status === "readyToPlay") setReady(true);
    });
    return () => {
      sub.remove();
      subStatus.remove();
    };
  }, [player, videoUrl]);

  useEffect(() => {
    if (!player || !videoUrl) return;
    const sub = player.addListener("playToEnd", () => {
      dismiss();
    });
    return () => sub.remove();
  }, [player, videoUrl, dismiss]);

  if (!videoUrl) return null;

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

      {ready ? (
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
