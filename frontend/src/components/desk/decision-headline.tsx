import { motion, useReducedMotion } from 'motion/react'
import { Figure } from '@/components/desk/figure'
import { addDays, formatShortDate } from '@/lib/format'
import { transition } from '@/lib/motion'
import type { QuoteResult } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useMoney } from '@/lib/money-context'

/**
 * The answer, as a sentence, above everything else.
 *
 * The desk was twelve panels of equal visual weight. Every figure on it was
 * correct and none of them said what to *do* -- a reader had to assemble the
 * verdict word, the gap to the walk-away line, the entry window and the
 * expected edge from four separate boxes before the screen meant anything.
 *
 * This states it once, in one line, in the words someone would use out loud,
 * with the two numbers that carry the decision set at display size beside it.
 * Nothing here is new data and nothing is rounded differently -- it is the same
 * `lock_action`, `ceiling_usd_per_day`, `today_quote_usd_per_day` and
 * `expected_savings_usd_total` the panels below show, composed into a claim.
 *
 * Copy link and One-page brief sit in its top corner rather than in a strip
 * of their own above the card. That strip used to be the only thing in its
 * row -- two buttons pinned right, with the rest of the row bare -- because
 * "forward this" belongs on the verdict (see each button's own docstring),
 * but a whole flex row spent on two buttons that could sit beside the
 * breadcrumb they already share a baseline with is a full row of vertical
 * space this desk does not have to spend.
 */
export function DecisionHeadline({ quote }: { quote: QuoteResult }) {
  const reduced = useReducedMotion()
  const { money } = useMoney()
  const isLock = quote.lock_action === 'LOCK'
  // The whole-term commitment, the same product the Why tab's table shows on
  // its "Lock today" row -- today's rate across the contract term.
  const lockTerm = quote.today_quote_usd_per_day * quote.contract_term_days
  const optionValue = quote.full_recommendation.stopping_result?.option_value_usd_per_day ?? null

  const gap = Math.abs(quote.today_quote_usd_per_day - quote.ceiling_usd_per_day)
  const start = quote.optimal_entry_window_start_day
  const end = quote.optimal_entry_window_end_day
  const hasWindow = start != null && end != null

  // No card border, radius or shadow on the section below: it sits inside the
  // DECISION band, whose gutter label already frames it, and a second frame
  // made the desk read as boxes inside boxes -- the thing the band layout
  // exists to stop. The verdict-coloured wash and the left accent bar stay:
  // those are what make a LOCK and a WAIT distinguishable across the room,
  // and they cost no extra structure.
  return (
    <motion.section
      aria-label="Decision"
      initial={reduced ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : transition.base}
      className={cn(
        'relative overflow-hidden rounded-sm border-l-2 px-3 py-2',
        isLock ? 'border-go' : 'border-wait',
      )}
    >
      {/* A wash in the verdict's own colour, so the strip is identifiable
          before it is read. Under 8% -- it never competes with the text. */}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0',
          isLock
            ? 'bg-linear-to-r from-go/8 via-transparent to-transparent'
            : 'bg-linear-to-r from-wait/8 via-transparent to-transparent',
        )}
      />

      <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-figure font-semibold leading-snug text-foreground">
            {isLock ? (
              <>
                <span className="font-bold text-go">Lock this charter now.</span> Today&apos;s{' '}
                {money(quote.today_quote_usd_per_day)}/day is inside the walk-away line, and
                waiting is not expected to beat it.
              </>
            ) : (
              <>
                <span className="font-bold text-wait">Wait before fixing.</span> Today&apos;s{' '}
                {money(quote.today_quote_usd_per_day)}/day is {money(gap)}/day above the
                walk-away line
                {hasWindow ? (
                  <>
                    , and the model expects the better entry between{' '}
                    {formatShortDate(addDays(quote.as_of, start))} and{' '}
                    {formatShortDate(addDays(quote.as_of, end))}.
                  </>
                ) : (
                  '.'
                )}
              </>
            )}
          </h1>
        </div>

        {/*
          These two are here because they are NOT anywhere else on the page.
          This slot used to hold the walk-away line, the expected edge and the
          confidence, all three of which the RESULTS strip prints in full about
          eighty pixels further down -- the same figure twice, close enough to
          be read in one glance, which teaches the reader that the desk repeats
          itself and that neither copy is worth trusting as the definitive one.
          RESULTS is the right home for those: it is the row whose whole job is
          "every number that decides this".

          What is left is the size of the commitment being decided (the total
          cost over the term, which no other band states) and, when the solver
          found one, the option value that is the actual reason a WAIT verdict
          can disagree with a naive rate comparison.

          Deliberately NOT promoted here: the lock-vs-wait "cost over term"
          table from the Why tab. On this very quote it reads $632.7K to lock
          against $643.1K to wait -- waiting costs MORE -- while the verdict
          says wait, because the option value more than covers the difference.
          That pair contradicts itself unless the option-value caveat sits
          directly beside it, which is exactly the F-06 failure (a caption
          keyed off the fused verdict rather than the number it described).
          The table stays in the Why tab with its caveats attached.
        */}
        <div className="flex shrink-0 items-start gap-6">
          <Stat
            label="If you fix today"
            value={<Figure value={lockTerm} kind="usdCompact" />}
            sub={`${quote.contract_term_days} days at ${money(quote.today_quote_usd_per_day)}/day`}
          />
          {optionValue != null && optionValue > 0 && (
            <Stat
              label="Value of waiting"
              value={<Figure value={optionValue} kind="usd" />}
              sub="per day, priced in"
              tone={isLock ? undefined : 'go'}
            />
          )}
        </div>
      </div>
    </motion.section>
  )
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: React.ReactNode
  sub: string
  tone?: 'go' | 'risk'
}) {
  return (
    <div className="text-right">
      <div className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'desk-num mt-0.5 text-figure-lg font-bold leading-none',
          tone === 'go' ? 'text-go' : tone === 'risk' ? 'text-risk' : 'text-foreground',
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-micro text-muted-foreground">{sub}</div>
    </div>
  )
}
