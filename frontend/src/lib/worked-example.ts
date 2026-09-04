import type { QuoteRequest, VesselClass } from '@/lib/types'

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

/**
 * The two ships the worked example puts "in hand".
 *
 * Why two, and why at all: several panels on the desk only have anything to
 * say once a real vessel is attached to the quote. The CII panel grades a
 * specific ship's fuel burn against its IMO required intensity, so with no
 * vessel it can only print "add a vessel"; the fleet and laytime panels are
 * the same. Someone clicking "Load worked example" to see what the desk does
 * was landing on those panels empty, which reads as broken rather than as
 * "you did not ask for this yet". Two rather than one because the whole point
 * of the vessel-class comparison is a choice between ships.
 *
 * PROVENANCE, because these are numbers and this repo does not ship numbers
 * without saying where they came from: these are DECLARED inputs, not
 * observations. They are class-typical particulars for a Panamax and a
 * Supramax bulk carrier, of exactly the same character as the defaults
 * newVesselDraft() already puts in the form when you click "+ Add vessel" --
 * a plausible ship of that class, not a specific hull looked up in a
 * register. The vessel ids say the same thing: SAIL_1 and SAIL_2 are
 * placeholders, deliberately not the name or IMO number of a real ship,
 * because claiming a real vessel's particulars without having read them off a
 * real register entry is exactly the kind of invention this codebase refuses.
 * Everything the desk then computes from them (CII, laytime, landed cost) is
 * MODEL_DERIVED from these declared figures and is only as real as they are.
 *
 * Positions are real ports from PortEnum and are chosen to make the example
 * non-trivial: one ship is already at the load port, the other has to ballast
 * up from Singapore, so the two do not score identically.
 */
export interface ExampleVessel {
  vesselId: string
  vesselClass: VesselClass
  /** PortEnum code -- must be one /ports returns, or the form's port select
   *  has no option to match and silently shows blank. */
  port: string
  /** Days after the pricing anchor that the ship comes free. Both are well
   *  inside the laycan lead time above, so neither is excluded for being
   *  unable to make the window. */
  availableOffsetDays: number
  dwt: string
  draftM: string
  loaM: string
  beamM: string
  speedKn: string
  ladenFuel: string
  ballastFuel: string
}

export const EXAMPLE_VESSELS: readonly ExampleVessel[] = [
  {
    vesselId: 'SAIL_1',
    vesselClass: 'Panamax',
    port: 'NEWCASTLE_AU',
    availableOffsetDays: 0,
    dwt: '76000',
    draftM: '13.5',
    loaM: '225',
    beamM: '32.2',
    speedKn: '13',
    ladenFuel: '32',
    ballastFuel: '27',
  },
  {
    vesselId: 'SAIL_2',
    vesselClass: 'Supramax',
    port: 'SINGAPORE',
    availableOffsetDays: 5,
    dwt: '56000',
    draftM: '12.8',
    loaM: '190',
    beamM: '32.3',
    speedKn: '13',
    ladenFuel: '26',
    ballastFuel: '22',
  },
]

/** The example fleet with `availableOffsetDays` resolved against the same
 *  pricing anchor the cargo above is priced from. */
export function exampleVessels(
  anchorIso: string,
): (Omit<ExampleVessel, 'availableOffsetDays'> & { availableFrom: string })[] {
  return EXAMPLE_VESSELS.map(({ availableOffsetDays, ...v }) => ({
    ...v,
    availableFrom: addDaysIso(anchorIso, availableOffsetDays),
  }))
}
