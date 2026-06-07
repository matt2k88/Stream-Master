import AsyncStorage from "@react-native-async-storage/async-storage";

// Per-profile set of league ids the user has chosen to HIDE from the Football
// Centre's Live Now / Upcoming lists. We store the hidden set (rather than the
// visible set) so that any league newly added to the curated list defaults to
// visible. An empty set means "show everything", which keeps the original
// behaviour for users who never touch the filter.
const HIDDEN_PREFIX = "ultracast.footballCentre.hiddenLeagues.";

export async function loadHiddenLeagues(profileKey: string): Promise<Set<number>> {
  try {
    const raw = await AsyncStorage.getItem(HIDDEN_PREFIX + profileKey);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((n): n is number => typeof n === "number"));
  } catch {
    return new Set();
  }
}

export async function saveHiddenLeagues(
  profileKey: string,
  hidden: Set<number>,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      HIDDEN_PREFIX + profileKey,
      JSON.stringify([...hidden]),
    );
  } catch {
    // best-effort; a failed write just means the filter resets next launch
  }
}
