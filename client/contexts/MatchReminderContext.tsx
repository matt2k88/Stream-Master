import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { Alert, AppState, Platform } from "react-native";
import { useProfile } from "@/contexts/ProfileContext";
import { useData } from "@/contexts/DataContext";
import { useFootball } from "@/contexts/FootballContext";
import { getApiUrl } from "@/lib/query-client";
import { navigationRef } from "@/lib/navigation-ref";
import { xtreamApi } from "@/lib/xtream-api";
import {
  loadGuestFavouriteTeam,
  saveGuestFavouriteTeam,
  type GuestFavouriteTeam,
} from "@/lib/guest-prefs";
import {
  loadRemindersEnabled,
  saveRemindersEnabled,
  loadReminderState,
  saveReminderState,
  loadTeamFixturesCache,
  saveTeamFixturesCache,
  loadCentreCache,
  saveCentreCache,
  type ReminderStateMap,
  type FixtureReminderState,
} from "@/lib/match-reminders-storage";

export type FavTeam = GuestFavouriteTeam;

interface UpcomingFixture {
  fixture_id: number;
  league_id: number;
  league_name: string | null;
  home_team: string | null;
  away_team: string | null;
  home_logo: string | null;
  away_logo: string | null;
  kickoff: string | null;
}

interface FixtureChannel {
  fixture_id: number;
  channel_name: string;
  stream_id: string | null;
}

export interface ActiveReminder {
  fixtureId: number;
  home: string;
  away: string;
  homeLogo: string | null;
  awayLogo: string | null;
  league: string | null;
  kickoff: string; // ISO
  kind: "prematch" | "kickoff";
}

interface MatchReminderContextType {
  // Favourite team (single source of truth, shared with the settings screen).
  favouriteTeam: FavTeam | null;
  favLoading: boolean;
  favSaving: boolean;
  saveFavouriteTeam: (t: FavTeam) => Promise<void>;

  // Reminder on/off (per profile, device-local).
  remindersEnabled: boolean;
  remindersReady: boolean;
  setRemindersEnabled: (on: boolean) => void;

  // Whether reminders can run at all (global football switch on).
  globalEnabled: boolean;

  // Runtime overlay state.
  activeReminder: ActiveReminder | null;
  canWatchActive: boolean;
  dismissReminder: () => void;
  watchReminder: () => void;
  remindAtKickoff: () => void;

  // Dev-only test helper: fire a Man Utd reminder after a short countdown so the
  // overlay can be verified over the player without waiting for a real match.
  // `testCountdown` is the seconds remaining (null when idle).
  testCountdown: number | null;
  triggerTestReminder: () => void;
}

const MatchReminderContext = createContext<MatchReminderContextType | undefined>(undefined);

const PREMATCH_LEAD_MS = 15 * 60 * 1000; // notify 15 min before kick off
const KICKOFF_GRACE_MS = 15 * 60 * 1000; // don't fire a kick-off reminder for games long started
const ENGINE_MS = 30 * 1000;
// The schedule (next 10 fixtures) covers many days, and the 15-min countdown is
// evaluated locally by the engine — so we only need to refresh the schedule
// occasionally to catch kick-off/channel changes, not poll it. Refetch at most
// once per this window; a team switch or app cold-start always forces a fresh load.
const FIXTURES_STALE_MS = 12 * 60 * 60 * 1000;

// Dev-only test reminder: a fake Man Utd fixture surfaced after a short
// countdown so the overlay can be checked over the player on demand. The
// negative id can never collide with a real api-football fixture id.
const TEST_FIXTURE_ID = -1;
const TEST_COUNTDOWN_SEC = 10;
const MAN_UTD_LOGO = "https://media.api-sports.io/football/teams/33.png";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export function MatchReminderProvider({ children }: { children: ReactNode }) {
  const { activeProfile, isGuest } = useProfile();
  const { liveStreams } = useData();
  const { globalEnabled } = useFootball();
  const profileId = activeProfile?.id ?? null;
  const profileKey = isGuest ? "guest" : profileId;
  const profileKeyRef = useRef<string | null>(profileKey);
  profileKeyRef.current = profileKey;

  const [favouriteTeam, setFavouriteTeam] = useState<FavTeam | null>(null);
  const [favLoading, setFavLoading] = useState(true);
  const [favSaving, setFavSaving] = useState(false);

  const [remindersEnabled, setRemindersEnabledState] = useState(false);
  const [remindersReady, setRemindersReady] = useState(false);

  const [fixtures, setFixtures] = useState<UpcomingFixture[]>([]);
  // Team-direct fixtures are tagged with the team id they were fetched for so a
  // stale-team set can never be treated as the current favourite's, no matter
  // how render/effect timing interleaves on a team switch.
  const [teamFixtures, setTeamFixtures] = useState<{
    teamId: number | null;
    rows: UpcomingFixture[];
  }>({ teamId: null, rows: [] });
  const [channels, setChannels] = useState<FixtureChannel[]>([]);

  const [activeReminder, setActiveReminder] = useState<ActiveReminder | null>(null);

  // Per-fixture handled state (persisted so a reminder never repeats).
  const stateMapRef = useRef<ReminderStateMap>({});

  // ── Load favourite team + reminder switch on profile change ──
  useEffect(() => {
    let cancelled = false;
    setFavLoading(true);
    setRemindersReady(false);
    setActiveReminder(null);
    (async () => {
      try {
        // Reminder state map is per profile (or per guest device).
        stateMapRef.current = profileKey ? await loadReminderState(profileKey) : {};

        if (isGuest) {
          const t = await loadGuestFavouriteTeam();
          if (!cancelled) setFavouriteTeam(t);
        } else if (profileId) {
          const url = new URL("/api/football/favourite-team", getApiUrl());
          url.searchParams.set("profile_id", profileId);
          const res = await fetch(url.toString());
          if (res.ok) {
            const data = await res.json();
            if (!cancelled) setFavouriteTeam(data?.team ?? null);
          } else if (!cancelled) {
            setFavouriteTeam(null);
          }
        } else if (!cancelled) {
          setFavouriteTeam(null);
        }
      } catch {
        if (!cancelled) setFavouriteTeam(null);
      } finally {
        if (!cancelled) setFavLoading(false);
      }

      // Reminder on/off follows the profile via the DB; guests are device-local.
      if (isGuest) {
        const on = await loadRemindersEnabled("guest");
        if (!cancelled) setRemindersEnabledState(on);
      } else if (profileId) {
        try {
          const url = new URL("/api/football/match-reminders", getApiUrl());
          url.searchParams.set("profile_id", profileId);
          const res = await fetch(url.toString());
          if (res.ok) {
            const data = await res.json();
            if (!cancelled) setRemindersEnabledState(!!data?.enabled);
          } else if (!cancelled) {
            setRemindersEnabledState(false);
          }
        } catch {
          if (!cancelled) setRemindersEnabledState(false);
        }
      } else if (!cancelled) {
        setRemindersEnabledState(false);
      }
      if (!cancelled) setRemindersReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId, isGuest, profileKey]);

  const saveFavouriteTeam = useCallback(
    async (t: FavTeam) => {
      const prev = favouriteTeam;
      setFavSaving(true);
      setFavouriteTeam(t);
      try {
        if (isGuest) {
          await saveGuestFavouriteTeam(t);
        } else if (profileId) {
          const url = new URL("/api/football/favourite-team", getApiUrl());
          const res = await fetch(url.toString(), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profile_id: profileId, team_id: t.id, team_data: t }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }
      } catch {
        setFavouriteTeam(prev);
        Alert.alert(
          "Could not save",
          "We couldn't save your favourite team. Check your connection and try again.",
        );
      } finally {
        setFavSaving(false);
      }
    },
    [favouriteTeam, isGuest, profileId],
  );

  const setRemindersEnabled = useCallback(
    (on: boolean) => {
      setRemindersEnabledState(on);
      if (!on) setActiveReminder(null);
      if (isGuest) {
        void saveRemindersEnabled("guest", on);
      } else if (profileId) {
        const url = new URL("/api/football/match-reminders", getApiUrl());
        void fetch(url.toString(), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile_id: profileId, enabled: on }),
        }).catch(() => {});
      }
    },
    [isGuest, profileId],
  );

  // ── Fetch upcoming fixtures + channel links while reminders are active ──
  const remindersActive = remindersEnabled && globalEnabled && !!favouriteTeam;

  const favTeamId = favouriteTeam?.id ?? null;

  const lastLoadAt = useRef(0);
  useEffect(() => {
    if (!remindersActive) {
      setFixtures([]);
      setTeamFixtures({ teamId: null, rows: [] });
      setChannels([]);
      return;
    }
    let cancelled = false;
    // Re-tag to the current team with empty rows so a team switch can never
    // momentarily fire a reminder for the old team.
    setTeamFixtures({ teamId: favTeamId, rows: [] });
    // Treat the schedule as stale until init() hydrates the on-device cache or a
    // fetch succeeds, so any interval/resume that fires first will refetch.
    lastLoadAt.current = 0;
    const load = async (force = false) => {
      // Skip the network if the schedule is still within the staleness window
      // (unless forced). A backgrounded app coming forward thus refetches at
      // most ~once per window instead of on every resume.
      if (!force && Date.now() - lastLoadAt.current < FIXTURES_STALE_MS) return;
      try {
        const reqs: Promise<Response>[] = [
          fetch(new URL("/api/football/centre/fixtures", getApiUrl()).toString()),
          fetch(new URL("/api/football/centre/channels", getApiUrl()).toString()),
        ];
        if (favTeamId != null) {
          const tUrl = new URL("/api/football/team-fixtures", getApiUrl());
          tUrl.searchParams.set("team_id", String(favTeamId));
          reqs.push(fetch(tUrl.toString()));
        }
        const [fRes, cRes, tRes] = await Promise.all(reqs);
        let centreFixtures: UpcomingFixture[] | null = null;
        let centreChannels: FixtureChannel[] | null = null;
        if (fRes.ok) {
          const data = await fRes.json();
          centreFixtures = Array.isArray(data) ? data : [];
          if (!cancelled) setFixtures(centreFixtures);
        }
        if (cRes.ok) {
          const data = await cRes.json();
          centreChannels = Array.isArray(data) ? data : [];
          if (!cancelled) setChannels(centreChannels);
        }
        // Persist the global centre snapshot when both parts loaded (saved even
        // if this effect was cancelled — it is global, not team-scoped).
        if (centreFixtures && centreChannels) {
          void saveCentreCache(centreFixtures, centreChannels);
        }
        // Always reconcile team fixtures (tagged with this team id) to the
        // current response — empty rows on a missing/failed request so
        // stale-team data can never trigger.
        const teamOk = !!tRes && tRes.ok;
        if (tRes && tRes.ok) {
          const data = await tRes.json();
          const rows: UpcomingFixture[] = Array.isArray(data) ? data : [];
          if (!cancelled) setTeamFixtures({ teamId: favTeamId, rows });
          // Cache keyed by team id so a future launch (or switch back) hydrates
          // instantly without a network call.
          if (favTeamId != null) void saveTeamFixturesCache(favTeamId, rows);
        } else if (!cancelled) {
          setTeamFixtures({ teamId: favTeamId, rows: [] });
        }
        // Only mark fresh when this effect is still current AND every part of
        // the snapshot loaded (team fixtures + both centre requests). A partial
        // failure leaves the timestamp stale so the next resume/interval retries
        // instead of being suppressed for a full window.
        const centreOk = fRes.ok && cRes.ok;
        const ok = (favTeamId == null || teamOk) && centreOk;
        if (!cancelled && ok) lastLoadAt.current = Date.now();
      } catch {
        // Network blip — drop team fixtures so we never fire on stale data, and
        // leave lastLoadAt untouched so the next resume retries.
        if (!cancelled) setTeamFixtures({ teamId: favTeamId, rows: [] });
      }
    };
    // Hydrate instantly from the on-device cache so reminders can fire on launch
    // (and offline) without waiting on the network, then fetch only if the
    // cached snapshot is stale.
    const init = async () => {
      const [teamCache, centreCache] = await Promise.all([
        favTeamId != null
          ? loadTeamFixturesCache<UpcomingFixture>(favTeamId)
          : Promise.resolve(null),
        loadCentreCache<UpcomingFixture, FixtureChannel>(),
      ]);
      if (cancelled) return;
      if (centreCache) {
        setFixtures(centreCache.fixtures);
        setChannels(centreCache.channels);
      }
      const teamHit = !!teamCache && teamCache.teamId === favTeamId;
      if (teamHit) {
        setTeamFixtures({ teamId: favTeamId, rows: teamCache!.rows });
      }
      // Only treat the snapshot as fresh (and so skip the cold-start fetch) when
      // BOTH the team fixtures and the global centre data were cached; gate on
      // the older of the two so a partial cache still triggers a refresh.
      lastLoadAt.current =
        teamHit && centreCache ? Math.min(teamCache!.ts, centreCache.ts) : 0;
      void load();
    };
    void init();
    // Periodic check for the rare always-on (TV) case that never backgrounds;
    // gated by staleness so it only actually fetches once per window.
    const id = setInterval(() => void load(), FIXTURES_STALE_MS);
    // On foreground resume, refresh only if the schedule is stale.
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void load();
    });
    return () => {
      cancelled = true;
      clearInterval(id);
      sub.remove();
    };
  }, [remindersActive, favTeamId]);

  // Fixtures involving the favourite team, sorted by kick off. Team fixtures
  // (fetched directly by team id) are always included — they are definitionally
  // the favourite team's games and not limited to the curated leagues. Curated
  // fixtures are added by name match so channel-mapped games aren't missed; the
  // map dedupes any overlap by fixture id.
  const favFixtures = useMemo<UpcomingFixture[]>(() => {
    if (!favouriteTeam) return [];
    const map = new Map<number, UpcomingFixture>();
    // Only trust team-direct rows that were fetched for the CURRENT favourite.
    if (teamFixtures.teamId === favTeamId) {
      for (const f of teamFixtures.rows) {
        if (f.kickoff != null) map.set(f.fixture_id, f);
      }
    }
    const fav = norm(favouriteTeam.name);
    if (fav) {
      for (const f of fixtures) {
        if (
          f.kickoff != null &&
          !map.has(f.fixture_id) &&
          (norm(f.home_team) === fav || norm(f.away_team) === fav)
        ) {
          map.set(f.fixture_id, f);
        }
      }
    }
    return [...map.values()].sort((a, b) =>
      (a.kickoff ?? "").localeCompare(b.kickoff ?? ""),
    );
  }, [fixtures, teamFixtures, favouriteTeam, favTeamId]);

  // fixture_id → channels.
  const channelMap = useMemo(() => {
    const m = new Map<number, FixtureChannel[]>();
    for (const c of channels) {
      const list = m.get(c.fixture_id) ?? [];
      list.push(c);
      m.set(c.fixture_id, list);
    }
    return m;
  }, [channels]);

  const resolveStream = useCallback(
    (fixtureId: number) => {
      const chans = channelMap.get(fixtureId) ?? [];
      for (const ch of chans) {
        const sid = ch.stream_id != null ? Number(ch.stream_id) : NaN;
        if (Number.isFinite(sid)) {
          const stream = liveStreams.find((s) => s.stream_id === sid);
          if (stream) return { ch, stream };
        }
      }
      return null;
    },
    [channelMap, liveStreams],
  );

  // Keep the latest engine inputs in refs so the interval reads fresh data
  // without restarting on every render.
  const favFixturesRef = useRef(favFixtures);
  favFixturesRef.current = favFixtures;
  const activeRef = useRef(activeReminder);
  activeRef.current = activeReminder;
  const remindersActiveRef = useRef(remindersActive);
  remindersActiveRef.current = remindersActive;

  const persistState = useCallback(() => {
    const pk = profileKeyRef.current;
    if (pk) void saveReminderState(pk, stateMapRef.current);
  }, []);

  const updateFixtureState = useCallback(
    (fixtureId: number, patch: Partial<FixtureReminderState>) => {
      const cur = stateMapRef.current[fixtureId] ?? { ts: Date.now() };
      stateMapRef.current[fixtureId] = { ...cur, ...patch, ts: Date.now() };
      persistState();
    },
    [persistState],
  );

  // ── Engine: surface a single reminder when its time comes ──
  // tick reads only refs so it stays stable across renders; the interval,
  // foreground-resume listener, and fixture-refresh effect all reuse it.
  const tick = useCallback(() => {
    if (!remindersActiveRef.current) return;
    {
      if (activeRef.current) return; // only one overlay at a time
      const now = Date.now();
      for (const f of favFixturesRef.current) {
        if (f.kickoff == null) continue;
        const k = Date.parse(f.kickoff);
        if (!Number.isFinite(k)) continue;
        const st = stateMapRef.current[f.fixture_id] ?? ({ ts: now } as FixtureReminderState);
        if (st.watchPressed) continue;
        const msTo = k - now;

        // 15-min pre-match reminder.
        if (!st.prematchShown && msTo > 0 && msTo <= PREMATCH_LEAD_MS) {
          updateFixtureState(f.fixture_id, { prematchShown: true });
          setActiveReminder({
            fixtureId: f.fixture_id,
            home: f.home_team ?? "?",
            away: f.away_team ?? "?",
            homeLogo: f.home_logo,
            awayLogo: f.away_logo,
            league: f.league_name,
            kickoff: f.kickoff,
            kind: "prematch",
          });
          return;
        }

        // Kick-off reminder — only if the user asked for it and isn't watching.
        if (
          st.kickoffRequested &&
          !st.kickoffShown &&
          msTo <= 0 &&
          now - k <= KICKOFF_GRACE_MS
        ) {
          updateFixtureState(f.fixture_id, { kickoffShown: true });
          setActiveReminder({
            fixtureId: f.fixture_id,
            home: f.home_team ?? "?",
            away: f.away_team ?? "?",
            homeLogo: f.home_logo,
            awayLogo: f.away_logo,
            league: f.league_name,
            kickoff: f.kickoff,
            kind: "kickoff",
          });
          return;
        }
      }
    }
  }, [updateFixtureState]);

  // Drive the engine: steady interval + an immediate check when the app returns
  // to the foreground so a due match is surfaced promptly without drift.
  useEffect(() => {
    if (!remindersActive) return;
    tick(); // catch a game already inside its window on enable / app open
    const id = setInterval(tick, ENGINE_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [remindersActive, tick]);

  // Re-check as soon as the fixture set changes (e.g. after a refresh) so a
  // newly-loaded match already inside its window fires without waiting a tick.
  useEffect(() => {
    if (!remindersActive) return;
    tick();
  }, [favFixtures, remindersActive, tick]);

  const dismissReminder = useCallback(() => {
    setActiveReminder(null);
  }, []);

  const watchReminder = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;
    const resolved = resolveStream(active.fixtureId);
    updateFixtureState(active.fixtureId, { watchPressed: true });
    setActiveReminder(null);
    if (resolved && navigationRef.isReady()) {
      const { ch, stream } = resolved;
      (navigationRef.navigate as (name: string, params: object) => void)("LivePreview", {
        streamId: stream.stream_id,
        name: stream.name ?? ch.channel_name,
        streamUrl: xtreamApi.getLiveStreamUrl(stream.stream_id),
        thumbnail: stream.stream_icon ?? undefined,
        streamIcon: stream.stream_icon ?? undefined,
        categoryId: stream.category_id,
        initialFullscreen: true,
      });
    }
  }, [resolveStream, updateFixtureState]);

  const remindAtKickoff = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;
    updateFixtureState(active.fixtureId, { kickoffRequested: true });
    setActiveReminder(null);
  }, [updateFixtureState]);

  const canWatchActive = useMemo(() => {
    if (!activeReminder) return false;
    return resolveStream(activeReminder.fixtureId) != null;
  }, [activeReminder, resolveStream]);

  // ── Dev-only test reminder (countdown → fake Man Utd overlay) ──
  const [testCountdown, setTestCountdown] = useState<number | null>(null);
  const testTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const triggerTestReminder = useCallback(() => {
    if (!__DEV__) return; // dev-only affordance; never fires in production builds
    if (testTimerRef.current) return; // already counting down
    let n = TEST_COUNTDOWN_SEC;
    setTestCountdown(n);
    testTimerRef.current = setInterval(() => {
      n -= 1;
      if (n > 0) {
        setTestCountdown(n);
        return;
      }
      if (testTimerRef.current) {
        clearInterval(testTimerRef.current);
        testTimerRef.current = null;
      }
      setTestCountdown(null);
      setActiveReminder({
        fixtureId: TEST_FIXTURE_ID,
        home: "Manchester United",
        away: "Test Opponent",
        homeLogo: MAN_UTD_LOGO,
        awayLogo: null,
        league: "Test Reminder",
        kickoff: new Date(Date.now() + PREMATCH_LEAD_MS).toISOString(),
        kind: "prematch",
      });
    }, 1000);
  }, []);

  useEffect(
    () => () => {
      if (testTimerRef.current) clearInterval(testTimerRef.current);
    },
    [],
  );

  const value = useMemo<MatchReminderContextType>(
    () => ({
      favouriteTeam,
      favLoading,
      favSaving,
      saveFavouriteTeam,
      remindersEnabled,
      remindersReady,
      setRemindersEnabled,
      globalEnabled,
      activeReminder,
      canWatchActive,
      dismissReminder,
      watchReminder,
      remindAtKickoff,
      testCountdown,
      triggerTestReminder,
    }),
    [
      favouriteTeam,
      favLoading,
      favSaving,
      saveFavouriteTeam,
      remindersEnabled,
      remindersReady,
      setRemindersEnabled,
      globalEnabled,
      activeReminder,
      canWatchActive,
      dismissReminder,
      watchReminder,
      remindAtKickoff,
      testCountdown,
      triggerTestReminder,
    ],
  );

  // Platform note: this overlay-based system only fires while the app is open.
  // (Kept intentionally — true OS push needs a dev build + server work.)
  void Platform;

  return (
    <MatchReminderContext.Provider value={value}>{children}</MatchReminderContext.Provider>
  );
}

export function useMatchReminder() {
  const ctx = useContext(MatchReminderContext);
  if (!ctx) throw new Error("useMatchReminder must be used within MatchReminderProvider");
  return ctx;
}
