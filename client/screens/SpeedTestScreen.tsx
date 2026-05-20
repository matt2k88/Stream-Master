// ─── Speed Test ──────────────────────────────────────────────────────────
//
// Measures the user's ping (HTTP round-trip avg of 5 probes) followed by a
// 6-second download throughput test. The download phase is *always* exactly
// 6 seconds long regardless of the user's actual link speed — slow links
// run for 6s and report whatever they managed; fast links also run for 6s
// and the response is aborted at the deadline. This gives a representative
// average rather than a misleading instantaneous burst.
//
// We deliberately use Cloudflare's public speed-test backend
// (`speed.cloudflare.com/__down?bytes=...`). It serves a CORS-enabled
// stream of zero bytes of any requested length, is globally edge-cached,
// and is free for client use — same backend speed.cloudflare.com itself
// uses. XHR is used (not fetch) because XHR's `onprogress` fires
// reliably on both web and React Native, whereas fetch streaming
// (`response.body.getReader`) is unsupported in older RN runtimes and on
// Hermes Android builds.
//
// Recommendation table mirrors common UK/EU streaming guidance:
//   SD    ≥ 5 Mbps   |  HD   ≥ 10 Mbps
//   FHD   ≥ 20 Mbps  |  UHD  ≥ 50 Mbps
// Each quality gets a three-state badge:
//   ✓ (green)   = at or above recommended
//   ⚠ (amber)   = within ~20% below recommended (borderline)
//   ✗ (red)     = clearly below recommended
//
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// ── Download endpoint ──────────────────────────────────────────────────
// We fire many small Cloudflare requests back-to-back within a 6-second
// window rather than one giant request. This is the same strategy
// every native-friendly speed-test library uses, and it avoids two
// React-Native-specific footguns:
//   1) RN's `XMLHttpRequest.onprogress` batches differently than the
//      browser and sometimes only fires once at the end, so we can't
//      rely on it for live readings on a single 1GB stream.
//   2) `responseType = "text"` buffers the entire response in memory.
//      A 1GB buffer reliably OOMs Expo Go and can stall release APKs.
// 25MB per chunk + 6 concurrent workers. Real speed-test clients use
// parallel streams (Cloudflare's own client uses 8) because:
//   * a single TCP connection is throughput-limited by its congestion
//     window and TLS/HTTP handshake overhead,
//   * sequential chunks waste round-trip time between requests,
// so 1-stream-sequential dramatically *under*-reports actual link speed.
// 25MB amortises the per-request handshake overhead; 6 concurrent
// workers saturate even gigabit-class links while staying inside RN's
// network + memory comfort zone (peak ~150MB transient buffers).
const CHUNK_BYTES = 25_000_000;
const CONCURRENT_WORKERS = 6;
const DOWNLOAD_URL = `https://speed.cloudflare.com/__down?bytes=${CHUNK_BYTES}`;
// Lightweight URL for the ping phase. HEAD on a 0-byte response — minimal
// payload so RTT dominates.
const PING_URL = "https://speed.cloudflare.com/__down?bytes=0";
const PING_SAMPLES = 5;
const TEST_DURATION_MS = 6000;
// How often the live Mbps readout updates during the download phase.
const LIVE_TICK_MS = 200;

type Phase = "idle" | "ping" | "download" | "done" | "error";

interface QualityRow {
  label: string;
  recommended: number; // Mbps — at or above = ✓
  borderline: number;  // Mbps — at or above (but below recommended) = ⚠
}
const QUALITY_ROWS: QualityRow[] = [
  { label: "SD",          recommended: 5,  borderline: 4  },
  { label: "HD",          recommended: 10, borderline: 8  },
  { label: "FHD / 1080p", recommended: 20, borderline: 16 },
  { label: "UHD / 4K",    recommended: 50, borderline: 40 },
];

type RatingState = "good" | "warn" | "bad";
function rateSpeed(mbps: number, row: QualityRow): RatingState {
  if (mbps >= row.recommended) return "good";
  if (mbps >= row.borderline) return "warn";
  return "bad";
}

function HoverBtn({
  style,
  activeStyle,
  onPress,
  disabled,
  children,
}: {
  style: any;
  activeStyle: any;
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode | ((isActive: boolean) => React.ReactNode);
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[style, isActive && activeStyle, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
    >
      {typeof children === "function" ? children(isActive) : children}
    </Pressable>
  );
}

export default function SpeedTestScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { width: winW, height: winH } = useWindowDimensions();
  // TV / tablet landscape: render the readout + recommendation table
  // side-by-side so everything fits on one screen with no scroll. Phones
  // in portrait keep the single-column scrolling layout.
  const isLandscape = winW > winH && winW >= 700;

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);        // 0..1
  const [currentMbps, setCurrentMbps] = useState(0);  // live readout
  const [finalMbps, setFinalMbps] = useState<number | null>(null);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);

  // Tidy up the in-flight request on unmount so it doesn't keep firing
  // setState into an unmounted component.
  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      try { abortRef.current?.abort(); } catch {}
    };
  }, []);

  // ── Ping phase: avg RTT of N small HEAD requests ─────────────────────
  const measurePing = useCallback(async (): Promise<number> => {
    const samples: number[] = [];
    for (let i = 0; i < PING_SAMPLES; i++) {
      const t0 = Date.now();
      try {
        // Cache-bust each request so we measure the network, not the cache.
        await fetch(`${PING_URL}&_=${t0}-${i}`, { method: "GET" });
        samples.push(Date.now() - t0);
      } catch {
        // Skip failed samples — if all 5 fail we'll throw below.
      }
    }
    if (samples.length === 0) throw new Error("Ping failed");
    // Drop the worst sample (often a connection-warm-up spike) for a
    // steadier reading, then average the rest.
    samples.sort((a, b) => a - b);
    const kept = samples.length > 1 ? samples.slice(0, -1) : samples;
    const avg = kept.reduce((s, v) => s + v, 0) / kept.length;
    return Math.round(avg);
  }, []);

  // ── Download phase: parallel chunked, always exactly 6 seconds ──────
  // Runs `CONCURRENT_WORKERS` (6) parallel fetch loops. Each worker
  // pulls a 25MB chunk, adds the bytes to a shared counter, and
  // immediately starts the next chunk — keeping all 6 TCP connections
  // saturated for the full 6 seconds. This mirrors how every real
  // speed-test client (Cloudflare, Ookla, Fast.com) works.
  //
  // Why we use a steady-state window instead of total bytes / total
  // seconds: the first ~500ms is dominated by TCP slow-start + TLS
  // handshakes (which under-reports the link), so we count bytes for
  // the full 6s but compute Mbps from the *active throughput window*
  // (seconds 0.5 - 6.0). That gives a reading that matches what
  // browser-based speed tests show.
  //
  // Memory: peak ~150MB across all 6 in-flight buffers, which is
  // comfortable on Expo Go, release APKs, and the web.
  const measureDownload = useCallback(async (): Promise<number> => {
    const controller = new AbortController();
    abortRef.current = controller;

    const start = Date.now();
    // Throughput is measured from this point forward (skip TCP/TLS
    // slow-start). Bytes received before this don't count toward the
    // final Mbps figure.
    const WARMUP_MS = 500;
    let warmupBytes = 0;
    let totalBytes = 0;
    let stopped = false;

    // Hard 6s deadline — aborts all in-flight chunks and ends the loop.
    const deadline = setTimeout(() => {
      stopped = true;
      try { controller.abort(); } catch {}
    }, TEST_DURATION_MS);

    // Live UI ticker — updates progress bar + Mbps readout every 200ms.
    // Live readout uses post-warmup throughput so the displayed number
    // matches the final result rather than starting artificially low.
    const ticker = setInterval(() => {
      if (stoppedRef.current) return;
      const elapsed = Date.now() - start;
      const activeMs = Math.max(1, elapsed - WARMUP_MS);
      const activeBytes = Math.max(0, totalBytes - warmupBytes);
      const mbps = elapsed > WARMUP_MS
        ? (activeBytes * 8) / ((activeMs / 1000) * 1_000_000)
        // During warm-up, just show whatever the raw rate is so the
        // number isn't stuck at 0 for the first half-second.
        : (totalBytes * 8) / ((Math.max(1, elapsed) / 1000) * 1_000_000);
      setCurrentMbps(mbps);
      setProgress(Math.min(1, elapsed / TEST_DURATION_MS));
    }, LIVE_TICK_MS);

    // Snapshot bytes-received at the moment the warm-up window ends so
    // we can subtract them from the final total.
    const warmupTimer = setTimeout(() => {
      warmupBytes = totalBytes;
    }, WARMUP_MS);

    // Single worker: pull chunks back-to-back until aborted.
    const worker = async (workerId: number) => {
      let i = 0;
      while (!stopped && !stoppedRef.current) {
        const url = `${DOWNLOAD_URL}&_=${Date.now()}-${workerId}-${i++}`;
        try {
          const res = await fetch(url, { signal: controller.signal });
          const buf = await res.arrayBuffer();
          if (stopped || stoppedRef.current) break;
          totalBytes += buf.byteLength;
        } catch (err: any) {
          // AbortError at the deadline is expected — exit cleanly.
          if (err?.name === "AbortError") return;
          // Real network error: log + back off briefly, then retry.
          // We don't bail the whole test on one bad chunk because the
          // other 5 workers may still be making progress.
          await new Promise((r) => setTimeout(r, 100));
        }
      }
    };

    try {
      // Kick off all workers in parallel and wait for them all to exit.
      await Promise.all(
        Array.from({ length: CONCURRENT_WORKERS }, (_, i) => worker(i))
      );
    } finally {
      clearTimeout(deadline);
      clearTimeout(warmupTimer);
      clearInterval(ticker);
    }

    const elapsedMs = Date.now() - start;
    const activeMs = Math.max(1, elapsedMs - WARMUP_MS);
    const activeBytes = Math.max(0, totalBytes - warmupBytes);
    // If we got cut off before warm-up finished, fall back to total
    // bytes / total time so we still report *something* meaningful.
    if (elapsedMs <= WARMUP_MS || activeBytes === 0) {
      return (totalBytes * 8) / ((Math.max(1, elapsedMs) / 1000) * 1_000_000);
    }
    // Mbps = bits per second / 1e6. 8 bits per byte.
    return (activeBytes * 8) / ((activeMs / 1000) * 1_000_000);
  }, []);

  const runTest = useCallback(async () => {
    if (phase === "ping" || phase === "download") return;
    stoppedRef.current = false;
    setErrorMsg(null);
    setProgress(0);
    setCurrentMbps(0);
    setFinalMbps(null);
    setPingMs(null);
    try {
      setPhase("ping");
      const ping = await measurePing();
      if (stoppedRef.current) return;
      setPingMs(ping);
      setPhase("download");
      const mbps = await measureDownload();
      if (stoppedRef.current) return;
      setFinalMbps(mbps);
      setProgress(1);
      setPhase("done");
    } catch (e: any) {
      if (stoppedRef.current) return;
      setErrorMsg(e?.message || "Speed test failed. Please try again.");
      setPhase("error");
    }
  }, [phase, measurePing, measureDownload]);

  const isRunning = phase === "ping" || phase === "download";

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.md);

  // Speed shown in the big readout: live during the test, final once done.
  const displayMbps =
    phase === "done" && finalMbps != null
      ? finalMbps
      : isRunning
        ? currentMbps
        : finalMbps ?? 0;

  // ─── Card subtrees ──────────────────────────────────────────────────
  // Defined inline so the same JSX renders in both layouts (single-column
  // scroll for portrait, two-column flex for landscape) without
  // duplicating code.
  const readoutCard = (
    <View style={[styles.readoutCard, isLandscape && styles.readoutCardLs]}>
          <ThemedText style={styles.readoutLabel}>
            {phase === "ping" ? "Pinging server..." :
             phase === "download" ? "Measuring download speed..." :
             phase === "done" ? "Your download speed" :
             phase === "error" ? "Test failed" :
             "Ready to test"}
          </ThemedText>
          <View style={styles.readoutSpeedRow}>
            <ThemedText style={styles.readoutSpeed}>
              {displayMbps.toFixed(displayMbps >= 100 ? 0 : 1)}
            </ThemedText>
            <ThemedText style={styles.readoutUnit}>Mbps</ThemedText>
          </View>

          {/* Ping pill */}
          <View style={styles.statsRow}>
            <View style={styles.statPill}>
              <Feather name="zap" size={12} color={Colors.dark.accent} />
              <ThemedText style={styles.statPillLabel}>Ping</ThemedText>
              <ThemedText style={styles.statPillValue}>
                {pingMs != null ? `${pingMs} ms` : "—"}
              </ThemedText>
            </View>
            <View style={styles.statPill}>
              <Feather name="download" size={12} color={Colors.dark.accent} />
              <ThemedText style={styles.statPillLabel}>Download</ThemedText>
              <ThemedText style={styles.statPillValue}>
                {finalMbps != null ? `${finalMbps.toFixed(1)} Mbps` : "—"}
              </ThemedText>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(progress * 100)}%`,
                  backgroundColor:
                    phase === "error" ? Colors.dark.error : Colors.dark.accent,
                },
              ]}
            />
          </View>
          <ThemedText style={styles.progressText}>
            {phase === "download"
              ? `${(progress * (TEST_DURATION_MS / 1000)).toFixed(1)}s / ${(TEST_DURATION_MS / 1000).toFixed(0)}s`
              : phase === "ping"
                ? "Measuring latency..."
                : phase === "done"
                  ? "Complete"
                  : phase === "error"
                    ? errorMsg ?? "Try again"
                    : "Tap Start to begin"}
          </ThemedText>

          {/* Start / Re-run button */}
          <HoverBtn
            style={styles.startBtn}
            activeStyle={styles.startBtnActive}
            onPress={runTest}
            disabled={isRunning}
          >
            {isRunning ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather
                name={phase === "done" || phase === "error" ? "refresh-cw" : "play"}
                size={16}
                color="#fff"
              />
            )}
            <ThemedText style={styles.startBtnText}>
              {isRunning
                ? phase === "ping" ? "Pinging..." : "Testing..."
                : phase === "done" || phase === "error"
                  ? "Run Again"
                  : "Start Speed Test"}
            </ThemedText>
          </HoverBtn>
    </View>
  );

  const tableCard = (
    <View style={styles.tableCard}>
      <ThemedText style={styles.tableTitle}>Streaming Quality Guide</ThemedText>
      <View style={styles.tableHeaderRow}>
        <ThemedText style={[styles.tableHeaderCell, { flex: 2 }]}>Quality</ThemedText>
        <ThemedText style={[styles.tableHeaderCell, { flex: 2, textAlign: "right" }]}>Recommended</ThemedText>
        <ThemedText style={[styles.tableHeaderCell, { width: 56, textAlign: "center" }]}>Status</ThemedText>
      </View>
      {QUALITY_ROWS.map((row) => {
        const rated = finalMbps != null ? rateSpeed(finalMbps, row) : null;
        return (
          <View key={row.label} style={styles.tableRow}>
            <ThemedText style={[styles.tableCellLabel, { flex: 2 }]}>
              {row.label}
            </ThemedText>
            <ThemedText style={[styles.tableCellValue, { flex: 2, textAlign: "right" }]}>
              {row.recommended} Mbps+
            </ThemedText>
            <View style={[styles.statusCell, { width: 56 }]}>
              <StatusBadge state={rated} />
            </View>
          </View>
        );
      })}

      {/* Legend */}
      <View style={styles.legendBlock}>
        <LegendRow state="good" text="Comfortably compatible — great for streaming" />
        <LegendRow state="warn" text="Borderline — may stream but could buffer" />
        <LegendRow state="bad"  text="Not recommended — speed may be too low" />
      </View>
    </View>
  );

  const disclaimerCard = (
    <View style={styles.disclaimerCard}>
      <Feather name="info" size={14} color={Colors.dark.textSecondary} style={{ marginTop: 2 }} />
      <ThemedText style={styles.disclaimerText}>
        Results are a guide only. Streaming performance can also be affected by Wi-Fi strength, device performance, VPN use, and your network/server congestion.
      </ThemedText>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <HoverBtn
          style={styles.iconBtn}
          activeStyle={styles.iconBtnActive}
          onPress={() => navigation.goBack()}
        >
          {(active) => (
            <Feather name="arrow-left" size={20} color={active ? Colors.dark.accent : Colors.dark.text} />
          )}
        </HoverBtn>
        <ThemedText style={styles.headerTitle}>Speed Test</ThemedText>
        <View style={styles.iconBtn} />
      </View>
      <View style={[styles.divider, { marginHorizontal: padH }]} />

      {isLandscape ? (
        // ── Landscape / TV: two-column, no scroll ──────────────────────
        <View
          style={[
            styles.landscapeBody,
            { paddingHorizontal: padH, paddingBottom: padB },
          ]}
        >
          <View style={styles.landscapeCol}>{readoutCard}</View>
          <View style={styles.landscapeCol}>
            {tableCard}
            {disclaimerCard}
          </View>
        </View>
      ) : (
        // ── Portrait: single-column scroll ─────────────────────────────
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: padH,
            paddingBottom: padB,
            gap: Spacing.md,
          }}
          showsVerticalScrollIndicator={false}
        >
          {readoutCard}
          {tableCard}
          {disclaimerCard}
        </ScrollView>
      )}
    </ThemedView>
  );
}

// ── Status badge — three-state icon pill ────────────────────────────────
function StatusBadge({ state }: { state: RatingState | null }) {
  if (state == null) {
    return (
      <View style={[styles.badge, styles.badgeIdle]}>
        <Feather name="minus" size={12} color={Colors.dark.textSecondary} />
      </View>
    );
  }
  if (state === "good") {
    return (
      <View style={[styles.badge, styles.badgeGood]}>
        <Feather name="check" size={14} color="#fff" />
      </View>
    );
  }
  if (state === "warn") {
    return (
      <View style={[styles.badge, styles.badgeWarn]}>
        <Feather name="alert-triangle" size={12} color="#1a1100" />
      </View>
    );
  }
  return (
    <View style={[styles.badge, styles.badgeBad]}>
      <Feather name="x" size={14} color="#fff" />
    </View>
  );
}

function LegendRow({ state, text }: { state: RatingState; text: string }) {
  return (
    <View style={styles.legendRow}>
      <StatusBadge state={state} />
      <ThemedText style={styles.legendText}>{text}</ThemedText>
    </View>
  );
}

const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const RED   = "#ef4444";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  landscapeBody: {
    flex: 1,
    flexDirection: "row",
    gap: Spacing.md,
  },
  landscapeCol: {
    flex: 1,
    gap: Spacing.md,
  },
  readoutCardLs: {
    // Slightly tighter in landscape so the readout fits within the screen
    // height without scrolling on smaller TVs / tablets.
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingBottom: Spacing.md, gap: Spacing.md,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.md },
  iconBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  iconBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },

  // Readout
  readoutCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: "rgba(255,102,0,0.3)",
    padding: Spacing.lg, gap: Spacing.md,
  },
  readoutLabel: {
    fontSize: 11, fontWeight: "700",
    color: Colors.dark.accent,
    textTransform: "uppercase", letterSpacing: 1.2,
  },
  readoutSpeedRow: {
    flexDirection: "row", alignItems: "baseline", gap: Spacing.sm,
  },
  readoutSpeed: {
    fontSize: 56, fontWeight: "800",
    color: Colors.dark.text, letterSpacing: -1,
  },
  readoutUnit: {
    fontSize: 18, fontWeight: "700", color: Colors.dark.textSecondary,
  },
  statsRow: { flexDirection: "row", gap: Spacing.sm, flexWrap: "wrap" },
  statPill: {
    flexDirection: "row", alignItems: "center", gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  statPillLabel: { color: Colors.dark.textSecondary, fontSize: 11, fontWeight: "600" },
  statPillValue: { color: Colors.dark.text, fontSize: 12, fontWeight: "700" },

  // Progress
  progressTrack: {
    height: 8, borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4 },
  progressText: {
    fontSize: 11, color: Colors.dark.textSecondary, fontWeight: "600",
    textAlign: "center",
  },

  // Start button
  startBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.sm, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.dark.accent,
  },
  startBtnActive: {
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85, shadowRadius: 10, elevation: 6,
    transform: [{ scale: 1.02 }],
  },
  startBtnText: { color: "#fff", fontWeight: "800", fontSize: 14, letterSpacing: 0.3 },

  // Table
  tableCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.dark.border,
    padding: Spacing.md, gap: Spacing.xs,
  },
  tableTitle: {
    fontSize: 11, fontWeight: "700", color: Colors.dark.accent,
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: Spacing.xs,
  },
  tableHeaderRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: Spacing.xs, gap: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  tableHeaderCell: {
    fontSize: 10, fontWeight: "700",
    color: Colors.dark.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: Spacing.sm, gap: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)",
  },
  tableCellLabel: { color: Colors.dark.text, fontSize: 13, fontWeight: "700" },
  tableCellValue: { color: Colors.dark.textSecondary, fontSize: 12, fontWeight: "600" },
  statusCell: { alignItems: "center", justifyContent: "center" },

  // Badge
  badge: {
    width: 26, height: 26, borderRadius: 6,
    justifyContent: "center", alignItems: "center",
  },
  badgeIdle: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  badgeGood: { backgroundColor: GREEN },
  badgeWarn: { backgroundColor: AMBER },
  badgeBad:  { backgroundColor: RED },

  // Legend
  legendBlock: {
    marginTop: Spacing.sm, paddingTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.dark.border,
    gap: Spacing.xs,
  },
  legendRow: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
  },
  legendText: { color: Colors.dark.textSecondary, fontSize: 12, flex: 1 },

  // Disclaimer
  disclaimerCard: {
    flexDirection: "row", gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 11, color: Colors.dark.textSecondary, lineHeight: 16,
  },
});
