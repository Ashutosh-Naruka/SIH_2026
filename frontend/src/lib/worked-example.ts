import type { QuoteRequest } from '@/lib/types'

/**
 * The worked example: one real lane, defined once.
 *
 * Newcastle to Paradip is the trade the problem statement itself names. There
 * is nothing canned about the answer -- this builds an ordinary QuoteRequest
 * and the desk solves it through exactly the path any typed cargo takes. What
 * is fixed here is only the *input*: the seven fields someone would otherwise
 * have to know to type.
 *
 * It lives in its own module because two callers now need the same figures and
 * they must not drift: the quote form fills its inputs from this (so a reader
 * can see what the example is actually pricing before it runs), and App
 * submits it.
 *
 * The laycan is measured from the last day of real market data, not from the
 * wall clock -- pricing from a date the dataset does not reach is not a demo,
 * it is a wrong answer. Callers pass that anchor in; this module has no
 * opinion about what "today" is.
 */

/** Days from the pricing date to the first day of the laycan window. */
export const EXAMPLE_LEAD_DAYS = 14

/** Length of the laycan window, in days. */
export const EXAMPLE_WINDOW_DAYS = 7

function addDaysIso(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

/** A one-line description of the lane, for the button that loads it. */
export const EXAMPLE_CAPTION =
  'Newcastle → Paradip, 75,000 t thermal coal, laycan in a fortnight'

/** The example as a request, priced as of `anchorIso` (the real last day of
 *  market data). */
export function workedExample(anchorIso: string): QuoteRequest {
  return {
    cargo_volume_dwt: 75_000,
    origin_port: 'NEWCASTLE_AU' as QuoteRequest['origin_port'],
    dest_port: 'PARADIP' as QuoteRequest['dest_port'],
    laycan_start: addDaysIso(anchorIso, EXAMPLE_LEAD_DAYS),
    laycan_end: addDaysIso(anchorIso, EXAMPLE_LEAD_DAYS + EXAMPLE_WINDOW_DAYS),
    contract_term_days: 30,
    commodity: 'Thermal Coal',
    as_of: anchorIso,
    risk_tolerance: 0,
  }
}
