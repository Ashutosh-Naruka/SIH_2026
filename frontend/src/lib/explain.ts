import { useSyncExternalStore } from 'react'

/**
 * Explain mode — the desk's missing "Layer 2".
 *
 * The review's structural diagnosis was that this app has Layer 1 (the answer:
 * WAIT, $19,444/day) and Layer 3 (the evidence: fans, tiers, provenance,
 * n_obs), but nothing in between. A SAIL employee reads the headline verdict,
 * understands it, and then hits `contingent_infeasible`, "Index type:
 * RELATIVE" and "mean realised regret $/day" with no idea what any of it is
 * for. Every panel needed one visible sentence answering *what question does
 * this panel answer, and what do I do if the number is bad?*
 *
 * Two things made this non-trivial to just "add a line to every panel":
 *
 *  1. `Panel` already had a `hint` prop, and it already carried a decent
 *     one-line description — but behind a hover tooltip, where a first-time
 *     reader never finds it. Answering "what is this" on hover is not the same
 *     as answering "what do I do about it" in the layout.
 *
 *  2. The Voyage Desk lays its panels out in explicitly sized rows
 *     (`h-[Npx]`), and a permanent extra line in every header would eat into
 *     content on a screen already flagged as tight at 1366x768. A trader who
 *     knows what a walk-away line is should not pay for the explanation
 *     forever.
 *
 * So the text is always in the source, and its visibility is one switch.
 *
 * It defaults OFF, reversed from the original choice. The reasoning for ON
 * was that a first-time reader is the person this text was written for, and
 * that is still true -- but ON also meant that every panel on a screen full
 * of panels carried two or three extra lines of prose before the reader had
 * asked anything, and the desk was reported as unreadable for exactly that:
 * too much text, shown upfront, competing with the numbers it annotates. The
 * explanations are not the problem; showing all of them at once, unasked, is.
 *
 * Nothing is lost by the flip. Every sentence is still written, still in the
 * source, and one labelled click away in the top bar, and the choice persists
 * per browser -- so a reader who wants the explanations turns them on once and
 * keeps them, and a reader who does not never pays for them.
 *
 * Deliberately NOT React context: `Panel` is rendered from ~20 files including
 * a few that mount outside the main shell tree, and a provider that some
 * subtree silently misses fails by showing nothing — the exact failure this is
 * meant to fix. A module-level store read through `useSyncExternalStore` is
 * correct from anywhere, concurrent-safe, and re-renders every subscriber on
 * change.
 */

const STORAGE_KEY = 'desk.explainMode'

function readStored(): boolean {
  // Any of localStorage-disabled, private mode, or a cleared profile throws or
  // returns null here. Default OFF is the fallback for the same reason it is
  // the default at all: a reader whose preference cannot be read sees the
  // uncluttered desk and one clearly labelled "Explain" button, rather than
  // every panel's explanation at once on a screen they have not read yet.
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

let enabled = readStored()
const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

function getSnapshot(): boolean {
  return enabled
}

export function setExplainMode(next: boolean): void {
  if (next === enabled) return
  enabled = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
  } catch {
    // A browser that will not persist the choice still honours it for this
    // session — the in-memory value above is what every subscriber reads.
  }
  for (const listener of listeners) listener()
}

/** True when panels should render their plain-English "so what" line. */
export function useExplainMode(): boolean {
  // The third argument is the server/prerender snapshot. This app is
  // client-rendered, but passing it keeps the hook correct if it is ever
  // rendered without a `window`.
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
