import { useSyncExternalStore } from "react";

// Authentication starts behind the intro; expensive catalogue parsing waits.
let introDone = false;
const listeners = new Set<() => void>();

export function markIntroDone(): void {
  if (introDone) return;
  introDone = true;
  for (const listener of listeners) listener();
}

// Existing Exit App / warm-resume behaviour can replay the intro in-process.
export function resetIntroGate(): void {
  if (!introDone) return;
  introDone = false;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getSnapshot = () => introDone;

export function useIntroDone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}