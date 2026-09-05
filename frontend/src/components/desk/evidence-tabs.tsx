import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface EvidenceTab {
  id: string
  label: string
  /** Optional count/flag shown after the label, e.g. the number of alerts. */
  badge?: ReactNode
  /** Tone for the badge, so a critical count reads red on the tab itself. */
  badgeTone?: 'go' | 'wait' | 'risk'
}

/**
 * The tab bar over the desk's evidence stack.
 *
 * The desk's supporting panels -- forecast table, walk-away curve, timeline,
 * port limits, fleet mix, assignments, landed cost, backhaul, risk feed,
 * carbon rating, chokepoint fracture, satellite census -- used to be twelve
 * boxes stacked vertically below the answer, about two thousand pixels of
 * them. All twelve are still here and none has changed; they are grouped into
 * five sets and only one set is on screen at a time, so the evidence occupies
 * roughly one screen instead of five and the reader chooses which question
 * they are asking rather than scrolling past four they are not.
 *
 * Every panel stays MOUNTED whichever tab is showing (the page hides the
 * inactive ones with a class rather than unmounting them). That is deliberate
 * and load-bearing: the anchorage panel fetches its satellite census on mount,
 * and unmounting on every tab switch would re-issue that request each time a
 * reader looked at a different tab. Hiding also preserves the chart panels'
 * measured widths, and their ResizeObserver re-measures when they come back.
 */
export function EvidenceTabBar({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly EvidenceTab[]
  active: string
  onSelect: (id: string) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Evidence"
      className="flex flex-wrap items-center gap-px border-b border-border"
    >
      {tabs.map((t) => {
        const isActive = t.id === active
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`evidence-tab-${t.id}`}
            aria-selected={isActive}
            aria-controls={`evidence-panel-${t.id}`}
            onClick={() => onSelect(t.id)}
            className={cn(
              'inline-flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-caption font-semibold uppercase tracking-wide transition-colors',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {t.label}
            {t.badge != null && (
              <span
                className={cn(
                  'desk-num rounded-sm px-1 text-micro font-bold',
                  t.badgeTone === 'risk'
                    ? 'bg-risk/15 text-risk-on-soft'
                    : t.badgeTone === 'wait'
                      ? 'bg-wait/15 text-wait-on-soft'
                      : t.badgeTone === 'go'
                        ? 'bg-go/15 text-go-on-soft'
                        : 'bg-surface-2 text-muted-foreground',
                )}
              >
                {t.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * One tab's contents. Always rendered; `hidden` is a class rather than the
 * HTML attribute because Tailwind's preflight sets `display` on several
 * elements, which would win over `[hidden]`'s own rule.
 */
export function EvidencePanel({
  id,
  active,
  children,
}: {
  id: string
  active: string
  children: ReactNode
}) {
  const isActive = id === active
  return (
    <div
      role="tabpanel"
      id={`evidence-panel-${id}`}
      aria-labelledby={`evidence-tab-${id}`}
      aria-hidden={!isActive}
      className={cn('pt-2', !isActive && 'hidden')}
    >
      {children}
    </div>
  )
}
