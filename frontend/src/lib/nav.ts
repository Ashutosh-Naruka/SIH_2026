/**
 * The desk's navigation, defined once.
 *
 * Two different things used to be called "navigation" here and they were the
 * wrong way round. The top bar carried Forecast/Fleet/Ports/Risk/Map, which is
 * a table of contents for ONE page (the Voyage Desk) yet stayed on screen --
 * inert -- on all six others. The left rail carried the actual screens, which
 * is where a page's sections normally live, not its pages. They have been
 * swapped: pages across the top, this page's sections down the side.
 *
 * The split below is the second half of that. Voyage Desk, Portfolio and
 * Season Plan answer the problem statement directly -- one cargo, a coverage
 * mix, and a whole season's book. The other four are reference instruments: a
 * reader can price every cargo this desk exists to price without opening any
 * of them. Grouping them under one menu says which is which, rather than
 * presenting seven equal siblings and leaving a reviewer to work out that four
 * of them are supporting evidence.
 */

export type DeskView =
  | 'desk'
  | 'season-plan'
  | 'port-twin'
  | 'tonnage-field'
  | 'fragility'
  | 'ledger'
  | 'portfolio'

export interface NavItem {
  view: DeskView
  label: string
  /** What this screen answers, for the menu and for tooltips. */
  hint: string
}

/** The decision path: these three are the problem statement. */
export const PRIMARY_NAV: readonly NavItem[] = [
  {
    view: 'desk',
    label: 'Voyage Desk',
    hint: 'Price one cargo: lock or wait, the rate forecast, and the evidence behind it.',
  },
  {
    view: 'portfolio',
    label: 'Portfolio',
    hint: 'The spot / period / COA coverage mix for the year, against a real stockout penalty.',
  },
  {
    view: 'season-plan',
    label: 'Season Plan',
    hint: "A whole season's cargo book scheduled across the fleet in one solve.",
  },
]

/** Reference instruments. Real screens on real data — but nothing here has to
 *  be opened to price a cargo, and the menu label says so. */
export const TOOLS_NAV: readonly NavItem[] = [
  {
    view: 'port-twin',
    label: 'Port Twin',
    hint: 'What a named port can actually take today: draft, berths, congestion.',
  },
  {
    view: 'tonnage-field',
    label: 'Tonnage Field',
    hint: 'Where the ships are: supply pressure by region, from real position data.',
  },
  {
    view: 'fragility',
    label: 'Fragility',
    hint: 'How badly a lane breaks when a chokepoint or a berth goes down.',
  },
  {
    view: 'ledger',
    label: 'Ledger',
    hint: 'What the desk recommended, what was fixed, and what it actually achieved.',
  },
]

export const ALL_NAV: readonly NavItem[] = [...PRIMARY_NAV, ...TOOLS_NAV]

/** Every view, for the deep-link parser and for the shell's own lookups. */
export const ALL_VIEWS: readonly DeskView[] = ALL_NAV.map((n) => n.view)

export function navLabel(view: DeskView): string {
  return ALL_NAV.find((n) => n.view === view)?.label ?? view
}

/**
 * Sections of the Voyage Desk, in the order they render.
 *
 * These are anchors into one page. They belong to that page and to no other,
 * which is why the rail that shows them is mounted only when the Voyage Desk
 * is on screen and only once a quote has produced the panels to jump to --
 * a link to `#decision` from the Ledger, or from an unpriced desk, has nothing
 * to scroll to and should not be offered.
 *
 * These are now the desk's BANDS, not individual panels. The previous list
 * (Forecast/Fleet/Ports/Risk/Map) named five panels directly, and four of
 * those now live inside the Evidence band's tabs -- an element inside an
 * unselected tab is display:none, so scrollIntoView on it lands nowhere and
 * the IntersectionObserver that drives the "you are here" highlight never
 * sees it. Bands are always rendered whenever a quote exists, which is the
 * property a scroll target has to have.
 */
export const DESK_SECTIONS: readonly { id: string; label: string }[] = [
  { id: 'decision', label: 'Decision' },
  { id: 'results', label: 'Results' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'route', label: 'Route' },
  { id: 'remarks', label: 'Remarks' },
]
