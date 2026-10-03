import { useEffect } from "react";
import { TVEventHandler } from "@/lib/tv-event-handler";

// "Hold OK to favourite", on a TV remote.
//
// On a phone this is a touch long-press and React Native handles it. A remote
// never produces a touch: Android turns a held OK button into repeating KEY
// events, so onPressIn/onPressOut/onLongPress simply never fire and every
// JS-side timing workaround is dead code.
//
// The native module detects the hold and emits "longSelect". The problem then
// is knowing WHICH item it applies to, and subscribing in every one of a few
// hundred list cards would be wasteful. Instead each card registers its action
// while it holds focus — there is only ever one focused item — and a single
// subscription fires whatever is registered.
type Action = () => void;

let focusedAction: Action | null = null;

/** Called by a card when it gains focus. */
export function setLongPressAction(action: Action): void {
  focusedAction = action;
}

/** Called by a card when it loses focus. Only clears its own registration, so a
 *  blur arriving after the next item's focus cannot wipe the new one. */
export function clearLongPressAction(action: Action): void {
  if (focusedAction === action) focusedAction = null;
}

/**
 * Mount once per screen that has long-pressable items. Fires the focused
 * item's registered action when the remote's OK button is held.
 */
export function useTvLongPress(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = new TVEventHandler();
    handler.enable(null, (_component, evt) => {
      if (evt.eventType !== "longSelect") return;
      focusedAction?.();
    });
    return () => handler.disable();
  }, [enabled]);
}
