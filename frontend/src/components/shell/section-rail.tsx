import { useEffect, useState } from 'react'
import { DESK_SECTIONS } from '@/lib/nav'
import { cn } from '@/lib/utils'

/**
 * Where you are inside the Voyage Desk.
 *
 * This replaces the icon rail, which listed the app's SCREENS down the side
 * while the top bar listed one screen's SECTIONS across the top -- exactly
 * backwards, and the top bar's section links stayed visible and inert on the
 * six screens that have no such sections. Pages moved up (top-bar.tsx);
 * sections came down here, where a table of contents belongs.
 *
 * The icons went with the move, deliberately. A twenty-pixel glyph for
 * "Forecast" versus "Risk" carries no meaning a reader can decode without the
 * label underneath it, and once the label has to be there anyway the icon is
 * decoration that costs a rail three times as wide. Text-only fits the real
 * labels at their full length with no wrapping tricks.
 *
 * Mounted only when the desk is showing a priced quote -- see nav.ts. A link
 * that scrolls nowhere is the thing this whole rearrangement was about.
 */
export function SectionRail() {
  // Which section is actually on screen, observed rather than assumed. The
  // old rail hardcoded the first item as "current" (F-34) because nothing
  // tracked scroll position; an IntersectionObserver makes the highlight a
  // fact. Sections that have not rendered (a quote with no map, say) are
  // simply never observed and never highlight.
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const seen = new Map<string, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.intersectionRatio)
        let best: string | null = null
        let bestRatio = 0
        for (const [id, ratio] of seen) {
          if (ratio > bestRatio) {
            best = id
            bestRatio = ratio
          }
        }
        // Only replace the highlight when something is genuinely in view --
        // scrolling through a gap between panels should not blank it.
        if (best && bestRatio > 0) setActive(best)
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    )
    const nodes = DESK_SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (n): n is HTMLElement => n !== null,
    )
    nodes.forEach((n) => observer.observe(n))
    return () => observer.disconnect()
  }, [])

  return (
    // relative z-50: the quote drawer's backdrop is `fixed inset-0 z-40`, and
    // a positioned, z-indexed element paints above static content whatever
    // the DOM order -- without this the rail sat behind that backdrop and its
    // clicks closed the drawer instead of activating the link (F-48). Kept
    // from the rail this replaces, for the same reason.
    <nav
      aria-label="Sections of the Voyage Desk"
      className="relative z-50 hidden w-40 shrink-0 flex-col gap-px overflow-y-auto border-r border-sidebar-border bg-sidebar py-2 lg:flex"
    >
      <p className="px-3 pb-1 text-micro font-bold uppercase tracking-wide text-muted-foreground">
        On this page
      </p>
      {DESK_SECTIONS.map(({ id, label }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            type="button"
            onClick={() =>
              document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            aria-current={isActive ? 'true' : undefined}
            className={cn(
              'px-3 py-1.5 text-left text-body font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
              isActive
                ? 'cursor-pointer border-l-2 border-primary bg-accent text-primary'
                : 'cursor-pointer border-l-2 border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {label}
          </button>
        )
      })}
    </nav>
  )
}
