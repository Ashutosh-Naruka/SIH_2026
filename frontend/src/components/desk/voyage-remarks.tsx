import { useState } from 'react'
import { Tooltip } from '@/components/ui/tooltip'
import { prettyPort } from '@/lib/format'
import type { PortListing, QuoteResult } from '@/lib/types'
import { cn } from '@/lib/utils'

type Tone = 'risk' | 'wait' | 'market' | 'muted'

interface Remark {
  key: string
  /** The one-line form. Written about THIS voyage, in the second person where
   *  it asks for an action. Kept short enough not to wrap at desk width. */
  text: string
  /** The full sentence, on hover, when `text` is a shortened form of it. */
  full?: string
  /** Right-aligned subject: which port, which strait, which vessel class. */
  subject?: string
  tone: Tone
}

/**
 * What is worth knowing about this particular voyage, as bullets.
 *
 * The desk already computed every one of these, and every one of them was
 * already on screen somewhere: risk alerts in one panel, the weather buffer
 * inside a caveat list in a second, the class-benchmark caveat in a footnote
 * under a third, congestion inside a table in a fourth, the re-check trigger
 * at the bottom of a fifth. A reader who wanted "so what should I actually
 * watch on this fixture" had to visit five panels and do the filtering
 * themselves.
 *
 * These are deliberately statements about the reader's cargo, not about the
 * desk's capabilities: "Paradip is congested, expect 3.4 days alongside", not
 * "the port congestion module monitors berth queues". Anything that reads as
 * a description of a feature does not belong here.
 *
 * Nothing is invented and nothing is hidden: the full text of every shortened
 * line is on hover, the panels these are drawn from are all still on the page
 * under Evidence, and when there is genuinely nothing to flag this says so
 * rather than rendering an empty box.
 */
export function VoyageRemarks({
  quote,
  ports,
}: {
  quote: QuoteResult
  ports: PortListing[]
}) {
  const [showAll, setShowAll] = useState(false)
  const portName = (c: string) => prettyPort(ports.find((p) => p.code === c)?.name ?? c)
  const remarks: Remark[] = []

  // 1. Real disruption signals, worst first. These are the reason the risk
  //    feed exists; the feed itself keeps the metric/threshold detail.
  const alerts = [...(quote.risk_assessment?.alerts ?? [])].sort((a, b) => {
    const rank = { critical: 0, warning: 1, info: 2 } as const
    return rank[a.severity] - rank[b.severity]
  })
  for (const a of alerts) {
    remarks.push({
      key: `alert-${a.category}-${a.subject}`,
      text: firstSentence(a.message),
      full: a.message,
      subject: a.subject,
      tone: a.severity === 'critical' ? 'risk' : a.severity === 'warning' ? 'wait' : 'market',
    })
  }

  // 2. Weather delay actually priced into the verdict above.
  const buffer = quote.transit_buffer
  if (buffer != null && buffer.expected_delay_days > 0) {
    remarks.push({
      key: 'weather',
      text: `Allow ${buffer.expected_delay_days.toFixed(1)} extra day(s) for weather; already priced into the verdict.`,
      full: buffer.explanation,
      subject: buffer.basins.join(', ').replace(/_/g, ' ').toLowerCase(),
      tone: 'wait',
    })
  }

  // 3. The rate is a class benchmark, not a rate for this lane. This is the
  //    single most important caveat on the whole quote when it applies:
  //    it means two different origins can return the same number.
  if (quote.route_evidence === 'ROUTE_RATE_BASIS_UNAVAILABLE') {
    remarks.push({
      key: 'route-basis',
      text: 'Rate is the vessel-class benchmark, not a published rate for this lane. Use it to time the market, not to choose between load ports.',
      subject: quote.target_vessel_class,
      tone: 'market',
    })
  }

  // 4. Congestion at either end, which is waiting time the charterer pays for.
  for (const [check, label] of [
    [quote.origin_port_check, 'load'],
    [quote.dest_port_check, 'discharge'],
  ] as const) {
    if (check.congestion_label === 'HIGH') {
      remarks.push({
        key: `congestion-${check.port}`,
        text: `${portName(check.port)} is congested at the ${label} end: expect about ${check.expected_wait_days.toFixed(1)} days waiting.`,
        full: check.wait_days_is_real_data
          ? `From ${check.empirical_wait_sample_n} real recorded port calls.`
          : 'No real recorded wait sample for this port; this is a modelled figure.',
        subject: portName(check.port),
        tone: 'wait',
      })
    }
  }

  // 5. Chokepoints the routing actually crosses that are not calm.
  for (const cp of quote.fracture?.chokepoints ?? []) {
    if (cp.band === 'elevated' || cp.band === 'critical') {
      remarks.push({
        key: `fracture-${cp.chokepoint_id}`,
        text: `${cp.chokepoint_name} is ${cp.band} (${Math.round(cp.index)}/100) on this routing.`,
        full: cp.explanation,
        subject: cp.chokepoint_name,
        tone: cp.band === 'critical' ? 'risk' : 'wait',
      })
    }
  }

  // 6. When to look at this again. Always last, always present: it is the one
  //    remark that is about what the reader does next rather than what is
  //    already true.
  const trigger = quote.full_recommendation.review_trigger
  remarks.push({
    key: 'recheck',
    text: `Re-check ${trigger.schedule.toLowerCase()}, or sooner if ${firstSentence(trigger.conditions[0] ?? 'the market moves')}`,
    full: trigger.conditions.join(' | '),
    tone: 'muted',
  })

  const LIMIT = 4
  const hidden = Math.max(0, remarks.length - LIMIT)
  const shown = showAll ? remarks : remarks.slice(0, LIMIT)

  return (
    <div>
      <ul className="space-y-0.5">
        {shown.map((r) => (
          <RemarkRow key={r.key} remark={r} />
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-1 text-caption font-semibold uppercase tracking-wide text-primary hover:underline"
        >
          {showAll ? 'Show fewer' : `${hidden} more`}
        </button>
      )}
    </div>
  )
}

const DOT: Record<Tone, string> = {
  risk: 'bg-risk',
  wait: 'bg-wait',
  market: 'bg-market',
  muted: 'bg-muted-foreground/50',
}

function RemarkRow({ remark }: { remark: Remark }) {
  // Only offer a tooltip when there is genuinely more to read than the row
  // already shows -- one that repeats the visible line teaches the reader that
  // hovering here is not worth doing. The Tooltip anchors itself in a <span>,
  // so it goes INSIDE the <li> rather than around it: wrapping the list item
  // would put a <div> between <ul> and <li>, which is invalid markup and
  // breaks list semantics for a screen reader.
  const hasMore = Boolean(remark.full) && remark.full !== remark.text
  // The Tooltip's own anchor is `inline-flex`, where `truncate` does not
  // apply (text-overflow needs a block container), so the ellipsis lives on
  // an inner block span and the anchor only carries the flex sizing.
  const textCls = 'block w-full truncate text-body leading-relaxed text-foreground'
  return (
    <li className="flex items-baseline gap-2 py-0.5">
      <span
        className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', DOT[remark.tone])}
        aria-hidden="true"
      />
      {hasMore ? (
        <Tooltip content={remark.full} className="min-w-0 flex-1">
          <span className={textCls}>{remark.text}</span>
        </Tooltip>
      ) : (
        <span className={cn(textCls, 'min-w-0 flex-1')}>{remark.text}</span>
      )}
      {remark.subject && (
        <span className="shrink-0 text-micro uppercase tracking-wide text-muted-foreground">
          {remark.subject}
        </span>
      )}
    </li>
  )
}

/** The first sentence of a backend message, for the one-line form. The full
 *  string stays available on hover, so nothing is lost by shortening here. */
function firstSentence(s: string): string {
  const trimmed = s.trim()
  const m = trimmed.match(/^(.{0,110}?[.!?])(\s|$)/)
  if (m) return m[1]
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed
}
