// Tiny module-scope event bus for Multi Screen channel picking.
//
// React Navigation's stack navigator does not have a clean "navigate back
// with a return value" API. The picker screen calls `multiScreenBus.emit`
// with the picked channel + the slot index it was opened for, then pops.
// MultiScreenScreen registers a listener while it is mounted and applies
// the pick to the matching slot.

import type { LiveStream } from "@/lib/xtream-api";

export type MultiScreenPick = {
  slotIndex: number;
  stream: LiveStream;
};

type Listener = (pick: MultiScreenPick) => void;

let listener: Listener | null = null;

export const multiScreenBus = {
  setListener(l: Listener | null) { listener = l; },
  emit(pick: MultiScreenPick) {
    if (!listener) return;
    if (!Number.isInteger(pick.slotIndex) || pick.slotIndex < 0) return;
    listener(pick);
  },
};
