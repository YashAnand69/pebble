'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { MOTION_STORAGE, motionMode } from './motion.mjs';
const CHANGE_EVENT = 'pebble-motion-change';
let transientPreference = 'system';
let transientOverride = false;
function media() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)');
}
function snapshot() {
  let preference = transientPreference;
  try {
    if (!transientOverride)
      preference =
        window.localStorage.getItem(MOTION_STORAGE) ?? transientPreference;
  } catch {}
  return motionMode(Boolean(media()?.matches), preference);
}
function subscribe(callback: () => void) {
  const query = media();
  const storage = (event: StorageEvent) => {
    if (event.key === MOTION_STORAGE || event.key === null) callback();
  };
  window.addEventListener('storage', storage);
  window.addEventListener(CHANGE_EVENT, callback);
  query?.addEventListener?.('change', callback);
  return () => {
    window.removeEventListener('storage', storage);
    window.removeEventListener(CHANGE_EVENT, callback);
    query?.removeEventListener?.('change', callback);
  };
}
export function useMotionPreference() {
  const mode = useSyncExternalStore(
    subscribe,
    snapshot,
    () => 'system-reduced',
  );
  const reduced = mode !== 'full';
  useEffect(() => {
    document.documentElement.dataset.pebbleMotion = reduced
      ? 'reduced'
      : 'full';
  }, [reduced]);
  function toggle() {
    transientPreference = reduced ? 'system' : 'reduced';
    try {
      window.localStorage.setItem(MOTION_STORAGE, transientPreference);
      transientOverride = false;
    } catch {
      transientOverride = true;
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
  return { mode, reduced, toggle };
}
