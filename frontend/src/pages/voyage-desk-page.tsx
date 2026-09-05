import { FileText, Info } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { BackhaulPanel } from '@/components/desk/backhaul-panel'
import { AnchoragePanel } from '@/components/desk/anchorage-panel'
import { Band, CollapsibleBand } from '@/components/desk/band'
import { CIIPanel } from '@/components/desk/cii-panel'
import { CopyLinkButton } from '@/components/desk/copy-link-button'
import { DecisionBrief } from '@/components/desk/decision-brief'
import { DecisionHeadline } from '@/components/desk/decision-headline'
import { EvidencePanel, EvidenceTabBar, type EvidenceTab } from '@/components/desk/evidence-tabs'
import { FleetMixTable } from '@/components/desk/fleet-mix-table'
import { FracturePanel } from '@/components/desk/fracture-panel'
import { InfeasibilityPanel } from '@/components/desk/infeasibility-panel'
import { LandedCostPanel } from '@/components/desk/landed-cost-panel'
import { PageState } from '@/components/desk/panel'
import { PortChecksTable } from '@/components/desk/port-checks-table'
import { QuoteForm } from '@/components/desk/quote-form'
import { RateForecastTable } from '@/components/desk/rate-forecast-table'
import { ResultsStrip } from '@/components/desk/results-strip'
import { RiskFeed } from '@/components/desk/risk-feed'
import { RouteList } from '@/components/desk/route-list'
import { RouteMap } from '@/components/desk/route-map'
import { QUOTE_PIPELINE, SolveProgress } from '@/components/desk/solve-progress'
import { VerdictBlock } from '@/components/desk/verdict-block'
import { VoyageRemarks } from '@/components/desk/voyage-remarks'
import { VoyageTimeline } from '@/components/desk/voyage-timeline'
import { WalkAwayCurve } from '@/components/desk/walk-away-curve'
import { VoyageAssignmentsTable } from '@/components/desk/voyage-assignments-table'
import { Button } from '@/components/ui/button'
import { anchoragePortForQuotePort } from '@/lib/anchorage-ports'
import { formatIsoShort, formatNumber, prettyPort } from '@/lib/format'
import type {
  ChokepointReference,
  PortListing,
  ProgressStage,
  QuoteEnvelope,
  QuoteRequest,
  QuoteResult,
  VesselInput,
} from '@/lib/types'

interface VoyageDeskPageProps {
  envelope: QuoteEnvelope | null
  ports: PortListing[]
  portsError: string | null
  /** The real last day of market data on disk. Passed straight through to
   *  the quote form -- see quote-form.tsx for what it's used for. */
  latestDate: string | null
  /** 3.4: the static chokepoint reference table (id/name/centre/radius) --
   * joined against `quote.fracture.chokepoints` (band data, no geometry) to
   * place markers on the route map without hardcoding geography here. */
  chokepoints: ChokepointReference[]
  stages: ProgressStage[]
  solving: boolean
  error: string | null
  onSubmit: (req: QuoteRequest) => void
  /** Bumped by the shell whenever something (the top bar's New Quote button)
   *  wants this page to scroll back to its own form. See quote-form.tsx. */
  quoteFormFocus: number
  /** P6: the vessel(s) actually supplied on this quote, for a real backhaul
   * sweep -- QuoteResult never echoes full vessel specs back. */
  vessels: VesselInput[]
}

/** A slot on the desk grid with no panel to put in it. Matches Panel's own
 *  border, radius and hairline so a missing signal reads as a deliberate gap
 *  in the layout rather than as a broken box. */
function EmptyPanel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="h-full rounded-md border border-border bg-surface shadow-panel">
      <div className="panel-state">
        <p className="panel-state-title">{label}</p>
        {hint && <p className="panel-state-hint">{hint}</p>}
      </div>
    </div>
  )
}

/**
 * What was priced, in one line, for the CARGO band's folded state.
 *
 * Reads off the QUOTE, not the form's own live fields, so it always describes
 * the cargo that produced the answer below it rather than whatever someone
 * has since half-typed into a reopened form.
 */
function CargoSummary({
  quote,
  ports,
  vessels,
}: {
  quote: QuoteResult
  ports: PortListing[]
  vessels: VesselInput[]
}) {
  const portName = (c: string) => prettyPort(ports.find((p) => p.code === c)?.name ?? c)
  const bits = [
    `${formatNumber(quote.cargo_volume_dwt)} t ${quote.commodity}`,
    `${portName(quote.origin_port)} → ${portName(quote.dest_port)}`,
    `laycan ${formatIsoShort(quote.laycan_start)} to ${formatIsoShort(quote.laycan_end)}`,
    `${quote.contract_term_days}d term`,
    quote.target_vessel_class,
    vessels.length > 0 ? `${vessels.length} vessel${vessels.length === 1 ? '' : 's'} in hand` : null,
  ].filter((b): b is string => b !== null)

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-body text-foreground">
      {bits.map((b, i) => (
        <span key={b} className="flex items-baseline gap-2">
          {i > 0 && (
            <span aria-hidden="true" className="text-muted-foreground/60">
              ·
            </span>
          )}
          {b}
        </span>
      ))}
      <span className="ml-auto text-micro uppercase tracking-wide text-muted-foreground">
        priced {formatIsoShort(quote.as_of)}
      </span>
    </div>
  )
}

/**
 * The Voyage Desk: one cargo, priced.
 *
 * LAYOUT. This screen is a single sheet of labelled bands, not a grid of
 * cards. Each band carries its name in a left gutter and the bands run in
 * decision order, so the page can be read straight down that gutter:
 *
 *   CARGO     what you asked for  (folds to one line once it is answered)
 *   DECISION  the verdict, as a sentence
 *   RESULTS   every number that decides it, on one row
 *   EVIDENCE  the twelve supporting panels, in five tabs
 *   ROUTE     the globe, and every routing the solver evaluated
 *   REMARKS   what to watch on this specific fixture, as bullets
 *
 * EVIDENCE sits directly under RESULTS rather than at the foot of the page:
 * its first tab is the reasoning behind the verdict, and the two bands above
 * it are the verdict. Keeping "why" adjacent to "what" means a reader who
 * doubts the answer does not have to scroll past the map and the remarks to
 * find the argument for it. ROUTE and REMARKS follow, which costs the old
 * "verdict and its route in one frame" property -- see the note on ROUTE.
 *
 * The previous arrangement put twelve equally-weighted bordered panels in a
 * vertical stack about two thousand pixels tall. Every figure on it was
 * correct, and nothing on screen said which box to read first or that box
 * nine was the evidence for box two -- the reported symptom was exactly
 * that. Nothing has been deleted here: all twelve panels still render, with
 * the same props and the same data, and the five that a reader does not need
 * in order to read the answer moved behind the EVIDENCE tabs, one click away.
 */
export function VoyageDeskPage({
  envelope,
  ports,
  portsError,
  latestDate,
  chokepoints,
  stages,
  solving,
  error,
  onSubmit,
  quoteFormFocus,
  vessels,
}: VoyageDeskPageProps) {
  const [mapFocus, setMapFocus] = useState<string | null>(null)
  // The one artefact designed to leave the screen. See decision-brief.tsx.
  const [briefOpen, setBriefOpen] = useState(false)
  const [cargoOpen, setCargoOpen] = useState(true)
  const [tab, setTab] = useState('decision')
  const answerRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const quote = envelope?.quote ?? null
  const isContingent = envelope?.status === 'contingent_infeasible'
  const rec = quote?.full_recommendation
  const hasAssignments = rec
    ? rec.voyage_assignments.length > 0 ||
      rec.rejected_options.length > 0 ||
      rec.repositioning_actions.length > 0
    : false

  /*
   * Bring the answer to the reader, rather than making them go and find it.
   *
   * Reported directly: with a couple of vessels added, the form is taller
   * than the viewport, so pressing Run quote appeared to do nothing and the
   * result had to be scrolled down to. Two things fix it together, and both
   * are needed. Folding the CARGO band on submit removes the height that
   * caused the problem, and scrolling the answer into view handles the case
   * where the reader was already somewhere else on the page when they
   * re-ran.
   *
   * Fires on the transition, not on the value: keying off `solving` alone
   * would re-scroll on every unrelated re-render that happened to occur
   * while a solve was in flight, which would fight a reader trying to scroll
   * during the wait.
   */
  const prevSolving = useRef(solving)
  useEffect(() => {
    const started = !prevSolving.current && solving
    const finished = prevSolving.current && !solving
    prevSolving.current = solving
    if (!started && !finished) return
    if (started) setCargoOpen(false)
    // After the fold and the state swap have painted, so the target is at its
    // final offset rather than the one it had mid-transition.
    requestAnimationFrame(() => {
      // On a finished quote, go to the top of the sheet rather than to the
      // answer itself: the CARGO band is one line by then, so the top of the
      // page already IS the answer, and stopping there keeps "what was
      // priced" and its Edit button on screen instead of scrolling past
      // them. While solving, the form may still be full height (it does not
      // fold until there is a summary to fold to), so the progress list is
      // the right target.
      const target = finished && quote ? sheetRef.current : answerRef.current
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [solving, quote])

  // "New Quote" from the top bar means "I want to type a new cargo", so the
  // form has to be open for the scroll that QuoteForm itself performs to
  // land on something. 0 is the initial mount and is not a request.
  useEffect(() => {
    if (quoteFormFocus) setCargoOpen(true)
  }, [quoteFormFocus])

  const alerts = quote?.risk_assessment?.alerts ?? []
  const criticalCount = alerts.filter((a) => a.severity === 'critical').length
  const anchoragePort = quote ? anchoragePortForQuotePort(quote.dest_port) : null

  const tabs: readonly EvidenceTab[] = [
    // Named "Why", not "Decision": a tab sharing its name with the DECISION
    // band above made the band look like a summary of the tab rather than the
    // answer itself, and made the tab look like the important thing buried at
    // the bottom of the page. It is the reasoning behind the verdict, and
    // saying so puts the two in the right order.
    { id: 'decision', label: 'Why' },
    { id: 'forecast', label: 'Forecast' },
    { id: 'voyage', label: 'Voyage' },
    { id: 'cost', label: 'Cost' },
    {
      id: 'risk',
      label: 'Risk',
      badge: alerts.length > 0 ? alerts.length : undefined,
      badgeTone: criticalCount > 0 ? 'risk' : 'wait',
    },
  ]

  return (
    <div
      ref={sheetRef}
      className="mx-auto max-w-[1700px] overflow-hidden rounded-lg border border-border bg-surface shadow-panel ring-1 ring-inset ring-(--panel-edge)"
    >
      <CollapsibleBand
        label="Cargo"
        meta={quote && !cargoOpen ? 'priced' : 'what to price'}
        // Before the first quote there is no summary to fold to, so the band
        // stays open and offers no toggle -- a control whose only effect
        // would be to hide the form behind nothing.
        open={cargoOpen || !quote}
        canToggle={quote != null}
        onToggle={() => setCargoOpen((v) => !v)}
        openLabel="Hide"
        closedLabel="Edit"
        summary={
          quote ? <CargoSummary quote={quote} ports={ports} vessels={vessels} /> : undefined
        }
      >
        <QuoteForm
          ports={ports}
          portsError={portsError}
          latestDate={latestDate}
          submitting={solving}
          onSubmit={onSubmit}
          focusToken={quoteFormFocus}
          chromeless
        />
      </CollapsibleBand>

      {/* Everything below is the answer. The scroll target sits here so it
          covers the solving state too -- pressing Run quote should bring the
          progress list into view, not leave the reader staring at a form
          that has apparently done nothing. */}
      <div ref={answerRef}>
        {solving && (
          <Band label="Solving" meta="in progress">
            <div className="h-80">
              <SolveProgress stages={stages} pipeline={QUOTE_PIPELINE} />
            </div>
          </Band>
        )}

        {!solving && error && (
          <Band label="Result" meta="failed">
            <PageState tone="error" title="The last quote failed" hint={error} />
          </Band>
        )}

        {!solving && !error && !envelope && (
          <Band label="Result" meta="nothing yet">
            <PageState
              title="No voyage priced yet"
              hint="Fill in a route, a cargo and a laycan window above, then run the quote."
            />
          </Band>
        )}

        {!solving && envelope?.status === 'structural_infeasible' && (
          <Band label="Blocked" meta="no solution">
            <InfeasibilityPanel problems={envelope.structural_problems} />
          </Band>
        )}

        {!solving && quote && (
          <>
            <Band
              id="decision"
              label="Decision"
              meta={quote.lock_action}
              actions={
                <>
                  {/* A link reproduces the decision live and re-prices it,
                      where the brief freezes it as of now. Both belong on the
                      verdict: the moment someone has an answer is the moment
                      they need to forward it to whoever approves it. */}
                  <CopyLinkButton />
                  <Button size="sm" onClick={() => setBriefOpen(true)}>
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    One-page brief
                  </Button>
                </>
              }
            >
              <DecisionHeadline quote={quote} />
            </Band>

            {briefOpen && (
              <DecisionBrief quote={quote} ports={ports} onClose={() => setBriefOpen(false)} />
            )}

            {isContingent && envelope && (
              <Band label="Relaxed" meta="nearest solution">
                <div className="rounded border border-wait bg-wait-soft px-3 py-2">
                  <div className="flex items-center gap-1 text-lead font-bold uppercase tracking-wide text-wait">
                    <Info className="h-4 w-4" />
                    Your original request had no solution. This is the nearest one that does.
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <div className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                        What blocked it
                      </div>
                      <ul className="mt-0.5 list-inside list-disc text-body text-foreground">
                        {envelope.original_blockers.slice(0, 4).map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                        What was loosened
                      </div>
                      <ul className="mt-0.5 space-y-0.5 text-body text-foreground">
                        {envelope.relaxations_applied.map((r, i) => (
                          <li key={i}>
                            {r.message}
                            <span className="desk-num ml-1 text-caption text-muted-foreground">
                              {r.before} to {r.after}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </Band>
            )}

            <Band id="results" label="Results" meta={`${quote.contract_term_days}d term`}>
              <ResultsStrip quote={quote} />
            </Band>

            <Band id="evidence" label="Evidence" bodyClassName="min-w-0">
              <EvidenceTabBar tabs={tabs} active={tab} onSelect={setTab} />

              <EvidencePanel id="decision" active={tab}>
                <div className="grid grid-cols-1 gap-1 xl:grid-cols-12">
                  <div className="h-95 xl:col-span-5">
                    <VerdictBlock quote={quote} />
                  </div>
                  <div className="h-95 xl:col-span-7">
                    <WalkAwayCurve quote={quote} />
                  </div>
                </div>
              </EvidencePanel>

              <EvidencePanel id="forecast" active={tab}>
                <div className="h-95">
                  <RateForecastTable
                    rows={quote.rate_forecast}
                    todayQuote={quote.today_quote_usd_per_day}
                  />
                </div>
              </EvidencePanel>

              <EvidencePanel id="voyage" active={tab}>
                <div className="flex flex-col gap-1">
                  <div className="h-64">
                    <VoyageTimeline quote={quote} ports={ports} />
                  </div>
                  <div className="grid grid-cols-1 gap-1 xl:grid-cols-12">
                    <div className="h-60 xl:col-span-6">
                      {quote.fleet_mix ? (
                        <FleetMixTable
                          frontier={quote.fleet_mix}
                          explanation={quote.explanations.fleet_mix}
                        />
                      ) : (
                        <EmptyPanel
                          label="No fleet-mix frontier"
                          hint="The optimizer found no alternative split of this cargo across vessel classes to compare."
                        />
                      )}
                    </div>
                    <div className="h-60 xl:col-span-3">
                      <PortChecksTable
                        origin={quote.origin_port_check}
                        dest={quote.dest_port_check}
                        ports={ports}
                      />
                    </div>
                    <div className="h-60 xl:col-span-3">
                      {hasAssignments && rec ? (
                        <VoyageAssignmentsTable
                          rec={rec}
                          ports={ports}
                          assignmentExplanations={quote.explanations.voyage_assignments}
                          repositioningExplanations={quote.explanations.repositioning}
                        />
                      ) : (
                        <EmptyPanel
                          label="Nothing scheduled"
                          hint="Add a vessel and a cargo revenue figure to the quote form, and the optimizer will assign and sequence it here."
                        />
                      )}
                    </div>
                  </div>
                </div>
              </EvidencePanel>

              <EvidencePanel id="cost" active={tab}>
                <div className="grid grid-cols-1 gap-1 xl:grid-cols-12">
                  <div className="h-100 xl:col-span-6">
                    <LandedCostPanel
                      breakdown={envelope?.landed_cost ?? null}
                      destPort={quote.dest_port}
                      cargoVolumeMt={quote.cargo_volume_dwt}
                      freightUsdPerDay={quote.today_quote_usd_per_day}
                      voyageDays={quote.assumed_transit_days}
                      vesselClass={quote.target_vessel_class}
                    />
                  </div>
                  <div className="h-100 xl:col-span-6">
                    <BackhaulPanel vessel={vessels[0]} dischargePort={quote.dest_port} />
                  </div>
                </div>
              </EvidencePanel>

              <EvidencePanel id="risk" active={tab}>
                <div className="flex flex-col gap-1">
                  {/* Content-sized rather than a fixed row height: the feed is
                      two lines on a calm day and a dozen on a bad one, and a
                      fixed box means either dead space or a scrollbar. Panel's
                      own `h-full` resolves to auto inside an auto-height
                      parent, so it simply takes the height of its rows. */}
                  <div className="min-h-40">
                    {quote.risk_assessment ? (
                      <RiskFeed assessment={quote.risk_assessment} />
                    ) : (
                      <EmptyPanel
                        label="No risk data for this date"
                        hint="The risk feed reads from harvested files on disk. Nothing covers this charter date yet."
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-1 xl:grid-cols-12">
                    <div className={anchoragePort ? 'h-52.5 xl:col-span-4' : 'h-52.5 xl:col-span-6'}>
                      <CIIPanel emissions={quote.emissions} />
                    </div>
                    <div className={anchoragePort ? 'h-52.5 xl:col-span-4' : 'h-52.5 xl:col-span-6'}>
                      <FracturePanel fracture={quote.fracture} />
                    </div>
                    {/* F-51: keys on the DESTINATION port only, not the
                        origin -- discharge-side congestion is what actually
                        matters for a chartering decision (how fast the vessel
                        gets off demurrage at the far end). */}
                    {anchoragePort && (
                      <div className="h-52.5 xl:col-span-4">
                        <AnchoragePanel port={anchoragePort} />
                      </div>
                    )}
                  </div>
                </div>
              </EvidencePanel>
            </Band>

            {/* ROUTE now sits below EVIDENCE rather than directly under the
                verdict. That is a real trade: the map was placed high on
                purpose, so that a screenshot of the top of the page showed the
                verdict and the route it was for in one frame, and it no longer
                does. The reasoning is now the thing adjacent to the answer
                instead, which is the more common question ("why does it say
                wait?" before "which way does it sail?"). Worth revisiting if
                the map turns out to be what people actually reach for first. */}
            <Band id="route" label="Route" meta={`${quote.route_exploration.length} evaluated`}>
              <div className="grid grid-cols-1 gap-1 xl:grid-cols-12">
                <div className="h-110 xl:col-span-8">
                  <RouteMap
                    routes={quote.route_exploration}
                    ports={ports}
                    chokepoints={chokepoints}
                    fracture={quote.fracture}
                    focusId={mapFocus}
                    onFocus={setMapFocus}
                  />
                </div>
                <div className="h-110 xl:col-span-4">
                  <RouteList
                    routes={quote.route_exploration}
                    focusId={mapFocus}
                    onFocus={setMapFocus}
                  />
                </div>
              </div>
            </Band>

            <Band
              id="remarks"
              label="Remarks"
              meta={alerts.length > 0 ? `${alerts.length} flagged` : 'all clear'}
            >
              <VoyageRemarks quote={quote} ports={ports} />
            </Band>
          </>
        )}
      </div>
    </div>
  )
}
