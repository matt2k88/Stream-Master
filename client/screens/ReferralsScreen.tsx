import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Clipboard,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";

// ─── Hover-aware Pressable ────────────────────────────────────────────────────
function HoverBtn({
  style,
  activeStyle,
  onPress,
  disabled,
  children,
}: {
  style?: any;
  activeStyle?: any;
  onPress?: () => void;
  disabled?: boolean;
  children: React.ReactNode | ((active: boolean) => React.ReactNode);
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const active = (focused || pressed) && !disabled;
  return (
    <Pressable
      style={[style, active && activeStyle, disabled && { opacity: 0.45 }]}
      onPress={onPress}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      {typeof children === "function" ? children(active) : children}
    </Pressable>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.statCard, accent && styles.statCardAccent]}>
      <LinearGradient
        colors={
          accent
            ? ["rgba(255,102,0,0.18)", "rgba(255,102,0,0.04)"]
            : ["rgba(255,255,255,0.04)", "rgba(255,255,255,0.01)"]
        }
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={styles.statIconWrap}>
        <Feather
          name={icon as any}
          size={20}
          color={accent ? Colors.dark.accent : Colors.dark.textSecondary}
        />
      </View>
      <ThemedText style={[styles.statValue, accent && { color: Colors.dark.accent }]}>
        {value}
      </ThemedText>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
    </View>
  );
}

// ─── Code card ───────────────────────────────────────────────────────────────
function CodeCard({
  code,
  onGenerate,
  generating,
  copied,
  onCopy,
}: {
  code: string | null;
  onGenerate: () => void;
  generating: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <View style={styles.codeCard}>
      <LinearGradient
        colors={["rgba(255,102,0,0.14)", "rgba(255,102,0,0.03)"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={styles.codeCardInner}>
        <Feather name="gift" size={22} color={Colors.dark.accent} />
        <ThemedText style={styles.codeCardTitle}>Your Referral Code</ThemedText>
        <ThemedText style={styles.codeCardSub}>
          Share this with friends to earn tokens when they join
        </ThemedText>

        {code ? (
          <View style={styles.codeRow}>
            <View style={styles.codePill}>
              <ThemedText style={styles.codeText} selectable>
                {code}
              </ThemedText>
            </View>
            <HoverBtn
              style={styles.copyBtn}
              activeStyle={styles.copyBtnActive}
              onPress={onCopy}
            >
              {(active) => (
                <View style={styles.copyBtnInner}>
                  <Feather
                    name={copied ? "check" : "copy"}
                    size={16}
                    color={copied ? "#4caf50" : active ? Colors.dark.accent : Colors.dark.text}
                  />
                  <ThemedText
                    style={[
                      styles.copyBtnLabel,
                      copied && { color: "#4caf50" },
                      active && !copied && { color: Colors.dark.accent },
                    ]}
                  >
                    {copied ? "Copied" : "Copy"}
                  </ThemedText>
                </View>
              )}
            </HoverBtn>
          </View>
        ) : (
          <View style={styles.generateWrap}>
            <ThemedText style={styles.noCodeText}>
              You do not have a referral code yet
            </ThemedText>
            <HoverBtn
              style={styles.generateBtn}
              activeStyle={styles.generateBtnActive}
              onPress={onGenerate}
              disabled={generating}
            >
              {(active) => (
                <LinearGradient
                  colors={
                    active
                      ? ["rgba(255,130,30,1)", "rgba(255,80,0,1)"]
                      : ["rgba(255,102,0,0.9)", "rgba(220,70,0,0.9)"]
                  }
                  style={styles.generateBtnGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {generating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather name="zap" size={16} color="#fff" />
                      <ThemedText style={styles.generateBtnLabel}>
                        Generate My Code
                      </ThemedText>
                    </>
                  )}
                </LinearGradient>
              )}
            </HoverBtn>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
interface ReferralData {
  referral_code: string | null;
  referral_count: number;
  referral_tokens: number;
}

const BASE = `${process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "http://localhost:5000"}`;

async function fetchReferrals(username: string): Promise<ReferralData> {
  const res = await fetch(`${BASE}/api/referrals?username=${encodeURIComponent(username)}`);
  if (!res.ok) throw new Error("Failed to load referral data");
  return res.json();
}

async function generateCode(username: string): Promise<string> {
  const res = await fetch(`${BASE}/api/referrals/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Failed to generate code");
  }
  const json = await res.json();
  return json.referral_code;
}

export default function ReferralsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const { userInfo } = useAuth();
  const username = userInfo?.user_info?.username ?? "";

  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!username) {
        setError("No username found — please log in again.");
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const result = await fetchReferrals(username);
        setData(result);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load referral data");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [username],
  );

  // Load on mount
  React.useEffect(() => {
    load();
  }, [load]);

  const handleGenerate = async () => {
    if (!username) return;
    setGenerating(true);
    try {
      const code = await generateCode(username);
      setData((prev) =>
        prev ? { ...prev, referral_code: code } : { referral_code: code, referral_count: 0, referral_tokens: 0 },
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate code");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (data?.referral_code) {
      Clipboard.setString(data.referral_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const padTop = insets.top + Spacing.md;
  const padH = insets.left + Spacing.lg;

  return (
    <ThemedView style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: padTop, paddingHorizontal: padH }]}>
        <HoverBtn
          style={styles.iconBtn}
          activeStyle={styles.iconBtnActive}
          onPress={() => navigation.goBack()}
        >
          {(active) => (
            <Feather
              name="arrow-left"
              size={20}
              color={active ? Colors.dark.accent : Colors.dark.text}
            />
          )}
        </HoverBtn>
        <ThemedText style={styles.headerTitle}>Referrals</ThemedText>
        <HoverBtn
          style={styles.iconBtn}
          activeStyle={styles.iconBtnActive}
          onPress={() => load(true)}
          disabled={loading || refreshing}
        >
          {(_active) =>
            refreshing ? (
              <ActivityIndicator size="small" color={Colors.dark.accent} />
            ) : (
              <Feather name="refresh-cw" size={16} color={Colors.dark.textSecondary} />
            )
          }
        </HoverBtn>
      </View>

      {loading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>Loading your referral data...</ThemedText>
        </View>
      ) : error ? (
        <View style={styles.centred}>
          <Feather name="alert-circle" size={36} color="#e57373" style={{ marginBottom: Spacing.md }} />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <HoverBtn
            style={styles.retryBtn}
            activeStyle={styles.retryBtnActive}
            onPress={() => load()}
          >
            {(active) => (
              <ThemedText style={[styles.retryLabel, active && { color: Colors.dark.accent }]}>
                Try Again
              </ThemedText>
            )}
          </HoverBtn>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: padH,
            paddingBottom: insets.bottom + Spacing.xl,
            paddingTop: Spacing.lg,
            gap: Spacing.lg,
          }}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
        >
          {/* Intro banner */}
          <View style={styles.banner}>
            <LinearGradient
              colors={["rgba(255,102,0,0.22)", "rgba(255,102,0,0.05)"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <Feather name="users" size={28} color={Colors.dark.accent} />
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.bannerTitle}>Refer friends, earn rewards</ThemedText>
              <ThemedText style={styles.bannerSub}>
                Every friend who signs up with your code earns you tokens. The more you share, the more you earn.
              </ThemedText>
            </View>
          </View>

          {/* Stat + code row: 33/33/33 on landscape, stacked on portrait */}
          <View style={isLandscape ? styles.topGridLandscape : styles.statsRow}>
            <View style={{ flex: 1 }}>
              <StatCard
                label="Referrals Made"
                value={data?.referral_count ?? 0}
                icon="user-plus"
                accent={(data?.referral_count ?? 0) > 0}
              />
            </View>
            <View style={{ flex: 1 }}>
              <StatCard
                label="Tokens Earned"
                value={data?.referral_tokens ?? 0}
                icon="star"
                accent={(data?.referral_tokens ?? 0) > 0}
              />
            </View>
            {isLandscape ? (
              <View style={{ flex: 1 }}>
                <CodeCard
                  code={data?.referral_code ?? null}
                  onGenerate={handleGenerate}
                  generating={generating}
                  copied={copied}
                  onCopy={handleCopy}
                />
              </View>
            ) : null}
          </View>

          {/* Code card (portrait only — landscape renders it in the row above) */}
          {isLandscape ? null : (
            <CodeCard
              code={data?.referral_code ?? null}
              onGenerate={handleGenerate}
              generating={generating}
              copied={copied}
              onCopy={handleCopy}
            />
          )}

          {/* Store callout */}
          <View style={styles.storeCard}>
            <LinearGradient
              colors={["rgba(124,77,255,0.20)", "rgba(255,102,0,0.10)"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={styles.storeIconWrap}>
              <Feather name="shopping-bag" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.storeTitle}>Redeem your tokens</ThemedText>
              <ThemedText style={styles.storeSub}>
                Head to the Referrals Store at{" "}
                <ThemedText style={styles.storeLink}>UltraCast.co.uk</ThemedText> to
                trade your tokens for amazing prizes.
              </ThemedText>
            </View>
          </View>

          {/* Promo tip */}
          <View style={styles.promoRow}>
            <Feather name="trending-up" size={16} color="#FFD24A" />
            <ThemedText style={styles.promoText}>
              Keep an eye out! Occasionally we run promotions that earn you more
              tokens per referral.
            </ThemedText>
          </View>

          {/* How it works + Referral notice: 50/50 on landscape, stacked on portrait */}
          <View style={[styles.bottomWrap, isLandscape && styles.bottomWrapLandscape]}>
            {/* How it works */}
            <View style={[styles.howSection, isLandscape && styles.bottomCol]}>
              <View style={styles.sectionHead}>
                <Feather name="help-circle" size={15} color={Colors.dark.accent} />
                <ThemedText style={styles.howTitle}>How it works</ThemedText>
              </View>
              <View style={styles.howCard}>
                {[
                  {
                    icon: "share-2",
                    text: "Pass your unique code to your friends and family.",
                  },
                  {
                    icon: "message-circle",
                    text: "Ask them to contact us to sign up and provide the code.",
                  },
                  {
                    icon: "star",
                    text: "Each successful referral gets you 10 tokens!",
                    highlight: true,
                  },
                ].map((step, i, arr) => (
                  <View
                    key={step.icon}
                    style={[styles.howRow, i < arr.length - 1 && styles.howRowDivider]}
                  >
                    <View style={[styles.howIcon, step.highlight && styles.howIconHi]}>
                      <Feather
                        name={step.icon as any}
                        size={16}
                        color={step.highlight ? "#FFD24A" : Colors.dark.accent}
                      />
                    </View>
                    <ThemedText
                      style={[styles.howText, step.highlight && styles.howTextHi]}
                    >
                      {step.text}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </View>

            {/* Referral notice */}
            <View style={[styles.noticeCard, isLandscape && styles.bottomCol]}>
              <View style={styles.noticeHead}>
                <Feather name="shield" size={16} color="#e57373" />
                <ThemedText style={styles.noticeTitle}>Referral Notice</ThemedText>
              </View>
              <ThemedText style={styles.noticeText}>
                Please only refer friends, family, or people you personally know and
                trust. Referring random people is strictly forbidden.
              </ThemedText>
              <ThemedText style={styles.noticeText}>
                Doing so not only puts the security and reliability of the service at
                risk, but may also create unnecessary risks for yourself. Any
                referrals found to be unsafe, suspicious, or made to unknown/random
                individuals will be removed or refused.
              </ThemedText>
            </View>
          </View>
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.dark.background },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnActive: {
    borderColor: Colors.dark.accent + "55",
    backgroundColor: Colors.dark.accent + "18",
  },

  // Loading / error
  centred: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.md, padding: Spacing.xl },
  loadingText: { color: Colors.dark.textSecondary, fontSize: 14 },
  errorText: { color: "#e57373", fontSize: 14, textAlign: "center" },
  retryBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  retryBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accent + "18" },
  retryLabel: { color: Colors.dark.text, fontSize: 14 },

  // Banner
  banner: {
    flexDirection: "row",
    gap: Spacing.md,
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.35)",
    overflow: "hidden",
  },
  bannerTitle: { fontSize: 15, fontWeight: "700", color: Colors.dark.text, marginBottom: 3 },
  bannerSub: { fontSize: 12.5, color: Colors.dark.textSecondary, lineHeight: 18 },

  // Stat cards
  statsRow: { flexDirection: "row", gap: Spacing.md },
  topGridLandscape: { flexDirection: "row", gap: Spacing.md, alignItems: "stretch" },
  bottomWrap: { gap: Spacing.lg },
  bottomWrapLandscape: { flexDirection: "row", gap: Spacing.lg, alignItems: "flex-start" },
  bottomCol: { flex: 1 },
  statCard: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
    overflow: "hidden",
  },
  statCardAccent: { borderColor: "rgba(255,102,0,0.45)" },
  statIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { fontSize: 32, fontWeight: "800", color: Colors.dark.text, lineHeight: 36 },
  statLabel: { fontSize: 11, color: Colors.dark.textSecondary, textAlign: "center" },

  // Code card
  codeCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.35)",
    overflow: "hidden",
  },
  codeCardInner: {
    padding: Spacing.lg,
    gap: Spacing.md,
    alignItems: "center",
  },
  codeCardTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.text },
  codeCardSub: {
    fontSize: 12.5,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },

  // Code display
  codeRow: { flexDirection: "row", gap: Spacing.sm, alignItems: "center" },
  codePill: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  codeText: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.accent,
    letterSpacing: 4,
  },
  copyBtn: {
    height: 52,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  copyBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accent + "18" },
  copyBtnInner: { alignItems: "center", gap: 4 },
  copyBtnLabel: { fontSize: 10, color: Colors.dark.textSecondary },

  // Generate
  generateWrap: { width: "100%", gap: Spacing.md, alignItems: "center" },
  noCodeText: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center" },
  generateBtn: { width: "100%", borderRadius: BorderRadius.md, overflow: "hidden" },
  generateBtnActive: {},
  generateBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.xl,
  },
  generateBtnLabel: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // How it works
  howSection: { gap: Spacing.sm },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  howTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  howCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary + "80",
    paddingHorizontal: Spacing.lg,
  },
  howRow: {
    flexDirection: "row",
    gap: Spacing.md,
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  howRowDivider: { borderBottomWidth: 1, borderBottomColor: Colors.dark.border },
  howIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.accent + "1A",
    borderWidth: 1,
    borderColor: Colors.dark.accent + "44",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  howIconHi: {
    backgroundColor: "rgba(255,210,74,0.16)",
    borderColor: "rgba(255,210,74,0.5)",
  },
  howText: { flex: 1, fontSize: 13.5, color: Colors.dark.text, lineHeight: 19 },
  howTextHi: { fontWeight: "700", color: "#FFE08A" },

  // Store callout
  storeCard: {
    flexDirection: "row",
    gap: Spacing.md,
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(124,77,255,0.4)",
    overflow: "hidden",
  },
  storeIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(124,77,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  storeTitle: { fontSize: 15, fontWeight: "700", color: Colors.dark.text, marginBottom: 3 },
  storeSub: { fontSize: 12.5, color: Colors.dark.textSecondary, lineHeight: 18 },
  storeLink: { color: "#fff", fontWeight: "700" },

  // Promo tip
  promoRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,210,74,0.35)",
    backgroundColor: "rgba(255,210,74,0.08)",
  },
  promoText: { flex: 1, fontSize: 12.5, color: "#FFE08A", lineHeight: 18 },

  // Referral notice
  noticeCard: {
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(229,115,115,0.4)",
    backgroundColor: "rgba(229,115,115,0.07)",
  },
  noticeHead: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  noticeTitle: { fontSize: 14, fontWeight: "700", color: "#e57373" },
  noticeText: { fontSize: 12.5, color: Colors.dark.textSecondary, lineHeight: 18 },
});
