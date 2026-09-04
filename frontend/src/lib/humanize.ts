/**
 * Rewrites backend-authored "why this is missing" strings into plain English.
 *
 * These arrive from the API carrying raw field names and endpoint paths:
 *
 *   "opex_usd_per_day is not available at the /quote level -- see POST /landed-cost."
 *   "no handling_rate_usd_per_mt supplied -- no repo-derived $/MT handling
 *    tariff exists (opt.network.Port.handling_rate_tph is a throughput rate,
 *    not a price)"
 *
 * Every one of them is *correct* and worth reading — they are the honesty layer
 * that says which parts of a landed cost are real. But `opex_usd_per_day` and
 * `POST /landed-cost` are implementation vocabulary, and a charterer has no
 * reason to decode either.
 *
 * The backend is frozen, so this is presentation-only, and it is deliberately
 * conservative:
 *  - The rewrite must preserve the caveat exactly. Nothing is softened, and no
 *    "unavailable" becomes "unknown" or disappears. Where the original says a
 *    thing is never assumed, the rewrite says so too.
 *  - Anything not explicitly matched is passed through VERBATIM, so a future
 *    backend message can never be silently swallowed or half-translated.
 *  - Callers keep the original string as a tooltip, so the exact wording the
 *    API returned stays reachable for anyone auditing a number.
 *
 * One exception to "verbatim": `cleanDashes` below. The backend's own prose
 * style writes " -- " where the rendered desk wants a real em dash — every
 * word is kept exactly as written, only the two-character stand-in becomes
 * one real character. That is punctuation, not content, so it happens
 * whether or not a RULES entry also matched.
 */

interface Rule {
  /** Matched against the raw reason, case-insensitively. */
  match: RegExp
  /** The plain-English replacement. Must not weaken the original claim. */
  text: string
}

const RULES: Rule[] = [
  {
    match: /opex_usd_per_day is not available at the \/quote level/i,
    text:
      'A daily operating cost is needed to price waiting time, and a quote does not carry one. Enter it in the assumptions below to include this.',
  },
  {
    match: /no handling_rate_usd_per_mt supplied/i,
    text:
      'No handling tariff supplied. There is no per-tonne handling price on record to fall back on. The port data holds a throughput rate (tonnes per hour), which is a speed, not a price.',
  },
  {
    match: /no demurrage_usd_per_day\/laytime_allowance_days supplied/i,
    text:
      'No demurrage rate or laytime allowance supplied. These are contractual terms agreed per fixture, so they are never assumed.',
  },
  {
    match: /no origin_port supplied/i,
    text:
      'No origin port supplied, so the route (and therefore which war-risk listed areas it enters) cannot be resolved.',
  },
  { match: /^no commodity supplied$/i, text: 'No commodity supplied.' },
  { match: /convert_to_inr not requested/i, text: 'Not converted to rupees.' },
]

/** The one mechanical fix applied to every backend string this module
 *  touches, matched or not: prose dashes are removed.
 *
 *  This used to run the other way, turning " -- " into a real em dash. That
 *  was the wrong direction. The desk's text convention is ordinary
 *  punctuation, and it is not worth carrying a second dash convention just
 *  for strings that happen to arrive from Python: a backend note rendered
 *  with an em dash read as a different voice from every sentence around it,
 *  and the dash itself is the thing that is hard to read at a glance.
 *
 *  Both forms now fold into ordinary punctuation. A matched pair becomes a
 *  parenthesis, which is what a pair of dashes was standing in for. A single
 *  dash becomes a comma, except before a capital letter, where the dash was
 *  joining two independent clauses and a comma would be a splice.
 *
 *  This is a display-layer safety net, not the primary fix: the strings in
 *  src/ and backend/ that reach the UI had their own dashes removed at
 *  source. It stays because it also covers strings this module never
 *  matched, and because it costs nothing to keep the guarantee mechanical.
 *
 *  Exported so the raw-original tooltip (see `wasRewritten` below) can carry
 *  the same fix as the humanized text. */
export function cleanDashes(s: string): string {
  return (
    s
      // A matched pair is a parenthetical: " ... -- aside -- ... ".
      .replace(/ (?:--|—) (.{2,70}?) (?:--|—) /g, ' ($1) ')
      // A single dash: comma, or a full stop where an independent clause
      // follows (a leading capital is the only signal available here).
      .replace(/ (?:--|—) (\S)/g, (_m, next: string) =>
        next !== next.toLowerCase() && next === next.toUpperCase() ? `. ${next}` : `, ${next}`,
      )
      // A dash left stranded at either end punctuates nothing.
      .replace(/ (?:--|—)\s*$/g, '')
      .replace(/^(?:--|—) /g, '')
  )
}

/**
 * Returns the plain-English form of a backend reason, or the original string
 * unchanged (but for `cleanDashes`) when nothing matches.
 */
export function humanizeReason(reason: string | null | undefined): string | null {
  if (!reason) return null
  const hit = RULES.find((r) => r.match.test(reason))
  return hit ? hit.text : cleanDashes(reason)
}

/** True when `humanizeReason` actually rewrote the string — callers use this
 *  to decide whether showing the original in a tooltip adds anything. */
export function wasRewritten(reason: string | null | undefined): boolean {
  if (!reason) return false
  return RULES.some((r) => r.match.test(reason))
}

/**
 * Landed-cost component keys, as the API names them, mapped to the labels the
 * rows in that panel already use — so "excludes: handling_cost, war_risk"
 * becomes "excludes: handling, war risk" and refers to the same words the
 * reader just looked at. Unknown keys pass through with underscores stripped
 * rather than being dropped.
 */
const COMPONENT_LABEL: Record<string, string> = {
  freight: 'freight',
  wait_cost: 'wait / delay',
  handling_cost: 'handling',
  demurrage_cost: 'demurrage',
  war_risk: 'war risk',
  commodity_price: 'commodity price',
}

export function componentLabel(key: string): string {
  return COMPONENT_LABEL[key] ?? key.replace(/_/g, ' ')
}
