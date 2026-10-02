import { requireOptionalNativeModule } from "expo-modules-core";

// Drop-in replacement for react-native-tvos's TVEventHandler.
//
// The player screens were written against that API, but this app runs standard
// React Native, which does not export TVEventHandler at all — so every
// `require("react-native").TVEventHandler` returned undefined and the media-key
// effects bailed on their first line. That is why play/pause and the skip
// buttons on a Fire TV remote did nothing, despite the handling code existing.
//
// Keeping the same shape (`new TVEventHandler()` / `.enable(component, cb)` /
// `.disable()`) means each player screen only has to swap its import; all of
// the existing key-to-action mapping keeps working untouched.
//
// Backed by the local expo module in modules/tv-remote. `requireOptionalNativeModule`
// returns null rather than throwing where the native side is absent (web, iOS,
// or a build made before this module existed), in which case this degrades to
// the same no-op behaviour as before.
const TvRemote = requireOptionalNativeModule<{
  addListener: (
    event: "onTvRemoteKey",
    listener: (payload: { eventType: string }) => void,
  ) => { remove: () => void };
}>("TvRemote");

export type TVEvent = { eventType: string };

export class TVEventHandler {
  private subscription: { remove: () => void } | null = null;

  enable(
    component: unknown,
    callback: (component: unknown, event: TVEvent) => void,
  ): void {
    if (!TvRemote) return;
    this.subscription = TvRemote.addListener("onTvRemoteKey", (payload) => {
      callback(component, payload);
    });
  }

  disable(): void {
    this.subscription?.remove();
    this.subscription = null;
  }
}

export const isTvRemoteAvailable = TvRemote != null;
