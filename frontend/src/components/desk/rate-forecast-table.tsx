import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useId } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { DURATION, drawPath, transition } from '@/lib/motion'
import { Panel } from '@/components/desk/panel'
import { Badge } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/tooltip'
import { PERCENTILE } from '@/lib/vocabulary'
import { useElementSize } from '@/hooks/use-element-size'
import { formatNumber } from '@/lib/format'
import type { RateHorizon, RouteEvidence } from '@/lib/types'

const ROUTE_EVIDENCE_LABEL: Record<RouteEvidence, string> = {
  OBSERVED: 'Route-validated',
  MODELLED: 'Route-modelled (thin evidence)',
  ROUTE_RATE_BASIS_UNAVAILABLE: 'Class-only',
}

function RouteEvidenceBadge({ evidence }: { evidence: RouteEvidence }) {
  return (
    <Tooltip
      content={
        evidence === 'ROUTE_RATE_BASIS_UNAVAILABLE'
          ? 'No real route-level rate evidence clears the bar for this origin, so this is priced on the class benchmark rather than on this specific route.'
          : evidence === 'MODELLED'
            ? 'Real route-level rate evidence exists for this origin but is a thin sample, so the adjustment is modelled and carries a wide uncertainty.'
            : 'Enough real route-level rate observations exist for this origin to validate the adjustment against the class benchmark.'
      }
    >
      <Badge variant={evidence === 'OBSERVED' ? 'secondary' : 'outline'} className="text-micro">
        {ROUTE_EVIDENCE_LABEL[evidence]}
      </Badge>
    </Tooltip>
  )
}

function Direction({ dir }: { dir: RateHorizon['direction'] }) {
  if (dir === 'up') return <TrendingUp className="h-3.5 w-3.5 text-risk" />
  if (dir === 'down') return <TrendingDown className="h-3.5 w-3.5 text-go" />
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />
}

interface Point {
  x: number
  y: number
}

/**
 * Tangents for a monotone cubic (Fritsch-Carlson) Hermite spline: the same
 * curve family d3's `curveMonotoneX` uses. The forecast only has 3 real
 * anchor points (7d/30d/90d) -- there is no model output for the days between
 * them, so a curve here is strictly a rendering choice, not new data. Plain
 * Catmull-Rom or natural-cubic splines can overshoot past an anchor's
 * neighbours and imply a bounce that never happened; monotone Hermite is
 * built specifically to never over/undershoot between consecutive points,
 * which is why it is the standard choice for smoothing real, sparse
 * financial series.
 */
function monotoneTangents(pts: Point[]): number[] {
  const n = pts.length
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) {
    d.push((pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x))
  }
  const m: number[] = new Array(n)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) {
    m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
  }
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * d[i]
      m[i + 1] = t * b * d[i]
    }
  }
  return m
}

function monotoneSegments(pts: Point[]) {
  const m = monotoneTangents(pts)
  return pts.slice(0, -1).map((p0, i) => {
    const p1 = pts[i + 1]
    const dx = (p1.x - p0.x) / 3
    return {
      p0,
      p1,
      cp1: { x: p0.x + dx, y: p0.y + m[i] * dx },
      cp2: { x: p1.x - dx, y: p1.y - m[i + 1] * dx },
    }
  })
}

const fmt = (n: number) => n.toFixed(1)

function monotonePath(pts: Point[]): string {
  if (pts.length < 2) return pts.length === 1 ? `M${fmt(pts[0].x)} ${fmt(pts[0].y)}` : ''
  let d = `M${fmt(pts[0].x)} ${fmt(pts[0].y)}`
  for (const s of monotoneSegments(pts)) {
    d += ` C${fmt(s.cp1.x)} ${fmt(s.cp1.y)} ${fmt(s.cp2.x)} ${fmt(s.cp2.y)} ${fmt(s.p1.x)} ${fmt(s.p1.y)}`
  }
  return d
}

/** Closed ribbon between two monotone curves sharing the same x positions. */
function monotoneBandPath(topPts: Point[], bottomPts: Point[]): string {
  if (topPts.length === 0) return ''
  if (topPts.length === 1) {
    return `M${fmt(topPts[0].x)} ${fmt(topPts[0].y)} L${fmt(bottomPts[0].x)} ${fmt(bottomPts[0].y)} Z`
  }
  let d = `M${fmt(topPts[0].x)} ${fmt(topPts[0].y)}`
  for (const s of monotoneSegments(topPts)) {
    d += ` C${fmt(s.cp1.x)} ${fmt(s.cp1.y)} ${fmt(s.cp2.x)} ${fmt(s.cp2.y)} ${fmt(s.p1.x)} ${fmt(s.p1.y)}`
  }
  const bottomSegs = monotoneSegments(bottomPts)
  const lastBottom = bottomPts[bottomPts.length - 1]
  d += ` L${fmt(lastBottom.x)} ${fmt(lastBottom.y)}`
  for (let i = bottomSegs.length - 1; i >= 0; i--) {
    const s = bottomSegs[i]
    d += ` C${fmt(s.cp2.x)} ${fmt(s.cp2.y)} ${fmt(s.cp1.x)} ${fmt(s.cp1.y)} ${fmt(s.p0.x)} ${fmt(s.p0.y)}`
  }
  return `${d} Z`
}

// Aspect ratio is capped rather than fixed: a wide panel used to stretch this
// chart to ~9:1 (116px tall against a 1000px+ panel), which read as a thin
// strip rather than a chart. Height now scales with width, within a band
// that keeps it chart-shaped at both a narrow and a wide panel.
const PAD = { t: 18, r: 20, b: 24, l: 56 }

function FanChart({ rows, todayQuote }: { rows: RateHorizon[]; todayQuote: number }) {
  const [box, ref] = useElementSize<HTMLDivElement>()
  const reduced = useReducedMotion()
  const gradientId = useId()
  const w = Math.max(box.width, 240)
  const H = Math.min(220, Math.max(160, Math.round(w * 0.26)))

  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => a.horizon_days - b.horizon_days)

  // Identifies THIS dataset. Used as the motion key so the draw-in replays
  // only when a genuinely new forecast arrives -- not on every re-render, and
  // not when the container merely resizes.
  const signature = sorted.map((r) => `${r.horizon_days}:${Math.round(r.p50_usd_per_day)}`).join('|')

  const lo = Math.min(todayQuote, ...sorted.map((r) => r.p10_usd_per_day))
  const hi = Math.max(todayQuote, ...sorted.map((r) => r.p90_usd_per_day))
  const span = hi - lo || 1
  const yMin = lo - span * 0.12
  const yMax = hi + span * 0.12

  const maxDay = sorted[sorted.length - 1].horizon_days
  const x = (day: number) =>
    PAD.l + (Math.sqrt(day) / Math.sqrt(maxDay)) * (w - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b)

  // Four evenly spaced horizontal gridlines (incl. top/bottom) instead of
  // just the two bound labels -- a bare min/max reads as a placeholder axis,
  // a repeated tick spacing reads as an intentional one.
  const yTicks = Array.from({ length: 4 }, (_, i) => yMin + ((yMax - yMin) * i) / 3)

  const p90Points = sorted.map((r) => ({ x: x(r.horizon_days), y: y(r.p90_usd_per_day) }))
  const p50Points = sorted.map((r) => ({ x: x(r.horizon_days), y: y(r.p50_usd_per_day) }))
  const p10Points = sorted.map((r) => ({ x: x(r.horizon_days), y: y(r.p10_usd_per_day) }))

  const band = monotoneBandPath(p90Points, p10Points)
  const p50Line = monotonePath(p50Points)

  const yToday = y(todayQuote)

  return (
    <div ref={ref} className="w-full">
      <svg width={w} height={H} className="block">
        <defs>
          <linearGradient id={`fanBandFill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--market)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--market)" stopOpacity={0.06} />
          </linearGradient>
        </defs>

        {/* plot-area frame: a faint tint plus a hairline border turns the
            chart into a bounded card rather than lines floating on the panel
            background -- the same cue Panel itself uses one level up. */}
        <rect
          x={PAD.l}
          y={PAD.t}
          width={w - PAD.l - PAD.r}
          height={H - PAD.t - PAD.b}
          fill="var(--surface-2)"
          fillOpacity={0.4}
          stroke="var(--border)"
          strokeWidth={1}
        />

        {/* horizontal gridlines + value ticks */}
        {yTicks.map((t, i) => (
          <g key={`ytick-${i}`}>
            <line
              x1={PAD.l}
              x2={w - PAD.r}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--border)"
              strokeWidth={1}
              opacity={0.6}
            />
            <text
              x={PAD.l - 8}
              y={y(t) + 3}
              textAnchor="end"
              className="fill-muted-foreground text-micro"
            >
              ${formatNumber(Math.round(t / 100) * 100)}
            </text>
          </g>
        ))}

        {/* vertical guides at each observed horizon */}
        {sorted.map((r) => (
          <line
            key={`xtick-${r.horizon_days}`}
            x1={x(r.horizon_days)}
            x2={x(r.horizon_days)}
            y1={PAD.t}
            y2={H - PAD.b}
            stroke="var(--border)"
            strokeWidth={1}
            opacity={0.35}
          />
        ))}

        {/* today's quote reference */}
        <line
          x1={PAD.l}
          x2={w - PAD.r}
          y1={yToday}
          y2={yToday}
          stroke="var(--foreground)"
          strokeWidth={1.25}
          strokeDasharray="3 3"
          opacity={0.6}
        />
        <text x={PAD.l - 8} y={yToday + 3} textAnchor="end" className="fill-muted-foreground text-micro font-medium">
          today
        </text>

        {/*
          The fan draws itself in when a quote lands: the uncertainty band
          fades up from nothing, then the expected-case line traces left to
          right. `key` is the dataset signature, so the animation replays when
          a NEW forecast arrives and not on every re-render -- an unkeyed
          motion element re-runs on each parent render, which turns a chart
          into a strobe as soon as anything else on the page changes.

          `opacity` is expressed only in the variant, never alongside a `style`
          -- see the note on fadeBand in lib/motion for why.
        */}
        <motion.path
          key={`band-${signature}`}
          d={band}
          fill={`url(#fanBandFill-${gradientId})`}
          stroke="var(--market)"
          strokeOpacity={0.25}
          strokeWidth={1}
          initial={reduced ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={reduced ? { duration: 0 } : { ...transition.slow, delay: 0.05 }}
        />
        <motion.path
          key={`p50-${signature}`}
          d={p50Line}
          fill="none"
          stroke="var(--market)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          initial={reduced ? false : 'hidden'}
          animate="shown"
          variants={drawPath}
        />
        {sorted.map((r, i) => (
          <g key={r.horizon_days}>
            <motion.circle
              cx={x(r.horizon_days)}
              cy={y(r.p50_usd_per_day)}
              r={3.5}
              fill="var(--surface)"
              stroke="var(--market)"
              strokeWidth={2}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { ...transition.fast, delay: 0.2 + i * (DURATION.slow / Math.max(1, sorted.length)) }
              }
            />
            <text
              x={x(r.horizon_days)}
              y={H - 6}
              textAnchor="middle"
              className="fill-muted-foreground text-micro font-medium"
            >
              {r.horizon_days}d
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

/**
 * What the route evidence actually means for the number above it.
 *
 * The fault register's own words on the previous treatment: *"To be fair: the
 * app discloses this with a 'Class-only' badge. But a badge is not a feature."*
 * It was right. A small grey outline chip, with its only explanation in a
 * native `title` that never opens on keyboard focus and never appears on
 * touch, is not a disclosure anyone reads.
 *
 * The class-only case says the consequence in figures rather than in jargon,
 * because the consequence is genuinely surprising: measured on this data, a
 * cargo lifting from Newcastle (5,669 nm) and one from Hampton Roads
 * (9,913 nm) return a ceiling identical to four decimal places. Someone
 * comparing origins deserves to know that before they act on it, not after.
 */
function RouteEvidenceNote({
  evidence,
  adjustment,
}: {
  evidence: RouteEvidence
  adjustment: number | null
}) {
  if (evidence === 'ROUTE_RATE_BASIS_UNAVAILABLE') {
    return (
      <p className="panel-note border-wait/40 text-wait-on-soft">
        <span className="font-semibold">This price is for the vessel class, not for this route.</span>{' '}
        No published route-level rate for this origin clears the evidence bar, so the forecast falls
        back to the class benchmark, which means two origins on different continents can return the
        same number. Use it to time the market, not to choose between load ports; the landed-cost
        panel is where distance and fuel actually differ.
      </p>
    )
  }
  const pct = adjustment == null ? null : `${adjustment >= 0 ? '+' : ''}${(adjustment * 100).toFixed(1)}%`
  return (
    <p className="panel-note border-go/40">
      <span className="font-semibold">
        Adjusted for this route{pct ? ` by ${pct}` : ''}.
      </span>{' '}
      {evidence === 'MODELLED'
        ? 'Built from real published route-level rates for this origin, but a thin sample. The adjustment is modelled and its uncertainty is deliberately wide.'
        : 'Built from enough real published route-level rates for this origin to validate the adjustment against the class benchmark.'}
    </p>
  )
}

export function RateForecastTable({
  rows,
  todayQuote,
}: {
  rows: RateHorizon[]
  todayQuote: number
}) {
  const routeEvidence = rows[0]?.route_evidence ?? 'ROUTE_RATE_BASIS_UNAVAILABLE'
  return (
    <Panel
      className="h-full"
      id="forecast"
      title="Rate Forecast"
      soWhat={'Where the model thinks the freight rate goes over the next few weeks, with the range it could land in. A wide range means the model is not confident: treat the timing advice as weak and lean on the walk-away line instead.'}
      hint="What the model expects this vessel class to cost per day, 7 / 30 / 90 days out. The shaded band is the low-to-high range, the line is the expected case, and the dashed line is today's rate. Dir compares the expected case against today; Conf is how strongly the model agrees on that direction."
      meta="TC $/day"
      actions={<RouteEvidenceBadge evidence={routeEvidence} />}
      flush
    >
      <div className="border-b border-border px-2 pb-1 pt-2">
        <FanChart rows={rows} todayQuote={todayQuote} />
      </div>
      <RouteEvidenceNote evidence={routeEvidence} adjustment={rows[0]?.route_adjustment ?? null} />
      <table className="desk-table">
        <thead>
          <tr>
            <th>Horizon</th>
            {/* "p10 / p50 / p90" is statistics shorthand, not a shipping
                term. The percentile stays in the tooltip for anyone who reads
                it natively -- "Low" alone is less precise than what they had --
                but it is no longer the first thing to decode.

                These three were the review's named example of "the two
                highest-value explanations fall back to `title=`". A native
                title waits about a second, renders in OS chrome, never opens
                on keyboard focus and never opens on touch -- so the best
                explanatory text on the panel was invisible to exactly the
                people who needed it. Same real Tooltip the rest of the desk
                uses; the text is unchanged. */}
            {(['p10', 'p50', 'p90'] as const).map((k) => (
              <th key={k} className="text-right">
                <Tooltip content={PERCENTILE[k].definition} className="cursor-help">
                  <span className="border-b border-dotted border-muted-foreground/50">
                    {PERCENTILE[k].label}
                  </span>
                </Tooltip>
              </th>
            ))}
            {/* Was "$/mt (class÷transit)" -- the parenthetical was the
                formula, which belongs in the explanation, not the header. */}
            <th className="text-right">
              <Tooltip
                content="Freight per tonne: the class-wide day rate divided by transit days, not a route-specific quote unless the badge above says route-validated. Different from Fleet Mix's $/mt (the chosen vessel) and Landed Cost's Freight row (one part of the full delivered cost)."
                className="cursor-help"
              >
                <span className="border-b border-dotted border-muted-foreground/50">$/tonne</span>
              </Tooltip>
            </th>
            <th className="text-center">Dir</th>
            <th className="text-right">
              <Tooltip
                content="Confidence in the direction shown (Dir), not in the forecast overall. It is always ≥50% by construction, since Dir always names whichever direction the forecast favours."
                className="cursor-help"
              >
                <span className="border-b border-dotted border-muted-foreground/50">Conf</span>
              </Tooltip>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.horizon_days}>
              <td className="font-semibold">{r.horizon_days}d</td>
              <td className="desk-num text-right text-muted-foreground">
                ${formatNumber(r.p10_usd_per_day)}
              </td>
              <td className="desk-num text-right font-semibold">${formatNumber(r.p50_usd_per_day)}</td>
              <td className="desk-num text-right text-muted-foreground">
                ${formatNumber(r.p90_usd_per_day)}
              </td>
              <td className="desk-num text-right">
                {r.p50_usd_per_mt != null ? `$${r.p50_usd_per_mt.toFixed(2)}` : 'n/a'}
              </td>
              <td>
                <div className="flex justify-center">
                  <Direction dir={r.direction} />
                </div>
              </td>
              <td className="text-right">
                <div className="ml-auto flex w-16 items-center gap-1">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-market"
                      style={{ width: `${r.confidence_pct}%` }}
                    />
                  </div>
                  <span className="desk-num text-caption text-muted-foreground">
                    {Math.round(r.confidence_pct)}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}
