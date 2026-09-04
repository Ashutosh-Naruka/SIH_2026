import { ShieldCheck } from 'lucide-react'
import { Panel } from '@/components/desk/panel'
import { Tooltip } from '@/components/ui/tooltip'
import type { RiskAlert, RiskAssessment, RiskSeverity } from '@/lib/types'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

// Every category except cyclone_season keys its metric/threshold to a
// z-score of the series' own recent history (opt.risk.rate_regime_alert,
// port_congestion_alert, chokepoint_disruption_alert all call the same
// `_zscore_of_last` helper). Cyclone season alerts compare a real
// storms/season-week rate against a multiple of the all-basin median
// instead -- a ratio, not a z-score -- so the two need different chip
// labels and tooltip text rather than one generic "metric vs threshold".
const Z_SCORE_CATEGORIES = new Set(['rate_regime', 'port_congestion', 'chokepoint_disruption'])

const SEVERITY_DOT: Record<RiskSeverity, string> = {
  info: 'bg-primary',
  warning: 'bg-wait',
  critical: 'bg-risk',
}

// Severity was previously carried by the dot's colour alone, which is exactly
// the encoding a red/green-blind reader cannot resolve -- and these three
// tones (primary blue, wait amber, risk red) are the ones that most need
// telling apart. The word now travels with the dot everywhere.
const SEVERITY_LABEL: Record<RiskSeverity, string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
}

const SEVERITY_TEXT: Record<RiskSeverity, string> = {
  info: 'text-primary',
  warning: 'text-wait',
  critical: 'text-risk',
}

// 2.4: "Cyclone season" (a bare Oct-Dec calendar check) renamed now that
// opt.risk.cyclone_season_alert is a real per-basin, per-ISO-week strike
// climatology lookup keyed off the actual ports on the quote, not a
// calendar rule that fired the same way regardless of where the cargo was.
const MONITORED = ['Rate regime', 'Port congestion', 'Chokepoint transits', 'Cyclone climatology']

function AlertRow({ a }: { a: RiskAlert }) {
  const isZScore = Z_SCORE_CATEGORIES.has(a.category)
  return (
    <li className="flex gap-2 border-b border-border/70 px-2 py-2 transition-colors last:border-b-0 hover:bg-surface-2">
      <span
        className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', SEVERITY_DOT[a.severity])}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          {/* No `truncate` here: this row used to cut off whichever end of
              "CATEGORY · SUBJECT" ran out of room in the narrow three-column
              layout, which was reliably the subject -- the one part of this
              line that names the actual thing at risk. Wraps to a second
              line instead of hiding it. */}
          <span className="min-w-0 text-caption font-bold uppercase tracking-wide">
            <span className={SEVERITY_TEXT[a.severity]}>{SEVERITY_LABEL[a.severity]}</span>
            {/* A rule, not a pipe character: a literal "|" is text as far as a
                screen reader and a contrast check are concerned (it measured
                1.48:1 in border grey), while this is purely decorative and
                announces nothing. */}
            <span
              aria-hidden="true"
              className="mx-1.5 inline-block h-2 w-px translate-y-px bg-border"
            />
            {/* Category stays muted -- it's the same four words on every row
                of this panel. Subject does not: it's the one part of this
                line that changes per alert (which strait, which port, which
                vessel class) and was reading as decoration when it shared
                the category's grey. */}
            <span className="text-muted-foreground">{a.category.replace(/_/g, ' ')}</span>{' '}
            <span className="text-foreground">{a.subject}</span>
          </span>
          {/* A real tooltip (not native `title`, which never opens on
              keyboard focus or touch -- the same gap F-76/F-104 fixed
              elsewhere on the desk) explaining what these two numbers are,
              since "z" means nothing on sight and the two figures otherwise
              just repeat what `message` already says in prose below. */}
          <Tooltip
            content={
              isZScore ? (
                <>
                  <span className="font-semibold text-foreground">z-score</span>
                  <span className="mt-1 block">
                    How far today's value sits from its own recent baseline, in standard
                    deviations. This alert fires past ±{formatNumber(a.threshold, 2)}.
                  </span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-foreground">Rate vs threshold</span>
                  <span className="mt-1 block">
                    This basin and week's real storm-strike rate, against the multiple of the
                    all-basin median that counts as significant risk.
                  </span>
                </>
              )
            }
          >
            <span className="desk-chip desk-chip-neutral cursor-help">
              {isZScore && <span className="font-sans font-normal normal-case text-muted-foreground">z </span>}
              {formatNumber(a.metric_value, 2)}
              <span className="font-sans font-normal normal-case text-muted-foreground"> vs </span>
              {formatNumber(a.threshold, 2)}
            </span>
          </Tooltip>
        </div>
        <p className="mt-0.5 text-body leading-relaxed text-foreground">{a.message}</p>
      </div>
    </li>
  )
}

export function RiskFeed({ assessment }: { assessment: RiskAssessment }) {
  const alerts = assessment.alerts
  return (
    <Panel
      className="h-full"
      id="risk"
      title="Risk Feed"
      soWhat={'The things that could make this quote wrong, listed worst first. Anything flagged here should be checked with the agent or the owner before you fix. The model has priced the voyage, not the surprise.'}
      hint="Real-data early warnings: unusual rate-regime shifts, port congestion spikes, chokepoint traffic drops (Suez, Hormuz, Malacca, Bab-el-Mandeb, Cape), and real per-basin, per-week cyclone strike climatology for the ports on this quote. Each alert shows its metric vs threshold."
      meta={`${alerts.length} alert${alerts.length === 1 ? '' : 's'} · ${assessment.as_of}`}
      flush
    >
      {alerts.length === 0 ? (
        <div className="p-2">
          <div className="flex items-center gap-2 rounded-sm border border-go/30 bg-go-soft px-2 py-2 text-lead font-semibold text-go">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            No disruption signals
          </div>
          {/* Naming what was checked matters as much as the all-clear: an
              empty feed with nothing beside it is indistinguishable from a
              feed that failed to load. */}
          <div className="mt-2 grid grid-cols-2 gap-1">
            {MONITORED.map((m) => (
              <div
                key={m}
                className="flex items-center gap-2 rounded-sm bg-surface-2 px-2 py-1 text-caption text-muted-foreground"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-go" aria-hidden="true" />
                {m}
              </div>
            ))}
          </div>
          <p className="mt-2 text-caption leading-relaxed text-muted-foreground">
            All four signals are within their real-data thresholds as of {assessment.as_of}.
          </p>
        </div>
      ) : (
        <ul>
          {alerts.map((a, i) => (
            <AlertRow key={`${a.category}-${a.subject}-${i}`} a={a} />
          ))}
        </ul>
      )}
    </Panel>
  )
}
