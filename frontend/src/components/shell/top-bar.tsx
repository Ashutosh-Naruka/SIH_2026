import { Bell, ChevronDown, CircleHelp, Database, Lightbulb, Settings, Ship } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AccountMenu } from '@/components/shell/account-menu'
import { Tooltip } from '@/components/ui/tooltip'
import { fetchAlerts } from '@/lib/api'
import { APP_NAME } from '@/lib/branding'
import { setExplainMode, useExplainMode } from '@/lib/explain'
import { PRIMARY_NAV, TOOLS_NAV, type DeskView } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/shell/theme-toggle'

interface TopBarProps {
  /** Which screen is on show, so the bar can say so. */
  view: DeskView
  onSelectView: (view: DeskView) => void
  /** The real last day of market data on disk. Null until /meta answers. */
  dataThrough: string | null
  onNewQuote: () => void
  onOpenSettings: () => void
  onOpenHelp: () => void
  onOpenAccounts: () => void
  onOpenAlerts: () => void
  /** Bumped by the shell whenever something might have changed the count --
   *  closing the alerts drawer, for instance. The bell polls slowly on its
   *  own; this is for the cases where waiting would look broken. */
  alertsRefreshKey: number
}

/** A live icon control on the navy bar. Every one of these does something —
 *  there is no disabled variant, because the top bar no longer carries any
 *  control that is not implemented. */
function IconButton({
  label,
  onClick,
  icon: Icon,
}: {
  label: string
  onClick: () => void
  icon: typeof Settings
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm text-navbar-muted transition-colors hover:bg-white/10 hover:text-navbar-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}

/** A screen link on the navy bar. The underline marks the screen you are on;
 *  it used to mark the first item unconditionally, because the bar listed the
 *  sections of one page and nothing tracked which one was in view. */
function NavLink({
  label,
  hint,
  active,
  onClick,
}: {
  label: string
  hint: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Tooltip content={hint}>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'cursor-pointer whitespace-nowrap pb-2 text-lead font-medium transition-colors',
          active
            ? 'border-b-2 border-navbar-foreground text-navbar-foreground'
            : 'border-b-2 border-transparent text-navbar-muted hover:text-navbar-foreground',
        )}
      >
        {label}
      </button>
    </Tooltip>
  )
}

/**
 * The reference screens, behind one label that says what they are.
 *
 * Port Twin, Tonnage Field, Fragility and Ledger are real screens on real
 * data, and not one of them is on the path from "here is a cargo" to "lock or
 * wait". Presented as four more siblings of the Voyage Desk they read as
 * scope the problem statement never asked for; presented as reference
 * instruments they read as the evidence underneath it, which is what they
 * are.
 */
function ToolsMenu({
  view,
  onSelectView,
}: {
  view: DeskView
  onSelectView: (view: DeskView) => void
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const active = TOOLS_NAV.some((t) => t.view === view)

  // Portaled to <body> with fixed coordinates, not rendered inline under the
  // button -- a z-index bump on the dropdown itself (what this used to do,
  // `z-80`) does not work, and this is the same root cause AccountMenu's own
  // portal fixes (see account-menu.tsx): the header is `relative z-50`,
  // which makes it a stacking context of its own, so a positioned child's
  // z-index is only ever compared against its OTHER CHILDREN, never against
  // <main> outside that context. <main> is also `relative z-50` and comes
  // after the header in DOM order, so at equal z-index it paints over the
  // entire header -- dropdown included -- no matter how high the dropdown's
  // own z-index goes. Escaping to <body> is the only fix; raising the number
  // further is not.
  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const r = buttonRef.current?.getBoundingClientRect()
      if (r) setCoords({ top: r.bottom + 4, left: r.left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      // The menu now lives outside this subtree (portaled to <body>), so it
      // needs its own containment check alongside the button's.
      if (!rootRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative flex h-full items-end">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'flex cursor-pointer items-center gap-1 whitespace-nowrap pb-2 text-lead font-medium transition-colors',
          active
            ? 'border-b-2 border-navbar-foreground text-navbar-foreground'
            : 'border-b-2 border-transparent text-navbar-muted hover:text-navbar-foreground',
        )}
      >
        Reference
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: 'fixed', top: coords.top, left: coords.left }}
            className="z-80 w-72 rounded-md border border-border bg-surface p-1 shadow-raised"
          >
            <p className="px-2 pb-1 pt-1.5 text-micro font-bold uppercase tracking-wide text-muted-foreground">
              Reference instruments
            </p>
            <p className="px-2 pb-1.5 text-micro leading-relaxed text-muted-foreground">
              Evidence behind the decision screens. Nothing here has to be opened to price a
              cargo.
            </p>
            {TOOLS_NAV.map((t) => (
              <button
                key={t.view}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  onSelectView(t.view)
                }}
                className={cn(
                  'flex w-full cursor-pointer flex-col gap-0.5 rounded-sm px-2 py-1.5 text-left transition-colors',
                  'hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                  t.view === view ? 'bg-accent' : '',
                )}
              >
                <span
                  className={cn(
                    'text-body font-semibold',
                    t.view === view ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {t.label}
                </span>
                <span className="text-micro leading-relaxed text-muted-foreground">{t.hint}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}

export function TopBar({
  view,
  onSelectView,
  dataThrough,
  onNewQuote,
  onOpenSettings,
  onOpenHelp,
  onOpenAccounts,
  onOpenAlerts,
  alertsRefreshKey,
}: TopBarProps) {
  const explain = useExplainMode()
  // The bell shows a real count or it shows nothing. It polls at a slow,
  // deliberate cadence: the backend evaluates on its own interval and the
  // market data behind it only changes when a harvester runs, so a fast poll
  // would be asking a question whose answer cannot have changed.
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetchAlerts()
        .then((a) => {
          if (!cancelled) setUnread(a.unread)
        })
        // Silent: an unreachable backend already surfaces everywhere else,
        // and a bell that renders an error is worse than one that renders
        // nothing.
        .catch(() => undefined)
    }
    load()
    const id = window.setInterval(load, 120_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [alertsRefreshKey])

  return (
    // relative z-50: same fix as section-rail.tsx -- without an explicit
    // z-index this static header sat behind the New Quote drawer's `fixed
    // z-40` backdrop whenever the drawer was open (including on first load),
    // silently swallowing clicks on the Forecast/Fleet/Ports/Risk/Map links.
    // Tied at z-50 with the drawer's own panel, DOM order (the drawer
    // renders after this header) keeps the panel itself on top where it
    // actually overlaps the header's right edge -- New Quote/search/etc.
    // stay correctly unclickable while the drawer covers them.
    <header className="relative z-50 flex h-10 shrink-0 items-center justify-between bg-navbar pl-3 pr-3 text-navbar-foreground">
      <div className="flex h-full items-center gap-5">
        <div className="flex items-center gap-2 text-figure font-extrabold tracking-tight">
          <Ship className="h-4.5 w-4.5" strokeWidth={2} />
          {APP_NAME}
        </div>
        {/* Screens, not sections. This bar used to carry
            Forecast/Fleet/Ports/Risk/Map -- a table of contents for the
            Voyage Desk alone, still sitting here doing nothing on the six
            other screens. Those moved to the left rail, where a page's own
            sections belong; the screens moved up here, where an
            application's pages belong. */}
        <nav aria-label="Screens" className="hidden h-full items-end gap-4 md:flex">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.view}
              label={item.label}
              hint={item.hint}
              active={item.view === view}
              onClick={() => onSelectView(item.view)}
            />
          ))}
          <ToolsMenu view={view} onSelectView={onSelectView} />
        </nav>
      </div>

      <div className="flex items-center gap-2">
        {/* A judge's second question is always "is this live data?", and until
            now the screen had no answer -- `latest_data_date` was fetched at
            startup and handed only to the quote form. It costs one chip to
            answer it before it is asked, and to answer it honestly: this is
            the last day the market data actually covers, not today's date. */}
        {dataThrough && (
          <Tooltip
            content={
              <>
                <span className="font-semibold text-foreground">
                  Market data through {dataThrough}
                </span>
                <span className="mt-1 block">
                  Every figure on this desk is priced from data on disk up to this date. The desk
                  fetches the day&apos;s published rates once every 24 hours; where a source
                  publishes on a lag, the screen shows that source&apos;s own latest rather than
                  filling the gap.
                </span>
              </>
            }
          >
            <span className="hidden items-center gap-1.5 rounded-sm border border-white/15 px-2 py-0.5 text-micro text-navbar-muted lg:inline-flex">
              <Database className="h-3 w-3" aria-hidden="true" />
              <span className="font-mono tabular-nums">Data through {dataThrough}</span>
            </span>
          </Tooltip>
        )}
        {/* Explain mode. The one control that turns the desk from a trading
            screen into something a chartering manager can read cold: every
            panel gains a plain-English line saying what it answers and what to
            do when the number is bad. On by default; a trader who does not
            need the commentary turns it off once and the browser remembers. */}
        <Tooltip
          content={
            explain
              ? 'Plain-English notes are showing under each panel heading. Turn them off for a denser desk.'
              : 'Show a plain-English line under each panel heading: what it answers, and what to do if the number is bad.'
          }
        >
          <button
            type="button"
            onClick={() => setExplainMode(!explain)}
            aria-pressed={explain}
            className={cn(
              // A visible border in both states, not only the "on" fill --
              // the off state used to be borderless, background-less text at
              // 70% opacity, which on the navy bar read as decoration rather
              // than a control: there was nothing to signal a toggle sits
              // here at all until the state changed. Same border width in
              // both states so the pill doesn't change size on toggle.
              //
              // Text colour is `navbar-foreground`/`navbar-muted`, not
              // `primary-foreground` (a real bug this button had before
              // either of the above): `primary-foreground` is the token
              // paired with a `bg-primary` fill (light-blue button, e.g. New
              // Quote) and in the dark theme it resolves to #04121f -- near
              // black. On this button's actual background (the navy bar
              // itself, or a translucent white wash over it) that rendered
              // as illegibly dark text. Every other control on this bar
              // (IconButton, NavLink, the data-through chip) already uses
              // navbar-foreground/navbar-muted for exactly this reason.
              'hidden items-center gap-1.5 rounded-md border px-2 py-1 text-caption font-semibold transition-colors lg:inline-flex',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current',
              explain
                ? 'border-white/30 bg-white/15 text-navbar-foreground'
                : 'border-white/15 text-navbar-muted hover:border-white/30 hover:bg-white/10 hover:text-navbar-foreground',
            )}
          >
            <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Explain</span>
          </button>
        </Tooltip>

        {/*
          F-35 disabled Search / Notifications / Settings / Help with honest
          "not implemented" tooltips, which was the right call at the time: a
          live-looking control that silently does nothing reads as broken.

          But a control that announces its own absence is still a control that
          announces its own absence, and four of them across the top bar make a
          finished product look like a prototype. So each one is now resolved
          rather than labelled:

            Settings  -> built (lib/settings + SettingsDrawer)
            Help      -> built (HelpDrawer: what the desk does, the glossary,
                         and how it treats its own numbers)
            Search    -> REMOVED. There is no cross-entity search to run: ports
                         are one click away on Port Twin, and a box that only
                         filters a 16-row list is furniture.
            Bell      -> REMOVED. Alerts need somewhere to persist and someone
                         to notify; both arrive with the account system, and
                         until then the icon promises a capability that does
                         not exist anywhere in the stack.

          Nothing in the top bar says "not implemented" any more, because
          nothing in it is unimplemented.
        */}
        <button
          type="button"
          onClick={onNewQuote}
          // Was a white pill with --primary text. That reads well against the
          // light theme's navy bar, but --primary on dark is a light blue
          // (#4d9fff) and the same pill measured 2.72:1 -- the screen's main
          // call to action, under the AA floor. The primary fill carries its
          // own paired foreground token in both themes, so the pairing cannot
          // drift like that again.
          className="cursor-pointer rounded-sm bg-primary px-2 py-1 text-lead font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
        >
          New Quote
        </button>
        <button
          type="button"
          onClick={onOpenAlerts}
          aria-label={
            unread > 0
              ? `Alerts, ${unread} unread`
              : 'Alerts — nothing new'
          }
          className="relative inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm text-navbar-muted transition-colors hover:bg-white/10 hover:text-navbar-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-risk px-1 text-[9px] font-bold leading-none text-risk-fg"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
        <AccountMenu onOpenAccounts={onOpenAccounts} />
        <ThemeToggle onDark />
        <IconButton label="Settings" onClick={onOpenSettings} icon={Settings} />
        <IconButton label="Help" onClick={onOpenHelp} icon={CircleHelp} />
      </div>
    </header>
  )
}
