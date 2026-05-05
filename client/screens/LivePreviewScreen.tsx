import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Animated,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { xtreamApi, EpgListing } from "@/lib/xtream-api";
import { useFavourites } from "@/contexts/FavouritesContext";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type LivePreviewRouteProp = RouteProp<RootStackParamList, "LivePreview">;

function decodeEpgString(s: string): string {
  if (!s) return "";
  try {
    return atob(s);
  } catch {
    return s;
  }
}

function formatEpgTime(timestamp: number): string {
  if (!timestamp) return "";
  const d = new Date(timestamp * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function EpgRow({ listing, isNow }: { listing: EpgListing; isNow: boolean }) {
  const title = decodeEpgString(listing.title);
  const desc = decodeEpgString(listing.description);
  const startTime = formatEpgTime(listing.start_timestamp);
  const endTime = formatEpgTime(listing.stop_timestamp);

  return (
    <View style={[styles.epgRow, isNow && styles.epgRowNow]}>
      {isNow ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.12)", "rgba(255,102,0,0.04)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      ) : null}
      <View style={styles.epgDotCol}>
        {isNow ? (
          <View style={styles.epgDotLive}>
            <View style={styles.epgDotLiveInner} />
          </View>
        ) : (
          <View style={styles.epgDotNext} />
        )}
        {isNow ? <View style={styles.epgConnector} /> : null}
      </View>
      <View style={styles.epgInfo}>
        <View style={styles.epgMeta}>
          {isNow ? (
            <View style={styles.nowBadge}>
              <ThemedText style={styles.nowBadgeText}>NOW</ThemedText>
            </View>
          ) : (
            <ThemedText style={styles.upNextLabel}>UP NEXT</ThemedText>
          )}
          {startTime && endTime ? (
            <ThemedText style={styles.epgTime}>
              {startTime} — {endTime}
            </ThemedText>
          ) : null}
        </View>
        <ThemedText
          style={[styles.epgTitle, isNow && styles.epgTitleNow]}
          numberOfLines={2}
        >
          {title || "Unknown programme"}
        </ThemedText>
        {desc && isNow ? (
          <ThemedText style={styles.epgDesc} numberOfLines={3}>
            {desc}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

function FavButton({
  isFavourited,
  onPress,
}: {
  isFavourited: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  const highlight = isActive || isFavourited;

  return (
    <Pressable
      style={[styles.headerBtn, highlight && styles.headerBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <Feather
        name="star"
        size={18}
        color={highlight ? Colors.dark.accent : Colors.dark.textSecondary}
      />
    </Pressable>
  );
}

function FullScreenButton({
  onPress,
}: {
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;

  return (
    <Pressable
      style={[styles.fullScreenBtn, isActive && styles.fullScreenBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hasTVPreferredFocus
    >
      {isActive ? (
        <LinearGradient
          colors={["#FF8800", "#FF5500"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      <Feather name="maximize-2" size={20} color="#fff" />
      <ThemedText style={styles.fullScreenBtnText}>Watch Full Screen</ThemedText>
    </Pressable>
  );
}

export default function LivePreviewScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<LivePreviewRouteProp>();
  const { streamId, name, streamUrl, thumbnail, streamIcon } = route.params;

  const [epgListings, setEpgListings] = useState<EpgListing[]>([]);
  const [epgLoading, setEpgLoading] = useState(true);

  const { isFavourite, toggleFavourite } = useFavourites();
  const isFavourited = isFavourite(streamId, "live");

  const toastAnim = useRef(new Animated.Value(0)).current;
  const [toastMsg, setToastMsg] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  const [backFocused, setBackFocused] = useState(false);

  const player = useVideoPlayer(streamUrl, (p) => {
    p.muted = false;
    p.play();
  });

  useEffect(() => {
    return () => {
      try { player.pause(); } catch {}
    };
  }, [player]);

  useEffect(() => {
    let cancelled = false;
    setEpgLoading(true);
    xtreamApi.getShortEpg(streamId, 4).then((listings) => {
      if (!cancelled) {
        setEpgListings(listings);
        setEpgLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setEpgLoading(false);
    });
    return () => { cancelled = true; };
  }, [streamId]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  }, [toastAnim]);

  const handleToggleFavourite = useCallback(async () => {
    const wasAdded = !isFavourited;
    await toggleFavourite({
      streamId,
      streamType: "live",
      streamName: name,
      streamIcon: streamIcon ?? null,
    });
    showToast(wasAdded ? "Added to Favourites" : "Removed from Favourites");
  }, [isFavourited, toggleFavourite, streamId, name, streamIcon, showToast]);

  const handleFullScreen = useCallback(() => {
    try { player.pause(); } catch {}
    navigation.navigate("Player", {
      streamUrl,
      title: name,
      type: "live",
      thumbnail,
      streamId: String(streamId),
    });
  }, [navigation, streamUrl, name, thumbnail, streamId, player]);

  const padT = insets.top + Spacing.md;
  const padB = insets.bottom + Spacing.md;
  const padH = Math.max(insets.left + Spacing.xs, Spacing.lg);

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <Pressable
          style={[styles.headerBtn, backFocused && styles.headerBtnActive]}
          onPress={() => navigation.goBack()}
          onFocus={() => setBackFocused(true)}
          onBlur={() => setBackFocused(false)}
        >
          <Feather name="arrow-left" size={20} color={Colors.dark.text} />
        </Pressable>

        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <ThemedText style={styles.liveText}>LIVE</ThemedText>
        </View>

        <ThemedText style={styles.channelName} numberOfLines={1}>
          {name}
        </ThemedText>

        <FavButton isFavourited={isFavourited} onPress={handleToggleFavourite} />
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      {/* Body */}
      <View style={[styles.body, { paddingHorizontal: padH, paddingBottom: padB }]}>
        {/* Left col: mini player + watch full screen */}
        <View style={styles.leftCol}>
          <View style={styles.playerWrap}>
            <VideoView
              style={styles.player}
              player={player}
              contentFit="contain"
              nativeControls={false}
              allowsFullscreen={false}
              allowsPictureInPicture={false}
            />
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.6)"]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {/* Channel icon overlay */}
            {streamIcon ? (
              <View style={styles.channelIconWrap}>
                <Image
                  source={{ uri: streamIcon }}
                  style={styles.channelIcon}
                  contentFit="contain"
                />
              </View>
            ) : null}
          </View>

          <FullScreenButton onPress={handleFullScreen} />
        </View>

        {/* Right col: EPG */}
        <View style={styles.rightCol}>
          <View style={styles.epgHeader}>
            <Feather name="calendar" size={12} color={Colors.dark.accent} />
            <ThemedText style={styles.epgHeaderText}>Programme Guide</ThemedText>
          </View>

          {epgLoading ? (
            <View style={styles.epgState}>
              <ActivityIndicator size="small" color={Colors.dark.accent} />
              <ThemedText style={styles.epgStateText}>Loading guide...</ThemedText>
            </View>
          ) : epgListings.length === 0 ? (
            <View style={styles.epgState}>
              <Feather name="calendar" size={32} color={Colors.dark.border} />
              <ThemedText style={styles.epgStateText}>No guide available</ThemedText>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={styles.epgScroll}>
              {epgListings.map((listing, idx) => (
                <EpgRow
                  key={listing.id || String(idx)}
                  listing={listing}
                  isNow={listing.now_playing === 1 || idx === 0}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </View>

      {/* Toast */}
      {toastVisible ? (
        <Animated.View
          style={[styles.toast, { opacity: toastAnim }]}
          pointerEvents="none"
        >
          <Feather name="star" size={14} color={Colors.dark.accent} />
          <ThemedText style={styles.toastText}>{toastMsg}</ThemedText>
        </Animated.View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  headerBtnActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(220,30,30,0.2)",
    borderWidth: 1,
    borderColor: "rgba(220,30,30,0.5)",
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 0,
  },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#DC1E1E" },
  liveText: { color: "#FF5555", fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  channelName: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
  },

  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.sm },

  body: {
    flex: 1,
    flexDirection: "row",
    gap: Spacing.xl,
  },

  leftCol: {
    flex: 4,
    flexDirection: "column",
    gap: Spacing.md,
  },

  playerWrap: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  player: {
    width: "100%",
    height: "100%",
  },
  channelIconWrap: {
    position: "absolute",
    bottom: Spacing.sm,
    right: Spacing.sm,
    width: 48,
    height: 48,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: BorderRadius.sm,
    padding: 4,
  },
  channelIcon: {
    width: "100%",
    height: "100%",
  },

  fullScreenBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1.5,
    borderColor: Colors.dark.accent,
    paddingVertical: Spacing.md,
    overflow: "hidden",
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  fullScreenBtnActive: {
    borderColor: "#FF8800",
    shadowOpacity: 0.9,
    shadowRadius: 16,
  },
  fullScreenBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  rightCol: {
    flex: 5,
    flexDirection: "column",
    gap: Spacing.sm,
  },

  epgHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  epgHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.accent,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  epgScroll: { flex: 1 },

  epgRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "transparent",
  },
  epgRowNow: {
    borderColor: "rgba(255,102,0,0.3)",
  },

  epgDotCol: {
    width: 20,
    alignItems: "center",
    paddingTop: 2,
  },
  epgDotLive: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(255,102,0,0.25)",
    borderWidth: 1,
    borderColor: Colors.dark.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  epgDotLiveInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.accent,
  },
  epgConnector: {
    width: 1,
    flex: 1,
    backgroundColor: "rgba(255,102,0,0.25)",
    marginTop: 3,
  },
  epgDotNext: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.border,
    marginTop: 3,
  },

  epgInfo: { flex: 1, gap: 3 },
  epgMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  nowBadge: {
    backgroundColor: Colors.dark.accent,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  nowBadgeText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  upNextLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  epgTime: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  epgTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  epgTitleNow: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "700",
  },
  epgDesc: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },

  epgState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
  },
  epgStateText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
  },

  toast: {
    position: "absolute",
    bottom: 60,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(8,8,8,0.92)",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
  toastText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
