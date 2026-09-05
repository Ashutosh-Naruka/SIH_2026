import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A labelled horizontal band: the desk's top-level layout primitive.
 *
 * The desk used to be twelve independently-bordered, shadowed cards stacked
 * down a scrolling column, each with its own 28px header, its own hint icon
 * and its own explanation strip. Every one of them was correct and the set of
 * them had no reading order: nothing on screen said which box to look at
 * first, or that box 9 was evidence for box 2. The reported symptom was
 * exactly that ("I have no clue what data I am supposed to look at, and at
 * what order").
 *
 * A band is the fix. One sheet, not twelve cards: a name in the left gutter
 * says what this strip IS, the content sits to its right, and a hairline
 * separates it from the next. That produces a single spine down the left edge
 * a reader can run their eye along (CARGO, DECISION, RESULTS, ROUTE, WATCH,
 * EVIDENCE) and know both what is here and what order to read it in, which is
 * the property the old grid of equal-weight boxes could not have.
 *
 * The gutter collapses to a heading above the content below `lg`, where 96px
 * of permanent left margin costs more than the alignment buys.
 */
export function Band({
  id,
  label,
  meta,
  actions,
  children,
  className,
  bodyClassName,
}: {
  /** Anchor id. The section rail scrolls to these, so every band that the
   *  rail lists must render whenever a quote exists. */
  id?: string
  label: string
  /** Small dim text beside the label: a count, a subject, a date. */
  meta?: ReactNode
  /** Right-aligned controls, on the band's own top line. */
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section
      id={id}
      aria-label={label}
      className={cn('border-b border-border last:border-b-0', className)}
    >
      <div className="flex flex-col gap-1 px-2 py-2.5 lg:flex-row lg:gap-3">
        <div className="flex shrink-0 items-baseline justify-between gap-2 lg:w-24 lg:flex-col lg:justify-start lg:gap-0.5">
          <h2 className="text-caption font-bold uppercase tracking-[0.08em] text-primary">
            {label}
          </h2>
          {meta != null && (
            <span className="truncate text-micro uppercase tracking-wide text-muted-foreground lg:max-w-24">
              {meta}
            </span>
          )}
          {actions != null && <div className="flex items-center gap-1 lg:hidden">{actions}</div>}
        </div>
        <div className={cn('min-w-0 flex-1', bodyClassName)}>{children}</div>
        {actions != null && <div className="hidden shrink-0 items-start gap-1 lg:flex">{actions}</div>}
      </div>
    </section>
  )
}

/**
 * A band whose body folds away.
 *
 * Used for the two bands a reader does not need open to read the answer: the
 * input form once it has been submitted, and the full evidence stack. Both
 * keep their gutter label and a one-line summary while closed, so folding one
 * shut never costs the reader the knowledge that it exists, or what is in it.
 *
 * `open` is controlled by the caller rather than held here: the page needs to
 * close the cargo band on submit and the reader needs to be able to reopen it,
 * and two owners of one boolean is how a panel ends up fighting its own page.
 */
export function CollapsibleBand({
  id,
  label,
  meta,
  summary,
  open,
  onToggle,
  canToggle = true,
  openLabel,
  closedLabel,
  children,
  actions,
}: {
  id?: string
  label: string
  meta?: ReactNode
  /** Shown in place of the body while closed. Keep it to one line. */
  summary?: ReactNode
  open: boolean
  onToggle: () => void
  /** False while there is nothing worth folding to -- the toggle is then not
   *  rendered at all, rather than rendered as a control that does nothing. */
  canToggle?: boolean
  /** Verb for the toggle when the band is open, e.g. "Hide". */
  openLabel?: string
  /** Verb for the toggle when it is closed, e.g. "Edit". */
  closedLabel?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <Band
      id={id}
      label={label}
      meta={meta}
      actions={
        <div className="flex items-center gap-1">
          {actions}
          {canToggle && (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              className="inline-flex h-6 items-center gap-1 rounded-sm border border-border bg-surface-2 px-2 text-caption font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <ChevronRight
                className={cn('h-3 w-3 transition-transform', open && 'rotate-90')}
                aria-hidden="true"
              />
              {open ? (openLabel ?? 'Hide') : (closedLabel ?? 'Show')}
            </button>
          )}
        </div>
      }
    >
      {!open && summary}
      {/*
        Hidden with a class, never unmounted.

        The body of this band is the cargo form, and the form owns every field
        the reader has typed as its own component state. Rendering `open ?
        children : summary` would unmount it the moment the band folded -- so
        submitting a quote (which folds it) would silently discard the cargo,
        and reopening the band would present empty defaults rather than the
        voyage that produced the answer on screen. Folding has to be a change
        of visibility, not of existence.

        `hidden` as a Tailwind class rather than the HTML attribute: preflight
        sets `display` on several elements, which would win over `[hidden]`.
      */}
      <div className={cn(!open && 'hidden')}>{children}</div>
    </Band>
  )
}
