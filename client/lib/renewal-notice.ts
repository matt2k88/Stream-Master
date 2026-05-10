import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "@ultracast/renewal_notice_seen";

function buildKey(username: string, expDate: string | null | undefined): string {
  return `${PREFIX}/${username}/${expDate ?? ""}`;
}

export async function hasSeenRenewalNotice(
  username: string,
  expDate: string | null | undefined,
): Promise<boolean> {
  if (!username || !expDate) return false;
  try {
    const v = await AsyncStorage.getItem(buildKey(username, expDate));
    return v === "1";
  } catch {
    return false;
  }
}

export async function markRenewalNoticeSeen(
  username: string,
  expDate: string | null | undefined,
): Promise<void> {
  if (!username || !expDate) return;
  try {
    await AsyncStorage.setItem(buildKey(username, expDate), "1");
  } catch {
  }
}
