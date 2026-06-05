import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Device-local storage for the favourite-team match reminder system.
 *
 * Reminders are a *device* behaviour (an in-app popup that fires while the app
 * is open), so the on/off switch is stored per-profile on the device rather than
 * in the DB. The per-fixture state below stops a reminder firing twice across
 * app reloads.
 */

const ENABLED_PREFIX = "ultracast.matchReminders.enabled.";
const STATE_PREFIX = "ultracast.matchReminders.state.v2.";

export async function loadRemindersEnabled(profileId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(ENABLED_PREFIX + profileId);
    return raw === "1";
  } catch {
    return false;
  }
}

export async function saveRemindersEnabled(profileId: string, on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(ENABLED_PREFIX + profileId, on ? "1" : "0");
  } catch {
    // best-effort
  }
}

export interface FixtureReminderState {
  /** Pre-kickoff (15 min) reminder has been shown. */
  prematchShown?: boolean;
  /** User asked to be reminded again at kick off. */
  kickoffRequested?: boolean;
  /** Kick-off reminder has been shown. */
  kickoffShown?: boolean;
  /** User pressed Watch Now — suppresses any further reminders for this game. */
  watchPressed?: boolean;
  /** Last update (ms epoch) — used for pruning old entries. */
  ts: number;
}

export type ReminderStateMap = Record<string, FixtureReminderState>;

const PRUNE_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

export async function loadReminderState(profileKey: string): Promise<ReminderStateMap> {
  try {
    const raw = await AsyncStorage.getItem(STATE_PREFIX + profileKey);
    if (!raw) return {};
    const obj = JSON.parse(raw) as ReminderStateMap;
    if (!obj || typeof obj !== "object") return {};
    // Prune stale entries so the map can't grow without bound.
    const now = Date.now();
    const pruned: ReminderStateMap = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v.ts === "number" && now - v.ts < PRUNE_MS) pruned[k] = v;
    }
    return pruned;
  } catch {
    return {};
  }
}

export async function saveReminderState(profileKey: string, map: ReminderStateMap): Promise<void> {
  try {
    await AsyncStorage.setItem(STATE_PREFIX + profileKey, JSON.stringify(map));
  } catch {
    // best-effort
  }
}

/**
 * On-device cache of the fetched fixture schedule. The schedule is *team* data
 * (not per-profile), so the team fixtures are keyed by team id and shared across
 * profiles; the curated centre fixtures + channel map are global. Hydrating from
 * this cache on launch lets reminders fire instantly (and offline) without
 * waiting on the network, and lets the engine skip the cold-start fetch when the
 * cached snapshot is still fresh.
 *
 * Anything older than CACHE_MAX_AGE_MS is treated as a miss so we never hydrate
 * an ancient schedule whose fixtures have all already passed.
 */
const TEAM_FIXTURES_PREFIX = "ultracast.matchReminders.teamFixtures.v1.";
const CENTRE_CACHE_KEY = "ultracast.matchReminders.centre.v1";
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface CachedTeamFixtures<T = unknown> {
  teamId: number;
  ts: number;
  rows: T[];
}

export async function loadTeamFixturesCache<T>(
  teamId: number,
): Promise<CachedTeamFixtures<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(TEAM_FIXTURES_PREFIX + teamId);
    if (!raw) return null;
    const obj = JSON.parse(raw) as CachedTeamFixtures<T>;
    if (!obj || typeof obj.ts !== "number" || !Array.isArray(obj.rows)) return null;
    if (obj.teamId !== teamId) return null;
    if (Date.now() - obj.ts >= CACHE_MAX_AGE_MS) return null;
    return obj;
  } catch {
    return null;
  }
}

export async function saveTeamFixturesCache<T>(teamId: number, rows: T[]): Promise<void> {
  try {
    const payload: CachedTeamFixtures<T> = { teamId, ts: Date.now(), rows };
    await AsyncStorage.setItem(TEAM_FIXTURES_PREFIX + teamId, JSON.stringify(payload));
  } catch {
    // best-effort
  }
}

export interface CachedCentre<F = unknown, C = unknown> {
  ts: number;
  fixtures: F[];
  channels: C[];
}

export async function loadCentreCache<F, C>(): Promise<CachedCentre<F, C> | null> {
  try {
    const raw = await AsyncStorage.getItem(CENTRE_CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as CachedCentre<F, C>;
    if (!obj || typeof obj.ts !== "number") return null;
    if (!Array.isArray(obj.fixtures) || !Array.isArray(obj.channels)) return null;
    if (Date.now() - obj.ts >= CACHE_MAX_AGE_MS) return null;
    return obj;
  } catch {
    return null;
  }
}

export async function saveCentreCache<F, C>(fixtures: F[], channels: C[]): Promise<void> {
  try {
    const payload: CachedCentre<F, C> = { ts: Date.now(), fixtures, channels };
    await AsyncStorage.setItem(CENTRE_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // best-effort
  }
}
