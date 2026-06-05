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
import { Alert, Platform } from "react-native";
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
}

const MatchReminderContext = createContext<MatchReminderContextType | undefined>(undefined);

const PREMATCH_LEAD_MS = 15 * 60 * 1000; // notify 15 min before kick off
const KICKOFF_GRACE_MS = 15 * 60 * 1000; // don't fire a kick-off reminder for games long started
const ENGINE_MS = 30 * 1000;
const FIXTURES_REFRESH_MS = 10 * 60 * 1000;

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

  useEffect(() => {
    if (!remindersActive) {
      setFixtures([]);
      setChannels([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const [fRes, cRes] = await Promise.all([
          fetch(new URL("/api/football/centre/fixtures", getApiUrl()).toString()),
          fetch(new URL("/api/football/centre/channels", getApiUrl()).toString()),
        ]);
        if (fRes.ok) {
          const data = await fRes.json();
          if (!cancelled) setFixtures(Array.isArray(data) ? data : []);
        }
        if (cRes.ok) {
          const data = await cRes.json();
          if (!cancelled) setChannels(Array.isArray(data) ? data : []);
        }
      } catch {
        // silent — non-critical
      }
    };
    void load();
    const id = setInterval(load, FIXTURES_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [remindersActive]);

  // Fixtures involving the favourite team, sorted by kick off.
  const favFixtures = useMemo<UpcomingFixture[]>(() => {
    if (!favouriteTeam) return [];
    const fav = norm(favouriteTeam.name);
    if (!fav) return [];
    return fixtures
      .filter(
        (f) =>
          f.kickoff != null &&
          (norm(f.home_team) === fav || norm(f.away_team) === fav),
      )
      .sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? ""));
  }, [fixtures, favouriteTeam]);

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
  useEffect(() => {
    if (!remindersActive) return;

    const tick = () => {
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
    };

    tick(); // catch a game already inside its window on enable / app open
    const id = setInterval(tick, ENGINE_MS);
    return () => clearInterval(id);
  }, [remindersActive, updateFixtureState]);

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
