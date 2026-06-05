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
