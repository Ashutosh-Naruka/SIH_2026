/**
 * Theme control.
 *
 * Dark is the product's primary look and the default when nothing else is
 * known. A stored choice always wins; absent one, dark — the OS preference is
 * never consulted (see `getSnapshot` below for why).
 *
 * The class goes on <html> (not <body>) so the pre-paint script in index.html
 * can set it before React mounts -- a theme applied in an effect flashes the
 * wrong palette for a frame, which on this palette pair is a full white-to-
 * near-black flash.
 *
 * Only `.light` is ever added or removed. Dark lives on bare `:root`, so the
 * absence of the class IS the dark theme and there is no state where neither
 * palette is defined.
 */

import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'desk-theme'

/**
 * The toggle exists in two places (top bar, settings drawer). Both used to
 * seed a private `useState` from `<html>` once at mount and never look again,
 * so switching one left the other showing the stale theme until it happened
 * to remount. `listeners` plus `useTheme` below make `<html>`'s class the one
 * source of truth every mounted toggle re-reads from, via
 * `useSyncExternalStore` -- setTheme's writer and each toggle's reader now go
 * through the same object instead of each keeping its own copy.
 */
const listeners = new Set<() => void>()

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => listeners.delete(onStoreChange)
}

/**
 * The theme actually applied to the document right now: dark unless the user
 * has explicitly chosen light. The OS preference does NOT get a vote.
 *
 * This used to fall back to `systemTheme()`, and it meant anyone on a
 * light-mode machine — the majority — opened the product and saw the light
 * theme, having never been shown the one it was designed around. "Dark is the
 * primary experience" and "defer to the OS" are contradictory instructions,
 * and deferring silently won. A product with a deliberate look ships that look
 * first and lets people opt out; the toggle is right there in the top bar.
 */
function getSnapshot(): Theme {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark'
}

/** Every mounted toggle's live view of the theme, plus the setter. */
export function useTheme(): readonly [Theme, (t: Theme) => void] {
  return [useSyncExternalStore(subscribe, getSnapshot, () => 'dark'), setTheme] as const
}

/** The stored choice, if the user has made one and storage is readable. */
export function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'dark' || v === 'light' ? v : null
  } catch {
    // Private windows and blocked site-data both throw on access rather than
    // returning null, so this has to be a try/catch, not a null check.
    return null
  }
}

/** What the OS asks for. Read only for reporting — see `getSnapshot` for why it is never consulted to pick the applied theme. */
export function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('light', theme === 'light')
  document.documentElement.style.colorScheme = theme
}

export function setTheme(theme: Theme): void {
  applyTheme(theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Persisting is a convenience; failing to persist must not break the
    // toggle itself, which has already applied above.
  }
  // Tell every mounted toggle to re-read `<html>`'s class -- see `useTheme`.
  listeners.forEach((l) => l())
}
