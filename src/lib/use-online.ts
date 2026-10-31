"use client";

import { useSyncExternalStore } from "react";

/**
 * Points can't be added or spent without a connection (FR-041): the server has to commit every change, so
 * nothing is queued on the phone. These helpers let screens say so plainly instead of failing oddly.
 */
export const OFFLINE_MESSAGE = "You're offline. Points can't be added or spent until you're back online. Nothing was changed.";

const subscribe = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine !== false,
    () => true
  );
}

/** True when the browser knows it has no connection. */
export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** A failed request on a dropped connection reads "Failed to fetch"; say what actually happened. */
export function networkAwareMessage(err: unknown, fallback: string): string {
  if (isOffline() || (err instanceof TypeError && /fetch|network/i.test(err.message))) return OFFLINE_MESSAGE;
  return err instanceof Error ? err.message : fallback;
}
