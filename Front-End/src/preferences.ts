import { useSyncExternalStore } from 'react'

/**
 * A setting saved on this device (localStorage) and shared live by every component
 * that uses it. `clean` turns whatever was stored (possibly junk or nothing) into a
 * valid value.
 */
export function createPreference<T extends object>(key: string, clean: (saved: unknown) => T) {
  const listeners = new Set<() => void>()
  let cached: T | null = null

  function get(): T {
    if (cached) return cached
    try {
      cached = clean(JSON.parse(localStorage.getItem(key) ?? 'null'))
    } catch {
      cached = clean(null)  // storage unavailable (private mode etc.)
    }
    return cached
  }

  function set(change: Partial<T>) {
    cached = { ...get(), ...change }
    try { localStorage.setItem(key, JSON.stringify(cached)) } catch { /* just don't remember */ }
    listeners.forEach((fn) => fn())
  }

  function subscribe(onChange: () => void) {
    listeners.add(onChange)
    return () => { listeners.delete(onChange) }
  }

  function use(): [T, (change: Partial<T>) => void] {
    return [useSyncExternalStore(subscribe, get), set]
  }

  return { get, set, use }
}
