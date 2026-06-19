import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  Linking,
  Alert,
  Modal,
  Animated,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as LegacyFS from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import SideMenuButton from "@/components/SideMenuButton";

const ULTRA_RED = "#ef4444";
const ULTRA_RED_DIM = "rgba(239,68,68,0.12)";
const ULTRA_RED_BORDER = "rgba(239,68,68,0.35)";
const WHATSAPP_GREEN = "#25D366";
const UNKNOWN_SOURCES_KEY = "@ultracast:ultratube_unknown_sources_v1";
const APK_PREFIX = "ultratube-";

type InstallPhase =
  | { phase: "idle" }
  | { phase: "preparing" }
  | { phase: "downloading"; progress: number; receivedMb: number; totalMb: number }
  | { phase: "installing" }
  | { phase: "error"; message: string };

interface AccessData {
  hasAccess: boolean;
  ultra_tube_username?: string;
  ultra_tube_password?: string;
}

interface Config {
  apk_url: string;
  downloader_code: string;
}

async function cleanStaleApks() {
  try {
    const dir = LegacyFS.cacheDirectory;
    if (!dir) return;
    const entries = await LegacyFS.readDirectoryAsync(dir);
    for (const name of entries.filter((n) => n.startsWith(APK_PREFIX) && n.endsWith(".apk"))) {
      try { await LegacyFS.deleteAsync(dir + name, { idempotent: true }); } catch {}
    }
  } catch {}
}

function TVBackButton({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const active = focused || pressed || hovered;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.backBtn, active && styles.backBtnActive]}
    >
      <Feather name="arrow-left" size={16} color={active ? Colors.dark.text : Colors.dark.textSecondary} />
      <ThemedText style={[styles.backText, active && styles.backTextActive]}>Back</ThemedText>
    </Pressable>
  );
}

function FeatureRow({ text }: { text: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureCheck}>
        <Feather name="check" size={13} color="#fff" />
      </View>
      <ThemedText style={styles.featureText}>{text}</ThemedText>
    </View>
  );
}

function TVIconButton({
  onPress, icon, activeIcon, activeColor, label, activeLabel, large,
}: {
  onPress: () => void;
  icon: React.ComponentProps<typeof Feather>["name"];
  activeIcon?: React.ComponentProps<typeof Feather>["name"];
  activeColor?: string;
  label?: string;
  activeLabel?: string;
  large?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [triggered, setTriggered] = useState(false);
  const active = focused || pressed || hovered;
  const iconColor = triggered && activeColor ? activeColor : active ? Colors.dark.text : Colors.dark.textSecondary;
  return (
    <Pressable
      onPress={() => { setTriggered(true); setTimeout(() => setTriggered(false), 1800); onPress(); }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.tvIconBtn, large && styles.tvIconBtnLarge, active && styles.tvIconBtnActive]}
    >
      <Feather
        name={(triggered && activeIcon) ? activeIcon : icon}
        size={large ? 18 : 14}
        color={iconColor}
      />
      {label ? (
        <ThemedText style={[styles.copyBtnText, triggered && activeColor ? { color: activeColor } : active ? { color: Colors.dark.text } : undefined]}>
          {triggered && activeLabel ? activeLabel : label}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const handle = useCallback(async () => {
    await Clipboard.setStringAsync(value);
  }, [value]);
  return (
    <TVIconButton
      onPress={handle}
      icon="copy"
      activeIcon="check"
      activeColor="#22c55e"
      label={label}
      activeLabel={label ? "Copied!" : undefined}
    />
  );
}

export default function UltraTubeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { userInfo } = useAuth();
  const username = (userInfo as any)?.user_info?.username ?? "";

  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<AccessData>({ hasAccess: false });
  const [config, setConfig] = useState<Config>({
    apk_url: "https://app.ultracast.co.uk/ultratube2.apk",
    downloader_code: "6844940",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [installPhase, setInstallPhase] = useState<InstallPhase>({ phase: "idle" });
  const resumableRef = useRef<LegacyFS.DownloadResumable | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cfgRes, accRes] = await Promise.all([
          fetch(new URL("/api/ultra-tube/config", getApiUrl()).toString()),
          username
            ? fetch(new URL(`/api/ultra-tube/check?username=${encodeURIComponent(username.toLowerCase())}`, getApiUrl()).toString())
            : Promise.resolve(null),
        ]);
        if (cfgRes.ok) {
          const d = await cfgRes.json();
          if (alive) setConfig({ apk_url: d.apk_url ?? config.apk_url, downloader_code: d.downloader_code ?? config.downloader_code });
        }
        if (accRes && accRes.ok) {
          const d = await accRes.json();
          if (alive) setAccess(d);
        }
      } catch {}
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [username]);

  const cancelInstall = useCallback(() => {
    cancelledRef.current = true;
    try { resumableRef.current?.cancelAsync().catch(() => {}); } catch {}
    resumableRef.current = null;
    setInstallPhase({ phase: "idle" });
  }, []);

  const startInstall = useCallback(async () => {
    if (installPhase.phase !== "idle" && installPhase.phase !== "error") return;
    cancelledRef.current = false;
    setInstallPhase({ phase: "preparing" });

    const url = config.apk_url;
    if (!url || !/^https:\/\//i.test(url)) {
      setInstallPhase({ phase: "error", message: "Invalid download link. Please contact support." });
      return;
    }

    if (Platform.OS !== "android") {
      try { await Linking.openURL(url); } catch {}
      setInstallPhase({ phase: "idle" });
      return;
    }

    try {
      const seen = await AsyncStorage.getItem(UNKNOWN_SOURCES_KEY);
      if (!seen) {
        await new Promise<void>((resolve, reject) =>
          Alert.alert(
            "One-time setup",
            "After downloading, Android will ask permission to install apps from Ultra Cast.\n\nTap \"Settings\" \u2192 enable \"Allow from this source\" \u2192 press Back. You only need to do this once.",
            [
              { text: "Cancel", style: "cancel", onPress: () => reject(new Error("cancelled")) },
              {
                text: "Continue",
                onPress: async () => {
                  try { await AsyncStorage.setItem(UNKNOWN_SOURCES_KEY, "1"); } catch {}
                  resolve();
                },
              },
            ],
            { cancelable: false },
          ),
        );
      }
    } catch {
      setInstallPhase({ phase: "idle" });
      return;
    }

    if (cancelledRef.current) { setInstallPhase({ phase: "idle" }); return; }

    await cleanStaleApks();
    setInstallPhase({ phase: "downloading", progress: 0, receivedMb: 0, totalMb: 0 });

    const target = (LegacyFS.cacheDirectory ?? "") + `${APK_PREFIX}${Date.now()}.apk`;
    const resumable = LegacyFS.createDownloadResumable(url, target, {}, (p) => {
      if (cancelledRef.current) return;
      const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : 0;
      setInstallPhase({
        phase: "downloading",
        progress: total > 0 ? Math.min(1, p.totalBytesWritten / total) : 0,
        receivedMb: p.totalBytesWritten / (1024 * 1024),
        totalMb: total / (1024 * 1024),
      });
    });
    resumableRef.current = resumable;

    let result: LegacyFS.FileSystemDownloadResult | undefined;
    try {
      result = await resumable.downloadAsync();
    } catch {
      if (cancelledRef.current) { setInstallPhase({ phase: "idle" }); return; }
      setInstallPhase({ phase: "error", message: "Download failed. Check your connection and try again." });
      return;
    }

    if (cancelledRef.current) { setInstallPhase({ phase: "idle" }); return; }
    if (!result?.uri) {
      setInstallPhase({ phase: "error", message: "Download completed but file is missing. Please try again." });
      return;
    }

    setInstallPhase({ phase: "installing" });
    const flags = 1 | 268435456; // FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
    const MIME = "application/vnd.android.package-archive";
    let contentUri: string | null = null;
    try {
      contentUri = await LegacyFS.getContentUriAsync(result.uri);
    } catch (e: any) {
      setInstallPhase({ phase: "error", message: "Could not prepare installer. (" + String(e?.message || e) + ")" });
      return;
    }

    const tryLaunch = (action: string) =>
      IntentLauncher.startActivityAsync(action, { data: contentUri!, flags, type: MIME });

    try {
      await tryLaunch("android.intent.action.VIEW");
      setInstallPhase({ phase: "idle" });
    } catch {
      try {
        await tryLaunch("android.intent.action.INSTALL_PACKAGE");
        setInstallPhase({ phase: "idle" });
      } catch (e2: any) {
        setInstallPhase({
          phase: "error",
          message: "Could not open installer. On Fire TV: Settings \u2192 My Fire TV \u2192 Developer Options \u2192 Install Unknown Apps \u2192 enable Ultra Cast.",
        });
      }
    }
  }, [installPhase.phase, config.apk_url]);

  const openWhatsApp = useCallback(() => {
    Linking.openURL("https://wa.me/447459683465").catch(() =>
      Linking.openURL("tel:+447459683465"),
    );
  }, []);

  const padBottom = insets.bottom + Spacing.lg;

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <LinearGradient
          colors={["rgba(239,68,68,0.06)", "transparent"]}
          style={StyleSheet.absoluteFill}
          locations={[0, 0.5]}
        />
        <View style={styles.loadingSpinner}>
          <Image source={ULTRATUBE_LOGO} style={styles.utLogoLoading} contentFit="contain" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Ambient gradient — subtle red glow from top-left */}
      <LinearGradient
        colors={["rgba(239,68,68,0.09)", "rgba(8,8,8,0)", "rgba(8,8,8,0)"]}
        style={StyleSheet.absoluteFill}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Top nav bar */}
      <View style={[styles.topNav, { paddingTop: insets.top + Spacing.xs }]}>
        <SideMenuButton />
        <TVBackButton onPress={() => navigation.goBack()} />
      </View>

      {access.hasAccess ? (
        /* Access view — same premium centred card as sales page */
        <ScrollView
          style={styles.scrollFlex}
          contentContainerStyle={styles.salesCenter}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.salesCard}>
            <LinearGradient
              colors={["rgba(34,197,94,0.04)", "rgba(239,68,68,0.04)", "transparent"]}
              style={[StyleSheet.absoluteFill, { borderRadius: BorderRadius.xl }]}
              locations={[0, 0.3, 0.7]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              pointerEvents="none"
            />
            <AccessView
              access={access}
              config={config}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              installPhase={installPhase}
              startInstall={startInstall}
              cancelInstall={cancelInstall}
            />
          </View>
        </ScrollView>
      ) : (
        /* Sales page — centred card */
        <ScrollView
          style={styles.scrollFlex}
          contentContainerStyle={styles.salesCenter}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.salesCard}>
            {/* Card inner gradient */}
            <LinearGradient
              colors={["rgba(239,68,68,0.05)", "transparent"]}
              style={[StyleSheet.absoluteFill, { borderRadius: BorderRadius.xl }]}
              locations={[0, 0.6]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              pointerEvents="none"
            />
            <SalesView />
          </View>
        </ScrollView>
      )}

      {/* Download progress modal */}
      {installPhase.phase !== "idle" ? (
        <Modal transparent animationType="fade" visible onRequestClose={cancelInstall}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalIconRow}>
                {installPhase.phase === "error" ? (
                  <Feather name="alert-triangle" size={28} color={Colors.dark.error} />
                ) : installPhase.phase === "installing" ? (
                  <Feather name="check-circle" size={28} color="#22c55e" />
                ) : (
                  <Feather name="download" size={28} color={ULTRA_RED} />
                )}
              </View>
              <ThemedText style={styles.modalTitle}>
                {installPhase.phase === "preparing" && "Preparing download..."}
                {installPhase.phase === "downloading" && "Downloading Ultra Tube"}
                {installPhase.phase === "installing" && "Opening installer"}
                {installPhase.phase === "error" && "Download failed"}
              </ThemedText>
              {installPhase.phase === "downloading" ? (
                <>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.round(installPhase.progress * 100)}%` as any }]} />
                  </View>
                  <ThemedText style={styles.modalSub}>
                    {installPhase.totalMb > 0
                      ? `${installPhase.receivedMb.toFixed(1)} / ${installPhase.totalMb.toFixed(1)} MB  (${Math.round(installPhase.progress * 100)}%)`
                      : `${Math.round(installPhase.progress * 100)}%`}
                  </ThemedText>
                </>
              ) : null}
              {installPhase.phase === "installing" ? (
                <ThemedText style={styles.modalSub}>Android will ask you to confirm the install.</ThemedText>
              ) : null}
              {installPhase.phase === "error" ? (
                <ThemedText style={styles.modalError}>{installPhase.message}</ThemedText>
              ) : null}
              <View style={styles.modalActions}>
                {installPhase.phase === "error" ? (
                  <Pressable style={[styles.modalBtn, { backgroundColor: ULTRA_RED, borderColor: ULTRA_RED }]} onPress={startInstall}>
                    <Feather name="refresh-cw" size={14} color="#fff" />
                    <ThemedText style={[styles.modalBtnText, { color: "#fff" }]}>Try Again</ThemedText>
                  </Pressable>
                ) : null}
                <Pressable style={styles.modalBtn} onPress={cancelInstall}>
                  <Feather name="x" size={14} color={Colors.dark.text} />
                  <ThemedText style={styles.modalBtnText}>
                    {installPhase.phase === "downloading" ? "Cancel" : "Close"}
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

// ── Sales / No-access view ─────────────────────────────────────────────────
const ULTRATUBE_LOGO = require("../assets/ultratube/ut-logo.png");

const SHOWCASE_IMAGES = [
  require("../assets/ultratube/ut-1.png"),
  require("../assets/ultratube/ut-2.png"),
  require("../assets/ultratube/ut-3.png"),
];

function ShowcaseCarousel() {
  const [dotIdx, setDotIdx] = useState(0);
  const currentRef = useRef(0);
  // One opacity value per image — all always mounted, no source swapping
  const opacities = useRef(
    SHOWCASE_IMAGES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))
  ).current;

  useEffect(() => {
    const t = setInterval(() => {
      const current = currentRef.current;
      const next = (current + 1) % SHOWCASE_IMAGES.length;
      currentRef.current = next;
      // True crossfade: fade out current AND fade in next simultaneously
      Animated.parallel([
        Animated.timing(opacities[current], { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(opacities[next],   { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start(() => setDotIdx(next));
    }, 3400);
    return () => clearInterval(t);
  }, []);

  return (
    <View style={styles.carouselWrap}>
      {/* All images stacked — no source-swap, no ghost frame */}
      <View style={styles.carouselOuter}>
        {SHOWCASE_IMAGES.map((src, i) => (
          <Animated.View key={i} style={[StyleSheet.absoluteFill, { opacity: opacities[i] }]}>
            <Image source={src} style={styles.carouselImg} contentFit="cover" />
          </Animated.View>
        ))}
      </View>

      {/* Dot indicators */}
      <View style={styles.carouselDots}>
        {SHOWCASE_IMAGES.map((_, i) => (
          <View key={i} style={[styles.carouselDot, i === dotIdx && styles.carouselDotActive]} />
        ))}
      </View>
    </View>
  );
}

function SalesView() {
  return (
    <View style={styles.salesWrap}>
      {/* Left column — branding + pricing */}
      <View style={styles.salesLeft}>
        <Image source={ULTRATUBE_LOGO} style={styles.utLogoSales} contentFit="contain" />
        <ThemedText style={styles.salesTagline}>YouTube without the interruptions.</ThemedText>
        <ThemedText style={styles.salesDesc}>
          Our own ad-free YouTube experience, built exclusively for Ultra Cast subscribers. No waiting. No skipping. Just watch.
        </ThemedText>

        {/* Pricing pill */}
        <View style={styles.pricePill}>
          <ThemedText style={styles.priceAmount}>£20</ThemedText>
          <View style={styles.priceMeta}>
            <ThemedText style={styles.priceLabel}>Lifetime Access</ThemedText>
            <ThemedText style={styles.priceSub}>One-time · No monthly fees</ThemedText>
          </View>
        </View>
      </View>

      {/* Right column — showcase + features + CTA */}
      <View style={styles.salesRight}>
        <ShowcaseCarousel />
        <View style={styles.salesFeatures}>
          <FeatureRow text="Auto-skips ALL adverts — instantly" />
          <FeatureRow text="Auto-skips sponsored &amp; promo sections" />
          <FeatureRow text="Clean, uninterrupted viewing" />
          <FeatureRow text="Built for Android TV big screen" />
        </View>

        <View style={styles.salesCompatRow}>
          <Feather name="tv" size={13} color="#f59e0b" />
          <ThemedText style={styles.salesCompatText}>Android TV &amp; Fire TV only — not for mobile</ThemedText>
        </View>

        <View style={styles.salesWhatsApp}>
          <Feather name="message-circle" size={16} color="#fff" />
          <ThemedText style={styles.salesWhatsAppText}>Enquire on WhatsApp</ThemedText>
          <ThemedText style={styles.salesWhatsAppNum}>07459 683 465</ThemedText>
        </View>

        <View style={styles.salesDisclaimer}>
          <Feather name="info" size={11} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.salesDisclaimerText}>
            Ultra Tube is a separate app to Ultra Cast and is not included in your subscription.
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

// ── Access / Subscriber view ───────────────────────────────────────────────
function AccessView({
  access,
  config,
  showPassword,
  setShowPassword,
  installPhase,
  startInstall,
  cancelInstall,
}: {
  access: AccessData;
  config: Config;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  installPhase: InstallPhase;
  startInstall: () => void;
  cancelInstall: () => void;
}) {
  const isBusy = installPhase.phase !== "idle" && installPhase.phase !== "error";
  const [dlFocused, setDlFocused] = useState(false);
  const [dlHovered, setDlHovered] = useState(false);
  const [dlPressed, setDlPressed] = useState(false);
  const dlHighlight = !isBusy && (dlFocused || dlHovered || dlPressed);

  return (
    <View style={styles.salesWrap}>
      {/* ── Left: identity + credentials ───────────────────────────────── */}
      <View style={styles.accessLeft}>
        {/* Logo */}
        <Image source={ULTRATUBE_LOGO} style={styles.utLogo} contentFit="contain" />

        {/* Active badge */}
        <View style={styles.activeBadge}>
          <Feather name="check-circle" size={12} color="#22c55e" />
          <ThemedText style={styles.activeBadgeText}>Active Subscriber</ThemedText>
        </View>

        {/* Credentials card */}
        <View style={styles.credCard}>
          <ThemedText style={styles.credCardTitle}>Your Login Credentials</ThemedText>

          <View style={styles.credRow}>
            <ThemedText style={styles.credLabel}>Username</ThemedText>
            <View style={styles.credValueRow}>
              <ThemedText style={styles.credValue} selectable numberOfLines={1}>
                {access.ultra_tube_username ?? ""}
              </ThemedText>
              <CopyButton value={access.ultra_tube_username ?? ""} />
            </View>
          </View>

          <View style={styles.dividerThin} />

          <View style={styles.credRow}>
            <ThemedText style={styles.credLabel}>Password</ThemedText>
            <View style={styles.credValueRow}>
              <ThemedText style={styles.credValue} selectable numberOfLines={1}>
                {showPassword ? access.ultra_tube_password ?? "" : "••••••••••••"}
              </ThemedText>
              <TVIconButton
                large
                onPress={() => setShowPassword(!showPassword)}
                icon={showPassword ? "eye-off" : "eye"}
              />
              <CopyButton value={access.ultra_tube_password ?? ""} />
            </View>
          </View>
        </View>

        {/* Separate app notice */}
        <View style={styles.separateNotice}>
          <Feather name="info" size={13} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.separateNoticeText}>
            Ultra Tube is a separate app to Ultra Cast. Use the credentials above to log in.
          </ThemedText>
        </View>
      </View>

      {/* ── Right: download code + install ─────────────────────────────── */}
      <View style={styles.accessRight}>
        {/* Downloader code */}
        <View style={styles.codeCard}>
          <View style={styles.codeCardHeader}>
            <ThemedText style={styles.codeCardTitle}>Downloader Code</ThemedText>
            <CopyButton value={config.downloader_code} label="Copy" />
          </View>
          <ThemedText style={styles.codeValue}>{config.downloader_code}</ThemedText>
          <ThemedText style={styles.codeSub}>
            Enter this code in the Downloader app, or tap below to install directly.
          </ThemedText>
        </View>

        {/* Download button */}
        <Pressable
          style={[styles.downloadBtn, isBusy && styles.downloadBtnBusy, dlHighlight && styles.downloadBtnHover]}
          onPress={startInstall}
          disabled={isBusy}
          onFocus={() => setDlFocused(true)}
          onBlur={() => setDlFocused(false)}
          onHoverIn={() => setDlHovered(true)}
          onHoverOut={() => setDlHovered(false)}
          onPressIn={() => setDlPressed(true)}
          onPressOut={() => setDlPressed(false)}
        >
          <Feather name="download" size={18} color="#fff" />
          <ThemedText style={styles.downloadBtnText}>
            {isBusy ? "Downloading..." : "Download & Install Ultra Tube"}
          </ThemedText>
        </Pressable>

        {/* Unknown sources */}
        <View style={styles.unknownSourcesNote}>
          <Feather name="shield" size={13} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.unknownSourcesText}>
            Requires "Install from unknown sources" to be enabled.
          </ThemedText>
        </View>

        {/* Compat */}
        <View style={styles.compatCard}>
          <Feather name="tv" size={13} color="#f59e0b" />
          <View style={styles.compatText}>
            <ThemedText style={styles.compatTitle}>Android TV & Fire TV Only</ThemedText>
            <ThemedText style={styles.compatSub}>Not compatible with mobile devices.</ThemedText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  center: { justifyContent: "center", alignItems: "center" },
  loadingSpinner: { alignItems: "center", gap: Spacing.sm },
  loadingText: { fontSize: 16, fontWeight: "700", color: ULTRA_RED },

  // Top nav bar
  topNav: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  backBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: "transparent",
  },
  backBtnActive: {
    backgroundColor: "rgba(255,255,255,0.07)", borderColor: Colors.dark.border,
  },
  backText: { fontSize: 14, color: Colors.dark.textSecondary },
  backTextActive: { color: Colors.dark.text },

  // Sales: centred card wrapper
  scrollFlex: { flex: 1 },
  salesCenter: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  salesCard: {
    width: "100%", maxWidth: 900,
    backgroundColor: "rgba(14,14,14,0.97)",
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: ULTRA_RED_BORDER,
    padding: Spacing.md,
    overflow: "hidden",
    shadowColor: ULTRA_RED, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 8,
  },

  // ── Shared two-column layout (sales + access) ────────────────────────────
  salesWrap: { flexDirection: "row", gap: Spacing.md, alignItems: "center" },

  // Access-specific columns
  accessLeft: {
    flex: 5, gap: Spacing.sm, justifyContent: "center",
    borderRightWidth: 1, borderRightColor: Colors.dark.border, paddingRight: Spacing.md,
  },
  accessRight: { flex: 6, gap: Spacing.sm, justifyContent: "center" },

  salesLeft: {
    flex: 5, gap: Spacing.sm, justifyContent: "center", alignItems: "center",
    borderRightWidth: 1, borderRightColor: Colors.dark.border,
    paddingRight: Spacing.md,
  },
  utLogo: { width: 190, height: 76, alignSelf: "center" },
  utLogoSales: { width: 200, height: 80, alignSelf: "center" },
  utLogoLoading: { width: 200, height: 80 },
  salesTagline: { fontSize: 15, fontWeight: "700", color: ULTRA_RED, textAlign: "center" },
  salesDesc: { fontSize: 13, color: Colors.dark.textSecondary, lineHeight: 20, textAlign: "center" },
  pricePill: {
    flexDirection: "row", alignItems: "center", gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: ULTRA_RED_BORDER, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    alignSelf: "center", marginTop: Spacing.xs,
  },
  priceAmount: { fontSize: 32, fontWeight: "900", color: ULTRA_RED },
  priceMeta: { gap: 2 },
  priceLabel: { fontSize: 13, fontWeight: "800", color: Colors.dark.text },
  priceSub: { fontSize: 11, color: Colors.dark.textSecondary },

  salesRight: { flex: 6, gap: Spacing.sm, justifyContent: "center" },
  salesFeatures: { gap: Spacing.xs },

  // ── Showcase carousel ────────────────────────────────────────────────────
  carouselWrap: { gap: Spacing.xs },
  carouselOuter: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: ULTRA_RED_BORDER,
    backgroundColor: "#080808",
    shadowColor: ULTRA_RED,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 10,
  },
  carouselImg: { width: "100%", height: "100%" },
  carouselDots: { flexDirection: "row", gap: 5, justifyContent: "center", paddingTop: 4 },
  carouselDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.dark.border },
  carouselDotActive: { backgroundColor: ULTRA_RED, width: 14, borderRadius: 3 },
  salesCompatRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(245,158,11,0.08)", borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: "rgba(245,158,11,0.25)", paddingHorizontal: 10, paddingVertical: 6,
    alignSelf: "flex-start",
  },
  salesCompatText: { fontSize: 12, color: "#f59e0b", fontWeight: "600" },
  salesWhatsApp: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    backgroundColor: WHATSAPP_GREEN, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.md,
    alignSelf: "flex-start",
  },
  salesWhatsAppText: { fontSize: 14, fontWeight: "800", color: "#fff" },
  salesWhatsAppNum: { fontSize: 12, color: "rgba(255,255,255,0.75)", marginLeft: 2 },
  salesDisclaimer: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  salesDisclaimerText: { fontSize: 11, color: Colors.dark.textSecondary, flex: 1, lineHeight: 16 },

  // ── Shared components ─────────────────────────────────────────────────────
  featureRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  featureCheck: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: ULTRA_RED, justifyContent: "center", alignItems: "center",
    flexShrink: 0,
  },
  featureText: { fontSize: 13, color: Colors.dark.text },

  // Access header
  heroIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: ULTRA_RED_DIM, borderWidth: 1, borderColor: ULTRA_RED_BORDER,
    justifyContent: "center", alignItems: "center",
  },
  heroTitle: { fontSize: 26, fontWeight: "900", color: Colors.dark.text, letterSpacing: -0.5 },
  heroTagline: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center" },
  accessHeader: { alignItems: "center", paddingVertical: Spacing.md, gap: Spacing.xs },
  activeBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    backgroundColor: "rgba(34,197,94,0.12)", borderWidth: 1, borderColor: "rgba(34,197,94,0.3)",
  },
  activeBadgeText: { fontSize: 12, fontWeight: "700", color: "#22c55e" },

  // Compat (used in AccessView)
  compatCard: {
    flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm,
    backgroundColor: "rgba(245,158,11,0.08)", borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: "rgba(245,158,11,0.3)", padding: Spacing.sm,
  },
  compatText: { flex: 1, gap: 2 },
  compatTitle: { fontSize: 12, fontWeight: "700", color: "#f59e0b" },
  compatSub: { fontSize: 11, color: Colors.dark.textSecondary },

  // Disclaimer (used in AccessView)
  disclaimer: {
    flexDirection: "row", gap: Spacing.sm, alignItems: "flex-start",
    paddingVertical: Spacing.sm,
  },
  disclaimerText: { fontSize: 11, color: Colors.dark.textSecondary, flex: 1, lineHeight: 16 },

  // Separate app notice
  separateNotice: {
    flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm,
    backgroundColor: "rgba(245,158,11,0.08)", borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: "rgba(245,158,11,0.3)", padding: Spacing.md,
  },
  separateNoticeText: { fontSize: 13, color: Colors.dark.textSecondary, flex: 1, lineHeight: 18 },

  // Credentials card
  credCard: {
    backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.dark.border, padding: Spacing.lg, gap: Spacing.md,
  },
  credCardTitle: { fontSize: 15, fontWeight: "800", color: Colors.dark.text, marginBottom: Spacing.xs },
  credRow: { gap: 6 },
  credLabel: { fontSize: 11, fontWeight: "700", color: Colors.dark.textSecondary, textTransform: "uppercase", letterSpacing: 0.8 },
  credValueRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  credValue: { fontSize: 16, color: Colors.dark.text, fontWeight: "600", flex: 1 },
  dividerThin: { height: 1, backgroundColor: Colors.dark.border },
  copyBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    padding: 6, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundRoot, borderWidth: 1, borderColor: Colors.dark.border,
  },
  copyBtnText: { fontSize: 11, fontWeight: "700", color: Colors.dark.textSecondary },

  // TV-focusable icon button (copy + eye)
  tvIconBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    minWidth: 32, minHeight: 32,
    paddingHorizontal: 8, paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  tvIconBtnLarge: { minWidth: 40, minHeight: 40, paddingHorizontal: 10, paddingVertical: 8 },
  tvIconBtnActive: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderColor: Colors.dark.textSecondary,
  },

  // Downloader code
  codeCard: {
    backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: ULTRA_RED_BORDER, padding: Spacing.lg, gap: Spacing.sm,
  },
  codeCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  codeCardTitle: { fontSize: 13, fontWeight: "700", color: Colors.dark.textSecondary, textTransform: "uppercase", letterSpacing: 0.8 },
  codeValue: { fontSize: 42, fontWeight: "900", color: ULTRA_RED, letterSpacing: 4, textAlign: "center", paddingVertical: Spacing.sm },
  codeSub: { fontSize: 12, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 18 },

  // Download button
  downloadBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm,
    backgroundColor: ULTRA_RED, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md + 2, paddingHorizontal: Spacing.xl,
  },
  downloadBtnBusy: { opacity: 0.6 },
  downloadBtnHover: {
    backgroundColor: "#c81e1e",
    shadowColor: ULTRA_RED, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55, shadowRadius: 14, elevation: 10,
  },
  downloadBtnText: { fontSize: 15, fontWeight: "800", color: "#fff" },

  // Unknown sources note
  unknownSourcesNote: {
    flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  unknownSourcesText: { fontSize: 12, color: Colors.dark.textSecondary, flex: 1, lineHeight: 18 },

  // Progress modal
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center", alignItems: "center", padding: Spacing.lg,
  },
  modalCard: {
    width: "100%", maxWidth: 400,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.dark.border,
    padding: Spacing.lg, alignItems: "center", gap: Spacing.sm,
  },
  modalIconRow: { marginBottom: Spacing.xs },
  modalTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.text, textAlign: "center" },
  modalSub: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center" },
  modalError: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 18 },
  progressTrack: {
    width: "100%", height: 8, borderRadius: 4,
    backgroundColor: Colors.dark.backgroundRoot, overflow: "hidden", marginTop: Spacing.sm,
  },
  progressFill: { height: "100%", backgroundColor: ULTRA_RED, borderRadius: 4 },
  modalActions: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.md, width: "100%" },
  modalBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundRoot, borderWidth: 1, borderColor: Colors.dark.border,
  },
  modalBtnText: { color: Colors.dark.text, fontWeight: "700", fontSize: 13 },
});
