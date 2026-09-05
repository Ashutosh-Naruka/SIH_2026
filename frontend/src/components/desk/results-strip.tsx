import type { ReactNode } from 'react'
import { Figure, FigureGroup } from '@/components/desk/figure'
import { Tooltip } from '@/components/ui/tooltip'
import { addDays, formatShortDate } from '@/lib/format'
import type { QuoteResult } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Every number that decides this charter, on one line.
 *
 * The eight figures here were already on the desk before this component
 * existed, but spread across four panels and roughly two thousand pixels of
 * scrolling: today's rate was in the verdict block, the walk-away line in the
 * curve's footer, the gap only stated in prose, the entry window in a third
 * panel and the alert count in a fourth. Reading "where does this quote
 * stand" meant assembling it from four places and remembering the first by
 * the time you reached the last.
 *
 * One strip, read left to right, in decision order: what it costs today, what
 * it is worth, the difference between those two, what that difference is
 * worth over the term, how sure the model is, when to act, how long the
 * voyage runs, and how many things are flagged against it.
 *
 * Nothing here is new or recomputed. Each cell reads the same field the
 * detail panel below it reads, so a figure can never disagree with its own
 * evidence -- the gap in particular is `today - ceiling`, the same
 * subtraction the walk-away panel does, keyed off the same weather-adjusted
 * `ceiling_usd_per_day` the solver actually tested against rather than the
 * raw model boundary.
 */
export function ResultsStrip({ quote }: { quote: QuoteResult }) {
  const isLock = quote.lock_action === 'LOCK'
  const gap = quote.today_quote_usd_per_day - quote.ceiling_usd_per_day
  const above = gap > 0

  const start = quote.optimal_entry_window_start_day
  const end = quote.optimal_entry_window_end_day
  const hasWindow = start != null && end != null

  const edge = quote.expected_savings_usd_total
  const alerts = quote.risk_assessment?.alerts ?? []
  const critical = alerts.filter((a) => a.severity === 'critical').length
  const warnings = alerts.filter((a) => a.severity === 'warning').length

  const buffer = quote.transit_buffer?.expected_delay_days ?? 0

  return (
    <FigureGroup>
      <div className="grid grid-cols-2 divide-x divide-y divide-border/70 border border-border/70 sm:grid-cols-4 xl:grid-cols-8 xl:divide-y-0">
        <Cell
          label="Today"
          hint="The market rate this cargo would fix at today, for its vessel class and term."
          value={<Figure value={quote.today_quote_usd_per_day} kind="usd" />}
          sub="per day"
        />
        <Cell
          label="Walk-away"
          hint="The highest rate at which locking still beats waiting, weather buffer included. Above this line, fixing loses money on paper."
          value={<Figure value={quote.ceiling_usd_per_day} kind="usd" />}
          sub="per day"
        />
        <Cell
          label={above ? 'Above line' : 'Below line'}
          hint="How far today's rate sits from the walk-away line. This is the gap that has to close before locking becomes correct."
          value={<Figure value={Math.abs(gap)} kind="usd" />}
          sub="per day"
          tone={above ? 'wait' : 'go'}
        />
        <Cell
          label={edge > 0 ? 'Expected edge' : 'Expected cost'}
          hint="What the recommended action is expected to be worth across the whole contract term, against always taking today's spot rate."
          value={<Figure value={Math.abs(edge)} kind="usdCompact" />}
          sub={`over ${quote.contract_term_days}d`}
          tone={edge > 0 ? 'go' : 'risk'}
        />
        <Cell
          label="Confidence"
          hint="The share of simulated market paths in which the recommended action beats spot. Always at least 50% by construction, since the model recommends whichever side wins."
          value={<Figure value={quote.prob_savings_positive} kind="percent" digits={0} />}
          sub="beats spot"
        />
        <Cell
          label="Best entry"
          hint="The window in which the model expects the cheapest fixture. Absent when the forecast has no clear trough inside the horizon."
          value={
            hasWindow ? (
              <span className="text-body">
                {formatShortDate(addDays(quote.as_of, start))}
                <span className="text-muted-foreground"> to </span>
                {formatShortDate(addDays(quote.as_of, end))}
              </span>
            ) : (
              <span className="text-body text-muted-foreground">no clear trough</span>
            )
          }
          sub={isLock ? 'fix now' : 'hold until'}
        />
        <Cell
          label="Transit"
          hint="Sea days for the chosen routing, plus any weather delay the model priced into the decision."
          value={
            quote.assumed_transit_days != null ? (
              <Figure value={quote.assumed_transit_days} kind="number" digits={1} />
            ) : (
              <span className="text-body text-muted-foreground">n/a</span>
            )
          }
          sub={buffer > 0 ? `+${buffer.toFixed(1)}d weather` : 'days at sea'}
        />
        <Cell
          label="Flagged"
          hint="Disruption signals raised against this specific voyage: rate regime, port congestion, chokepoint transits and cyclone climatology."
          value={
            <span className={cn('text-figure', alerts.length === 0 && 'text-go')}>
              {alerts.length}
            </span>
          }
          sub={
            alerts.length === 0
              ? 'all clear'
              : critical > 0
                ? `${critical} critical`
                : `${warnings} warning${warnings === 1 ? '' : 's'}`
          }
          tone={critical > 0 ? 'risk' : warnings > 0 ? 'wait' : undefined}
        />
      </div>
    </FigureGroup>
  )
}

/**
 * One figure in the strip: name above, value below, unit under that.
 *
 * The label carries the explanation on hover rather than an ⓘ of its own. A
 * row of eight cells each with its own info icon is sixteen glyphs competing
 * with the eight numbers they annotate, which is the density problem this
 * strip exists to solve, restated one level down.
 */
function Cell({
  label,
  hint,
  value,
  sub,
  tone,
}: {
  label: string
  hint: string
  value: ReactNode
  sub: string
  tone?: 'go' | 'wait' | 'risk'
}) {
  return (
    <div className="min-w-0 px-2 py-1.5">
      <Tooltip content={hint}>
        <span className="cursor-help text-micro font-semibold uppercase tracking-wide text-muted-foreground decoration-dotted underline-offset-2 hover:underline">
          {label}
        </span>
      </Tooltip>
      <div
        className={cn(
          'desk-num mt-0.5 truncate text-figure font-bold leading-none',
          tone === 'go'
            ? 'text-go'
            : tone === 'wait'
              ? 'text-wait'
              : tone === 'risk'
                ? 'text-risk'
                : 'text-foreground',
        )}
      >
        {value}
      </div>
      <div className="mt-1 truncate text-micro text-muted-foreground">{sub}</div>
    </div>
  )
}
