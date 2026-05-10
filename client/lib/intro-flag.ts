import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@ultracast/replay_intro_on_resume";

export async function markReplayIntroOnResume(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, "1");
  } catch {
  }
}

export async function consumeReplayIntroFlag(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === "1") {
      await AsyncStorage.removeItem(KEY);
      return true;
    }
  } catch {
  }
  return false;
}
