import { Info } from 'lucide-react'
import { useState } from 'react'
import { BackhaulPanel } from '@/components/desk/backhaul-panel'
import { AnchoragePanel } from '@/components/desk/anchorage-panel'
import { CIIPanel } from '@/components/desk/cii-panel'
import { DecisionBrief } from '@/components/desk/decision-brief'
import { DecisionHeadline } from '@/components/desk/decision-headline'
import { FleetMixTable } from '@/components/desk/fleet-mix-table'
import { FracturePanel } from '@/components/desk/fracture-panel'
import { InfeasibilityPanel } from '@/components/desk/infeasibility-panel'
import { LandedCostPanel } from '@/components/desk/landed-cost-panel'
import { PageState } from '@/components/desk/panel'
import { PortChecksTable } from '@/components/desk/port-checks-table'
import { QuoteForm } from '@/components/desk/quote-form'
import { RateForecastTable } from '@/components/desk/rate-forecast-table'
import { RiskFeed } from '@/components/desk/risk-feed'
import { RouteList } from '@/components/desk/route-list'
import { RouteMap } from '@/components/desk/route-map'
import { QUOTE_PIPELINE, SolveProgress } from '@/components/desk/solve-progress'
import { VerdictBlock } from '@/components/desk/verdict-block'
import { VoyageTimeline } from '@/components/desk/voyage-timeline'
import { WalkAwayCurve } from '@/components/desk/walk-away-curve'
import { VoyageAssignmentsTable } from '@/components/desk/voyage-assignments-table'
import { anchoragePortForQuotePort } from '@/lib/anchorage-ports'
import type {
  ChokepointReference,
  PortListing,
  ProgressStage,
  QuoteEnvelope,
  QuoteRequest,
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
 * The Voyage Desk: one cargo, priced.
 *
 * The form at the top is permanent -- it is never a drawer that opens and
 * closes and takes the cargo you typed with it. See quote-form.tsx for why.
 * Everything below it is one of four states: solving, failed, nothing run
 * yet, or a real result -- exactly one of these renders at a time, and the
 * form above never moves while they swap.
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

  const quote = envelope?.quote ?? null
  const isContingent = envelope?.status === 'contingent_infeasible'
  const rec = quote?.full_recommendation
  const hasAssignments = rec
    ? rec.voyage_assignments.length > 0 ||
      rec.rejected_options.length > 0 ||
      rec.repositioning_actions.length > 0
    : false

  return (
    <div className="flex flex-col gap-2">
      <QuoteForm
        ports={ports}
        portsError={portsError}
        latestDate={latestDate}
        submitting={solving}
        onSubmit={onSubmit}
        focusToken={quoteFormFocus}
      />

      {solving && (
        <div className="h-80">
          <SolveProgress stages={stages} pipeline={QUOTE_PIPELINE} />
        </div>
      )}

      {!solving && error && <PageState tone="error" title="The last quote failed" hint={error} />}

      {!solving && !error && !envelope && (
        <PageState
          title="No voyage priced yet"
          hint="Fill in a route, a cargo and a laycan window above, then run the quote."
        />
      )}

      {!solving && envelope?.status === 'structural_infeasible' && (
        <InfeasibilityPanel problems={envelope.structural_problems} />
      )}

      {!solving && quote && (
        <>
          {/* The answer, as a sentence, before any panel. The desk was
              twelve boxes of equal weight, every figure correct and none of
              them saying what to DO -- a reader had to assemble the
              verdict, the gap to the walk-away line and the entry window
              out of four separate panels before the screen meant anything.
              Copy link and One-page brief live inside the headline itself,
              sharing its top row with the route breadcrumb. */}
          <DecisionHeadline quote={quote} ports={ports} onOpenBrief={() => setBriefOpen(true)} />

          {briefOpen && (
            <DecisionBrief quote={quote} ports={ports} onClose={() => setBriefOpen(false)} />
          )}

          {isContingent && envelope && (
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
          )}

          {/*
            Desk layout, grouped by what each row actually answers rather than
            the order features were built in.

            1. THE DECISION   -- verdict, forecast, risk. The headline answer.
            2. THE ROUTE       -- map + list. Deliberately right under the
                                  decision (not at the foot of the page) so the
                                  verdict and the route it's for are both on
                                  screen together without scrolling.
            3. FIT & SCHEDULE  -- fleet mix, port constraints, assignments.
            4. COMMERCIAL      -- landed cost, backhaul.
            5. EXPOSURE        -- carbon rating, chokepoint fracture, satellite
                                  census -- three independent real-world signals
                                  about this specific voyage, grouped together
                                  on purpose.
          */}

          {/* 1. The Decision.
              Heights here are MEASURED, not guessed -- each panel's real
              rendered content height was read out of the running app against a
              real quote, and the container sized just above it. */}
          <div className="grid grid-cols-1 gap-1 xl:grid-cols-12">
            <div className="h-95 xl:col-span-4">
              <VerdictBlock quote={quote} />
            </div>
            <div className="h-95 xl:col-span-4">
              <RateForecastTable rows={quote.rate_forecast} todayQuote={quote.today_quote_usd_per_day} />
            </div>
            <div className="h-95 xl:col-span-4">
              {quote.risk_assessment ? (
                <RiskFeed assessment={quote.risk_assessment} />
              ) : (
                <EmptyPanel
                  label="No risk data for this date"
                  hint="The risk feed reads from harvested files on disk. Nothing covers this charter date yet."
                />
              )}
            </div>
          </div>

          {/* 1b. Why that verdict. Full width because 90 points need it to be
              readable, and because the shape of the line -- where it troughs,
              how far today sits above it -- is the single most informative
              object on the page once you can actually see it. */}
          <div className="h-84">
            <WalkAwayCurve quote={quote} />
          </div>

          {/* 2. The Route -- the map is the wider of the two on purpose: it's
              the single most immediately legible panel on the desk, and sitting
              right under the decision means a screenshot of the page's top
              shows the verdict and the route it's for in one frame. */}
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
              <RouteList routes={quote.route_exploration} focusId={mapFocus} onFocus={setMapFocus} />
            </div>
          </div>

          {/* The timeline goes directly under the route because the two answer
              halves of the same question -- the map says which way, this says how
              long and when. Every figure in it was already on the desk as a bare
              number in a different panel. */}
          <div className="h-64">
            <VoyageTimeline quote={quote} ports={ports} />
          </div>

          {/* 3. Fit & Schedule -- measured at ~151px (fleet mix) and ~165px
              (port constraints) of real content. */}
          <div className="grid grid-cols-1 gap-1 xl:grid-cols-12">
            <div className="h-60 xl:col-span-6">
              {quote.fleet_mix ? (
                <FleetMixTable frontier={quote.fleet_mix} explanation={quote.explanations.fleet_mix} />
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

          {/* 4. Commercial. */}
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

          {/* 5. Exposure -- carbon rating and chokepoint fracture are always
              shown; the satellite census joins them only when this quote's
              route actually touches one of Sentinel-1's five covered ports
              (dest preferred -- a discharge-side anchorage is the more common
              real case for this network's own shape). */}
          {(() => {
            // F-51 fix: keys on the DESTINATION port only, not the origin --
            // discharge-side congestion is what actually matters for a
            // chartering decision (how fast the vessel gets off demurrage
            // at the far end).
            const anchoragePort = anchoragePortForQuotePort(quote.dest_port)
            const span = anchoragePort ? 'xl:col-span-4' : 'xl:col-span-6'
            return (
              <div className="grid grid-cols-1 gap-1 xl:grid-cols-12">
                <div className={`h-52.5 ${span}`}>
                  <CIIPanel emissions={quote.emissions} />
                </div>
                <div className={`h-52.5 ${span}`}>
                  <FracturePanel fracture={quote.fracture} />
                </div>
                {anchoragePort && (
                  <div className={`h-52.5 ${span}`}>
                    <AnchoragePanel port={anchoragePort} />
                  </div>
                )}
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
