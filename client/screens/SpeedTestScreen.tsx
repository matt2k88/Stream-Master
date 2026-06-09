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
import SideMenuButton from "@/components/SideMenuButton";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// ── Download strategy ─────────────────────────────────────────────────
// On native (Expo Go / APK) we delegate the entire download phase to a
// hidden WebView running real browser JS. That gives us:
//
//   * `response.body.getReader()` streaming → bytes are counted and
//     discarded chunk-by-chunk inside the browser engine, so memory
//     stays flat (~64 KB transient) regardless of link speed.
//   * No React Native JS bridge in the data path — only progress
//     events (a small JSON string) cross via `postMessage`. The
//     bridge's ~25 MB/s ceiling that capped our previous attempts at
//     ~200 Mbps no longer matters.
//
// On web we run the same logic directly (no WebView wrapper needed)
// since the host *is* a browser.
const PARALLEL_WORKERS = 4;
const CHUNK_BYTES = 25_000_000;
const WARMUP_MS = 1500;
const DOWNLOAD_URL = `https://speed.cloudflare.com/__down?bytes=${CHUNK_BYTES}`;
// Lightweight URL for the ping phase. HEAD on a 0-byte response — minimal
// payload so RTT dominates.
const PING_URL = "https://speed.cloudflare.com/__down?bytes=0";
const PING_SAMPLES = 5;
const TEST_DURATION_MS = 6000;

// HTML page injected into the WebView. Self-contained vanilla JS so it
// doesn't need any bundler. Posts {type:'progress', progress, mbps}
// throughout the run, then {type:'done', mbps} when finished, or
// {type:'error', message} on failure.
const SPEED_TEST_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>
(async function(){
  var CHUNK=${CHUNK_BYTES};
  var URL='${DOWNLOAD_URL.replace(/'/g, "\\'")}';
  var PARALLEL=${PARALLEL_WORKERS};
  var WARMUP_MS=${WARMUP_MS};
  var DURATION=${TEST_DURATION_MS};
  function post(o){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }catch(e){} }
  var controller=new AbortController();
  var start=Date.now(), measuredStart=0, measuredBytes=0, stopped=false;
  var deadline=setTimeout(function(){ stopped=true; try{controller.abort();}catch(e){} }, DURATION);
  var ticker=setInterval(function(){
    var elapsed=Date.now()-start;
    var mbps=0;
    if(measuredStart>0){
      var secs=(Date.now()-measuredStart)/1000;
      if(secs>0) mbps=(measuredBytes*8)/(secs*1000000);
    }
    post({type:'progress',progress:Math.min(1,elapsed/DURATION),mbps:mbps});
  },100);
  function worker(id){
    return (async function(){
      var i=0;
      while(!stopped){
        try {
          var res=await fetch(URL+'&_='+Date.now()+'-'+id+'-'+(i++),{signal:controller.signal});
          if(!res.body||!res.body.getReader){
            // Fallback for environments without streaming — still works,
            // just buffers per-chunk (25 MB) which is fine inside the
            // browser engine.
            var buf=await res.arrayBuffer();
            if(stopped) break;
            var el=Date.now()-start;
            if(el<WARMUP_MS) continue;
            if(measuredStart===0) measuredStart=Date.now();
            measuredBytes+=buf.byteLength;
            continue;
          }
          var reader=res.body.getReader();
          while(true){
            var r=await reader.read();
            if(r.done) break;
            if(stopped){ try{reader.cancel();}catch(e){} break; }
            var el=Date.now()-start;
            if(el<WARMUP_MS) continue;
            if(measuredStart===0) measuredStart=Date.now();
            measuredBytes+=r.value.byteLength;
          }
        } catch(e){
          if(e && e.name==='AbortError') return;
          await new Promise(function(r){ setTimeout(r,100); });
        }
      }
    })();
  }
  try {
    var workers=[];
    for(var k=0;k<PARALLEL;k++) workers.push(worker(k));
    await Promise.all(workers);
  } catch(e){
    post({type:'error',message:String(e && e.message || e)});
    clearTimeout(deadline); clearInterval(ticker);
    return;
  }
  clearTimeout(deadline); clearInterval(ticker);
  var finalMbps=0;
  if(measuredStart>0 && measuredBytes>0){
    var el=Math.max(1,Date.now()-measuredStart);
    finalMbps=(measuredBytes*8)/((el/1000)*1000000);
  }
  post({type:'done',mbps:finalMbps});
})();
</script></body></html>`;

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

  // WebView-driven download: a hidden WebView runs the speed-test HTML
  // and reports back via `postMessage`. `webviewKey` is bumped each run
  // to force a fresh mount (so the script re-executes); `webviewActive`
  // controls whether it's rendered. `webviewResolverRef` holds the
  // resolver of the Promise that `measureDownload` is awaiting, so the
  // onMessage handler can complete it when the test finishes.
  const [webviewKey, setWebviewKey] = useState(0);
  const [webviewActive, setWebviewActive] = useState(false);
  const webviewResolverRef = useRef<{
    resolve: (mbps: number) => void;
    reject: (err: Error) => void;
  } | null>(null);
  const webviewWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic generation counter. Bumped at the start of every
  // measureDownload() so that any terminal event (message / error /
  // watchdog) carrying a stale generation from a previous run is
  // silently ignored — this prevents a late callback from the
  // just-unmounted WebView accidentally settling the next run's
  // Promise.
  const activeRunIdRef = useRef(0);

  // Single chokepoint that always tears the WebView run down exactly
  // once: clears the watchdog, drops the active flag, and either
  // resolves or rejects the pending Promise. Subsequent calls are
  // no-ops, so it's safe to call from onMessage, onError, the
  // watchdog, and the unmount cleanup without double-settling. The
  // `runId` parameter scopes the event to a specific run; pass
  // `null` for unconditional settlement (unmount cleanup).
  const finalizeWebviewRun = useCallback(
    (
      result: { ok: true; mbps: number } | { ok: false; error: Error },
      runId: number | null,
    ) => {
      if (runId != null && runId !== activeRunIdRef.current) return;
      if (webviewWatchdogRef.current) {
        clearTimeout(webviewWatchdogRef.current);
        webviewWatchdogRef.current = null;
      }
      const resolver = webviewResolverRef.current;
      webviewResolverRef.current = null;
      setWebviewActive(false);
      if (!resolver) return;
      if (result.ok) resolver.resolve(result.mbps);
      else resolver.reject(result.error);
    },
    [],
  );

  // Tidy up the in-flight request on unmount so it doesn't keep firing
  // setState into an unmounted component, and reject any pending
  // WebView Promise so awaiters don't hang.
  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      try { abortRef.current?.abort(); } catch {}
      finalizeWebviewRun({ ok: false, error: new Error("Screen closed") }, null);
    };
  }, [finalizeWebviewRun]);

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

  // ── Download phase: delegated to a hidden WebView ────────────────────
  // We mount a fresh WebView (bumping `webviewKey`) that loads
  // SPEED_TEST_HTML. The script inside posts `progress` events (which
  // we use to drive the live readout) and a final `done` event whose
  // mbps we return. On the web platform we fall back to running the
  // same logic inline since the host already IS a browser.
  const measureDownload = useCallback((): Promise<number> => {
    return new Promise<number>((resolve, reject) => {
      // Defensive: if a previous run somehow left a resolver dangling
      // (shouldn't happen, but cheap insurance), reject it before
      // overwriting so it doesn't hang forever.
      if (webviewResolverRef.current) {
        try {
          webviewResolverRef.current.reject(new Error("Superseded"));
        } catch {}
      }
      // Bump generation BEFORE wiring up the new resolver so any
      // late callbacks from the previous WebView instance fail the
      // runId guard in finalizeWebviewRun and are ignored.
      const runId = ++activeRunIdRef.current;
      webviewResolverRef.current = { resolve, reject };
      // RN-side watchdog: if the WebView never reports back (script
      // crash, message-bridge failure, page never loaded), this fires
      // after the test window + a generous buffer and unsticks us.
      if (webviewWatchdogRef.current) {
        clearTimeout(webviewWatchdogRef.current);
      }
      webviewWatchdogRef.current = setTimeout(() => {
        finalizeWebviewRun(
          {
            ok: false,
            error: new Error("Speed test timed out (no response from test engine)"),
          },
          runId,
        );
      }, TEST_DURATION_MS + 6000);
      // Fresh key forces the WebView to remount and re-execute the
      // injected script for every test run.
      setWebviewKey(runId);
      setWebviewActive(true);
    });
  }, [finalizeWebviewRun]);

  // Web fallback (used in the web preview where react-native-webview
  // renders an iframe and postMessage round-trips are awkward). Same
  // algorithm as the HTML script, just inline TS.
  const measureDownloadWeb = useCallback(async (): Promise<number> => {
    const controller = new AbortController();
    abortRef.current = controller;
    const start = Date.now();
    let measuredBytes = 0;
    let measuredStart = 0;
    let stopped = false;

    const deadline = setTimeout(() => {
      stopped = true;
      try { controller.abort(); } catch {}
    }, TEST_DURATION_MS);
    const ticker = setInterval(() => {
      if (stoppedRef.current) return;
      const elapsed = Date.now() - start;
      setProgress(Math.min(1, elapsed / TEST_DURATION_MS));
      if (measuredStart > 0) {
        const seconds = (Date.now() - measuredStart) / 1000;
        if (seconds > 0) {
          setCurrentMbps((measuredBytes * 8) / (seconds * 1_000_000));
        }
      }
    }, 100);

    const worker = async (id: number): Promise<void> => {
      let i = 0;
      while (!stopped && !stoppedRef.current) {
        const url = `${DOWNLOAD_URL}&_=${Date.now()}-${id}-${i++}`;
        try {
          const res = await fetch(url, { signal: controller.signal });
          const reader = (res.body as any)?.getReader?.();
          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (stopped || stoppedRef.current) {
                try { reader.cancel(); } catch {}
                break;
              }
              const elapsed = Date.now() - start;
              if (elapsed < WARMUP_MS) continue;
              if (measuredStart === 0) measuredStart = Date.now();
              measuredBytes += value.byteLength;
            }
          } else {
            const buf = await res.arrayBuffer();
            if (stopped || stoppedRef.current) break;
            const elapsed = Date.now() - start;
            if (elapsed < WARMUP_MS) continue;
            if (measuredStart === 0) measuredStart = Date.now();
            measuredBytes += buf.byteLength;
          }
        } catch (err: any) {
          if (err?.name === "AbortError") return;
          await new Promise((r) => setTimeout(r, 100));
        }
      }
    };

    try {
      await Promise.all(
        Array.from({ length: PARALLEL_WORKERS }, (_, i) => worker(i)),
      );
    } finally {
      clearTimeout(deadline);
      clearInterval(ticker);
    }

    if (measuredStart === 0 || measuredBytes === 0) return 0;
    const elapsedMs = Math.max(1, Date.now() - measuredStart);
    return (measuredBytes * 8) / ((elapsedMs / 1000) * 1_000_000);
  }, []);

  // Receives `{type:'progress'|'done'|'error', ...}` messages from the
  // injected speed-test script inside the WebView. Terminal messages
  // (`done`/`error`) always finalize the run even if the caller has
  // already been cancelled — we just discard the value via
  // `finalizeWebviewRun` rather than leaking the resolver.
  // Build per-instance handlers bound to the runId that was current
  // when the WebView was mounted. Any callbacks fired by a stale
  // WebView (already-unmounted previous run) will carry the old runId
  // and be ignored by finalizeWebviewRun's guard.
  const makeWebViewHandlers = useCallback(
    (runId: number) => ({
      onMessage: (e: WebViewMessageEvent) => {
        let msg: any;
        try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
        if (msg.type === "progress") {
          // Drop progress events from stale instances too.
          if (runId !== activeRunIdRef.current) return;
          if (stoppedRef.current) return;
          if (typeof msg.progress === "number") {
            setProgress(Math.min(1, Math.max(0, msg.progress)));
          }
          if (typeof msg.mbps === "number" && isFinite(msg.mbps)) {
            setCurrentMbps(msg.mbps);
          }
        } else if (msg.type === "done") {
          finalizeWebviewRun(
            {
              ok: true,
              mbps:
                typeof msg.mbps === "number" && isFinite(msg.mbps) ? msg.mbps : 0,
            },
            runId,
          );
        } else if (msg.type === "error") {
          finalizeWebviewRun(
            { ok: false, error: new Error(msg.message || "Speed test failed") },
            runId,
          );
        }
      },
      onError: () => {
        finalizeWebviewRun(
          { ok: false, error: new Error("Speed test engine failed to load") },
          runId,
        );
      },
    }),
    [finalizeWebviewRun],
  );


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
      const mbps =
        Platform.OS === "web"
          ? await measureDownloadWeb()
          : await measureDownload();
      if (stoppedRef.current) return;
      setFinalMbps(mbps);
      setProgress(1);
      setPhase("done");
    } catch (e: any) {
      if (stoppedRef.current) return;
      setErrorMsg(e?.message || "Speed test failed. Please try again.");
      setPhase("error");
    }
  }, [phase, measurePing, measureDownload, measureDownloadWeb]);

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
        <SideMenuButton />
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
      {/* Hidden WebView that runs the actual download test on native.
          0×0, opacity 0, pointer-events disabled — invisible to the user
          but still executes its script. Only mounted while a test is in
          flight; remounted with a fresh key for each run. */}
      {Platform.OS !== "web" && webviewActive ? (
        <View
          style={styles.hiddenWebview}
          pointerEvents="none"
        >
          {(() => {
            const handlers = makeWebViewHandlers(webviewKey);
            return (
              <WebView
                key={webviewKey}
                originWhitelist={["*"]}
                source={{
                  html: SPEED_TEST_HTML,
                  baseUrl: "https://speed.cloudflare.com",
                }}
                onMessage={handlers.onMessage}
                onError={handlers.onError}
                onHttpError={handlers.onError}
                onRenderProcessGone={handlers.onError}
                javaScriptEnabled
                domStorageEnabled
                mixedContentMode="always"
                cacheEnabled={false}
                androidLayerType="software"
                style={{ width: 1, height: 1, opacity: 0 }}
              />
            );
          })()}
        </View>
      ) : null}
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
  hiddenWebview: {
    position: "absolute",
    width: 1,
    height: 1,
    left: -10,
    top: -10,
    opacity: 0,
    overflow: "hidden",
  },
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
