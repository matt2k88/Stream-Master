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

const ULTRA_MUSIC_LOGO = require("../assets/ultramusic/um-logo.png");

const UM_ORANGE       = "#FF6600";
const UM_ORANGE_DIM   = "rgba(255,102,0,0.12)";
const UM_ORANGE_BORDER = "rgba(255,102,0,0.30)";
const UNKNOWN_SOURCES_KEY = "@ultracast:ultramusic_unknown_sources_v1";
const APK_PREFIX = "ultramusic-";

// Package name for Ultra Music — used for the "Open" button.
// Update this once the final APK package name is confirmed.
const ULTRA_MUSIC_PACKAGE = "com.beats4u.app";

type InstallPhase =
  | { phase: "idle" }
  | { phase: "preparing" }
  | { phase: "downloading"; progress: number; receivedMb: number; totalMb: number }
  | { phase: "installing" }
  | { phase: "error"; message: string };

interface AccessData {
  hasAccess: boolean;
  ultra_music_username?: string;
  ultra_music_password?: string;
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
    for (const name of entries.filter(
      (n) => n.startsWith(APK_PREFIX) && n.endsWith(".apk"),
    )) {
      try { await LegacyFS.deleteAsync(dir + name, { idempotent: true }); } catch {}
    }
  } catch {}
}

// ── Reusable TV-friendly components (mirrored from UltraTubeScreen) ───────────

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
  const iconColor = triggered && activeColor
    ? activeColor
    : active ? Colors.dark.text : Colors.dark.textSecondary;
  return (
    <Pressable
      onPress={() => {
        setTriggered(true);
        setTimeout(() => setTriggered(false), 1800);
        onPress();
      }}
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
        <ThemedText
          style={[
            styles.copyBtnText,
            triggered && activeColor
              ? { color: activeColor }
              : active ? { color: Colors.dark.text } : undefined,
          ]}
        >
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

// ── Main screen ───────────────────────────────────────────────────────────────

export default function UltraMusicScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { userInfo } = useAuth();
  const username = (userInfo as any)?.user_info?.username ?? "";

  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<AccessData>({ hasAccess: false });
  const [config, setConfig] = useState<Config>({
    apk_url: "https://app.ultracast.co.uk/ultramusic.apk",
    downloader_code: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [installPhase, setInstallPhase] = useState<InstallPhase>({ phase: "idle" });
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const resumableRef = useRef<LegacyFS.DownloadResumable | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cfgRes, accRes] = await Promise.all([
          fetch(new URL("/api/ultra-music/config", getApiUrl()).toString()),
          username
            ? fetch(new URL(`/api/ultra-music/check?username=${encodeURIComponent(username.toLowerCase())}`, getApiUrl()).toString())
            : Promise.resolve(null),
        ]);
        if (cfgRes.ok) {
          const d = await cfgRes.json();
          if (alive) setConfig({
            apk_url: d.apk_url ?? config.apk_url,
            downloader_code: d.downloader_code ?? config.downloader_code,
          });
        }
        if (accRes && accRes.ok) {
          const d = await accRes.json();
          if (alive) setAccess(d);
        }
      } catch {}
      // Probe whether Ultra Music is installed — android-app:// resolves iff the
      // package is present on the device. Defaults false so the button stays hidden
      // until the check resolves.
      if (Platform.OS === "android") {
        Linking.canOpenURL(`android-app://${ULTRA_MUSIC_PACKAGE}`)
          .then((can) => { if (alive) setIsAppInstalled(can); })
          .catch(() => {});
      }
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
    const flags = 1 | 268435456;
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

  const openUltraMusic = useCallback(async () => {
    if (Platform.OS !== "android") return;
    try {
      await IntentLauncher.startActivityAsync(
        "android.intent.action.MAIN",
        {
          packageName: ULTRA_MUSIC_PACKAGE,
          flags: 268435456, // FLAG_ACTIVITY_NEW_TASK
        },
      );
    } catch {
      Alert.alert(
        "Ultra Music not found",
        "Ultra Music doesn't appear to be installed on this device. Download and install it first using the button below.",
      );
    }
  }, []);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <LinearGradient
          colors={["rgba(255,102,0,0.06)", "transparent"]}
          style={StyleSheet.absoluteFill}
          locations={[0, 0.5]}
        />
        <View style={[styles.center, { gap: Spacing.sm }]}>
          <Image source={ULTRA_MUSIC_LOGO} style={{ width: 200, height: 80 }} contentFit="contain" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["rgba(255,102,0,0.08)", "rgba(8,8,8,0)", "rgba(8,8,8,0)"]}
        style={StyleSheet.absoluteFill}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <View style={[styles.topNav, { paddingTop: insets.top + Spacing.xs }]}>
        <SideMenuButton />
        <TVBackButton onPress={() => navigation.goBack()} />
      </View>

      {access.hasAccess ? (
        <ScrollView
          style={styles.scrollFlex}
          contentContainerStyle={styles.salesCenter}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.salesCard}>
            <LinearGradient
              colors={["rgba(255,102,0,0.05)", "transparent"]}
              style={[StyleSheet.absoluteFill, { borderRadius: BorderRadius.xl }]}
              locations={[0, 0.6]}
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
              openUltraMusic={openUltraMusic}
              isAppInstalled={isAppInstalled}
            />
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scrollFlex}
          contentContainerStyle={styles.salesCenter}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.salesCard}>
            <LinearGradient
              colors={["rgba(255,102,0,0.05)", "transparent"]}
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
                  <Feather name="download" size={28} color={UM_ORANGE} />
                )}
              </View>
              <ThemedText style={styles.modalTitle}>
                {installPhase.phase === "preparing" && "Preparing download..."}
                {installPhase.phase === "downloading" && "Downloading Ultra Music"}
                {installPhase.phase === "installing" && "Opening installer"}
                {installPhase.phase === "error" && "Download failed"}
              </ThemedText>
              {installPhase.phase === "downloading" ? (
                <>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.round(installPhase.progress * 100)}%` as any },
                      ]}
                    />
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
                  <Pressable
                    style={[styles.modalBtn, { backgroundColor: UM_ORANGE, borderColor: UM_ORANGE }]}
                    onPress={startInstall}
                  >
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

// ── Sales / No-access view ────────────────────────────────────────────────────

function UltraMusicLogo({ width = 200, height = 80 }: { width?: number; height?: number }) {
  return (
    <Image
      source={ULTRA_MUSIC_LOGO}
      style={{ width, height, alignSelf: "center" }}
      contentFit="contain"
    />
  );
}

function SalesView() {
  return (
    <View style={styles.salesWrap}>
      {/* Left column — branding + pricing */}
      <View style={styles.salesLeft}>
        <UltraMusicLogo width={210} height={84} />
        <ThemedText style={styles.salesTagline}>
          Your music, without limits.
        </ThemedText>
        <ThemedText style={styles.salesDesc}>
          A dedicated music streaming app built exclusively for Ultra Cast subscribers. Stream millions of tracks, ad-free, on your TV or Fire Stick.
        </ThemedText>

        <View style={styles.pricePill}>
          <ThemedText style={styles.priceAmount}>£20</ThemedText>
          <View style={styles.priceMeta}>
            <ThemedText style={styles.priceLabel}>per year</ThemedText>
            <ThemedText style={styles.priceSub}>Ultra Cast subscribers only</ThemedText>
          </View>
        </View>
      </View>

      {/* Right column — features + CTA */}
      <View style={styles.salesRight}>
        <View style={styles.salesFeatures}>
          <FeatureRow text="Millions of tracks — completely ad-free" />
          <FeatureRow text="Playlists, albums, artists and radio" />
          <FeatureRow text="Offline listening — download for later" />
          <FeatureRow text="High-quality audio up to 320kbps" />
          <FeatureRow text="Built for Android TV &amp; Fire TV big screen" />
          <FeatureRow text="Separate app — use alongside Ultra Cast" />
        </View>

        <View style={styles.salesCompatRow}>
          <Feather name="tv" size={13} color="#f59e0b" />
          <ThemedText style={styles.salesCompatText}>
            Android TV &amp; Fire TV — mobile supported too
          </ThemedText>
        </View>

        <View style={styles.salesWhatsApp}>
          <Feather name="message-circle" size={16} color="#fff" />
          <ThemedText style={styles.salesWhatsAppText}>Subscribe on WhatsApp</ThemedText>
          <ThemedText style={styles.salesWhatsAppNum}>07459 683 465</ThemedText>
        </View>

        <View style={styles.salesDisclaimer}>
          <Feather name="info" size={11} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.salesDisclaimerText}>
            Ultra Music is a separate app to Ultra Cast and requires its own subscription.
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

// ── Access / Subscriber view ──────────────────────────────────────────────────

function AccessView({
  access,
  config,
  showPassword,
  setShowPassword,
  installPhase,
  startInstall,
  cancelInstall,
  openUltraMusic,
  isAppInstalled,
}: {
  access: AccessData;
  config: Config;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  installPhase: InstallPhase;
  startInstall: () => void;
  cancelInstall: () => void;
  openUltraMusic: () => void;
  isAppInstalled: boolean;
}) {
  const isBusy = installPhase.phase !== "idle" && installPhase.phase !== "error";
  const [dlFocused, setDlFocused] = useState(false);
  const [dlHovered, setDlHovered] = useState(false);
  const [dlPressed, setDlPressed] = useState(false);
  const dlHighlight = !isBusy && (dlFocused || dlHovered || dlPressed);

  const [openFocused, setOpenFocused] = useState(false);
  const [openHovered, setOpenHovered] = useState(false);
  const [openPressed, setOpenPressed] = useState(false);
  const openHighlight = openFocused || openHovered || openPressed;

  return (
    <View style={styles.salesWrap}>
      {/* ── Left: identity + credentials ── */}
      <View style={styles.accessLeft}>
        <UltraMusicLogo width={190} height={76} />

        <View style={styles.activeBadge}>
          <Feather name="check-circle" size={12} color="#22c55e" />
          <ThemedText style={styles.activeBadgeText}>Active Subscriber</ThemedText>
        </View>

        <View style={styles.credCard}>
          <ThemedText style={styles.credCardTitle}>Your Login Credentials</ThemedText>

          <View style={styles.credRow}>
            <ThemedText style={styles.credLabel}>Username</ThemedText>
            <View style={styles.credValueRow}>
              <ThemedText style={styles.credValue} selectable numberOfLines={1}>
                {access.ultra_music_username ?? ""}
              </ThemedText>
              <CopyButton value={access.ultra_music_username ?? ""} />
            </View>
          </View>

          <View style={styles.dividerThin} />

          <View style={styles.credRow}>
            <ThemedText style={styles.credLabel}>Password</ThemedText>
            <View style={styles.credValueRow}>
              <ThemedText style={styles.credValue} selectable numberOfLines={1}>
                {showPassword ? access.ultra_music_password ?? "" : "••••••••••••"}
              </ThemedText>
              <TVIconButton
                large
                onPress={() => setShowPassword(!showPassword)}
                icon={showPassword ? "eye-off" : "eye"}
              />
              <CopyButton value={access.ultra_music_password ?? ""} />
            </View>
          </View>
        </View>

        <View style={styles.separateNotice}>
          <Feather name="info" size={13} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.separateNoticeText}>
            Ultra Music is a separate app. Use the credentials above to log in.
          </ThemedText>
        </View>
      </View>

      {/* ── Right: open / download / install ── */}
      <View style={styles.accessRight}>
        {/* Open Ultra Music — only shown when the app is detected on this device */}
        {isAppInstalled ? (
          <Pressable
            style={[styles.openBtn, openHighlight && styles.openBtnHover]}
            onPress={openUltraMusic}
            onFocus={() => setOpenFocused(true)}
            onBlur={() => setOpenFocused(false)}
            onHoverIn={() => setOpenHovered(true)}
            onHoverOut={() => setOpenHovered(false)}
            onPressIn={() => setOpenPressed(true)}
            onPressOut={() => setOpenPressed(false)}
          >
            <Feather name="play-circle" size={20} color="#fff" />
            <ThemedText style={styles.openBtnText}>Open Ultra Music</ThemedText>
          </Pressable>
        ) : null}

        {/* Downloader code — only if one is configured */}
        {config.downloader_code ? (
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
        ) : null}

        {/* Download & install button */}
        <Pressable
          style={[
            styles.downloadBtn,
            isBusy && styles.downloadBtnBusy,
            dlHighlight && styles.downloadBtnHover,
          ]}
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
            {isBusy ? "Downloading..." : "Download & Install Ultra Music"}
          </ThemedText>
        </Pressable>

        <View style={styles.unknownSourcesNote}>
          <Feather name="shield" size={13} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.unknownSourcesText}>
            Requires "Install from unknown sources" to be enabled.
          </ThemedText>
        </View>

        <View style={styles.compatCard}>
          <Feather name="tv" size={13} color="#f59e0b" />
          <View style={styles.compatText}>
            <ThemedText style={styles.compatTitle}>Android TV, Fire TV &amp; Mobile</ThemedText>
            <ThemedText style={styles.compatSub}>Works across all Android devices.</ThemedText>
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  center: { justifyContent: "center", alignItems: "center", flex: 1 },

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
  backBtnActive: { backgroundColor: "rgba(255,255,255,0.07)", borderColor: Colors.dark.border },
  backText: { fontSize: 14, color: Colors.dark.textSecondary },
  backTextActive: { color: Colors.dark.text },

  scrollFlex: { flex: 1 },
  salesCenter: {
    flexGrow: 1, justifyContent: "center", alignItems: "center",
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
  },
  salesCard: {
    width: "100%", maxWidth: 900,
    backgroundColor: "rgba(14,14,14,0.97)",
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: UM_ORANGE_BORDER,
    padding: Spacing.md,
    overflow: "hidden",
  },

  salesWrap: { flexDirection: "row", gap: Spacing.md, alignItems: "center" },

  salesLeft: {
    flex: 5, gap: Spacing.sm, justifyContent: "center", alignItems: "center",
    borderRightWidth: 1, borderRightColor: Colors.dark.border,
    paddingRight: Spacing.md,
  },
  salesRight: { flex: 6, gap: Spacing.sm, justifyContent: "center" },
  salesTagline: { fontSize: 15, fontWeight: "700", color: UM_ORANGE, textAlign: "center" },
  salesDesc: { fontSize: 13, color: Colors.dark.textSecondary, lineHeight: 20, textAlign: "center" },

  pricePill: {
    flexDirection: "row", alignItems: "center", gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: UM_ORANGE_BORDER,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    alignSelf: "center", marginTop: Spacing.xs,
  },
  priceAmount: { fontSize: 32, fontWeight: "900", color: UM_ORANGE },
  priceMeta: { gap: 2 },
  priceLabel: { fontSize: 13, fontWeight: "800", color: Colors.dark.text },
  priceSub: { fontSize: 11, color: Colors.dark.textSecondary },

  salesFeatures: { gap: Spacing.xs },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  featureCheck: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: UM_ORANGE, alignItems: "center", justifyContent: "center",
  },
  featureText: { fontSize: 13, color: Colors.dark.text, flex: 1 },

  salesCompatRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(245,158,11,0.08)", borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: "rgba(245,158,11,0.25)",
    paddingHorizontal: 10, paddingVertical: 6, alignSelf: "flex-start",
  },
  salesCompatText: { fontSize: 12, color: "#f59e0b", fontWeight: "600" },

  salesWhatsApp: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(37,211,102,0.08)", borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: "rgba(37,211,102,0.25)",
    paddingHorizontal: 10, paddingVertical: 8,
  },
  salesWhatsAppText: { fontSize: 13, color: "#25D366", fontWeight: "600" },
  salesWhatsAppNum: { fontSize: 13, color: "#25D366", fontWeight: "700", marginLeft: "auto" as any },

  salesDisclaimer: {
    flexDirection: "row", gap: 6, alignItems: "flex-start",
    backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.sm,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  salesDisclaimerText: { fontSize: 11, color: Colors.dark.textSecondary, flex: 1, lineHeight: 16 },

  // Access view
  accessLeft: {
    flex: 5, gap: Spacing.sm, justifyContent: "center",
    borderRightWidth: 1, borderRightColor: Colors.dark.border,
    paddingRight: Spacing.md,
  },
  accessRight: { flex: 6, gap: Spacing.sm, justifyContent: "center" },

  activeBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(34,197,94,0.10)", borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: "rgba(34,197,94,0.25)",
    paddingHorizontal: 10, paddingVertical: 5, alignSelf: "center",
  },
  activeBadgeText: { fontSize: 12, color: "#22c55e", fontWeight: "700" },

  credCard: {
    backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, gap: Spacing.xs,
  },
  credCardTitle: { fontSize: 12, color: Colors.dark.textSecondary, fontWeight: "600", marginBottom: 2 },
  credRow: { gap: 2 },
  credLabel: { fontSize: 11, color: Colors.dark.textSecondary },
  credValueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  credValue: { flex: 1, fontSize: 14, color: Colors.dark.text, fontWeight: "600", fontFamily: "monospace" },
  dividerThin: { height: 1, backgroundColor: Colors.dark.border },

  separateNotice: {
    flexDirection: "row", gap: 6, alignItems: "flex-start",
    backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.sm,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  separateNoticeText: { fontSize: 11, color: Colors.dark.textSecondary, flex: 1, lineHeight: 16 },

  openBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: UM_ORANGE, borderRadius: BorderRadius.md,
    paddingVertical: 14, paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: UM_ORANGE,
  },
  openBtnHover: { backgroundColor: "#e65c00", borderColor: "#e65c00" },
  openBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },

  codeCard: {
    backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, gap: 4,
  },
  codeCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  codeCardTitle: { fontSize: 12, color: Colors.dark.textSecondary, fontWeight: "600" },
  codeValue: { fontSize: 28, fontWeight: "900", color: UM_ORANGE, letterSpacing: 4 },
  codeSub: { fontSize: 11, color: Colors.dark.textSecondary, lineHeight: 15 },

  downloadBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: "rgba(255,102,0,0.15)", borderRadius: BorderRadius.md,
    paddingVertical: 12, paddingHorizontal: Spacing.md,
    borderWidth: 1, borderColor: UM_ORANGE_BORDER,
  },
  downloadBtnBusy: { opacity: 0.5 },
  downloadBtnHover: { backgroundColor: UM_ORANGE_DIM, borderColor: UM_ORANGE },
  downloadBtnText: { fontSize: 15, fontWeight: "700", color: Colors.dark.text },

  unknownSourcesNote: {
    flexDirection: "row", gap: 6, alignItems: "flex-start",
    backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.sm,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  unknownSourcesText: { fontSize: 11, color: Colors.dark.textSecondary, flex: 1, lineHeight: 16 },

  compatCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(245,158,11,0.07)", borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: "rgba(245,158,11,0.22)",
    paddingHorizontal: 10, paddingVertical: 8,
  },
  compatText: { flex: 1, gap: 1 },
  compatTitle: { fontSize: 13, fontWeight: "700", color: "#f59e0b" },
  compatSub: { fontSize: 11, color: Colors.dark.textSecondary },

  // Icon buttons
  tvIconBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 5, paddingHorizontal: 7,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: "transparent",
  },
  tvIconBtnLarge: { paddingVertical: 7, paddingHorizontal: 9 },
  tvIconBtnActive: { backgroundColor: "rgba(255,255,255,0.07)", borderColor: Colors.dark.border },
  copyBtnText: { fontSize: 12, color: Colors.dark.textSecondary },

  // Modal
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center", alignItems: "center",
  },
  modalCard: {
    width: 340, backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl, padding: Spacing.lg, gap: Spacing.sm,
    borderWidth: 1, borderColor: Colors.dark.border,
    alignItems: "center",
  },
  modalIconRow: { marginBottom: 4 },
  modalTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.text, textAlign: "center" },
  modalSub: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center" },
  modalError: { fontSize: 13, color: Colors.dark.error, textAlign: "center", lineHeight: 19 },
  progressTrack: {
    width: "100%", height: 6, borderRadius: 3,
    backgroundColor: Colors.dark.border, overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: UM_ORANGE, borderRadius: 3 },
  modalActions: { flexDirection: "row", gap: Spacing.sm, marginTop: 4 },
  modalBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 9, paddingHorizontal: 14,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modalBtnText: { fontSize: 14, color: Colors.dark.text, fontWeight: "600" },
});
