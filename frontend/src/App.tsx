import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { AccountsDrawer } from '@/components/shell/accounts-drawer'
import { AlertsDrawer } from '@/components/shell/alerts-drawer'
import { HelpDrawer } from '@/components/shell/help-drawer'
import { SectionRail } from '@/components/shell/section-rail'
import { SettingsDrawer } from '@/components/shell/settings-drawer'
import { SignIn } from '@/components/shell/sign-in'
import { TopBar } from '@/components/shell/top-bar'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import type { DeskView } from '@/lib/nav'
import { readDeepLink, writeDeepLink } from '@/lib/deep-link'
import { loadSettings, type DeskSettings } from '@/lib/settings'
import { MoneyProvider } from '@/lib/money-context'
import type { MoneyContext } from '@/lib/format'
import {
  ApiRequestError,
  fetchChokepoints,
  fetchFxRate,
  fetchMeta,
  fetchPorts,
  streamQuote,
} from '@/lib/api'
import type {
  ChokepointReference,
  ProgressStage,
  PortListing,
  QuoteEnvelope,
  QuoteRequest,
  VesselInput,
} from '@/lib/types'
// The Voyage Desk is what loads on arrival, so it stays a static import --
// code-splitting the landing view only moves its cost into a second round
// trip. The six secondary screens are `lazy` instead: the build was one
// 847 KB chunk, of which these pages and the charting they pull in are the
// bulk, and a user who never opens Season Plan should not download its
// scheduler view to look at a quote.
import { VoyageDeskPage } from '@/pages/voyage-desk-page'

const FragilityPage = lazy(() =>
  import('@/pages/fragility-page').then((m) => ({ default: m.FragilityPage })),
)
const LedgerPage = lazy(() =>
  import('@/pages/ledger-page').then((m) => ({ default: m.LedgerPage })),
)
const PortfolioPage = lazy(() =>
  import('@/pages/portfolio-page').then((m) => ({ default: m.PortfolioPage })),
)
const PortTwinPage = lazy(() =>
  import('@/pages/port-twin-page').then((m) => ({ default: m.PortTwinPage })),
)
const SeasonPlanPage = lazy(() =>
  import('@/pages/season-plan-page').then((m) => ({ default: m.SeasonPlanPage })),
)
const TonnageFieldPage = lazy(() =>
  import('@/pages/tonnage-field-page').then((m) => ({ default: m.TonnageFieldPage })),
)

/** Shown for the fraction of a second a secondary screen's chunk is in
 *  flight. It says "fetching the screen", not "computing" -- this desk has
 *  several genuinely slow computations and the two must not look alike. */
function ViewLoading() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-lead text-muted-foreground">
      Loading this screen…
    </div>
  )
}

// The view union and every screen's label now live in lib/nav.ts, which is
// also what the top bar and the deep-link parser read -- one list, so adding
// a screen cannot leave the navigation and the URL grammar disagreeing.
// Re-exported here because `@/App` is where the rest of the app has always
// imported this type from.
export type { DeskView }

function Shell() {
  const auth = useAuth()
  // The URL as it was when the app opened, read exactly once.
  //
  // This must be captured rather than re-read later, and the reason is a bug
  // this had on the first attempt: the effect that keeps the URL in sync runs
  // on mount with no quote yet loaded, so it rewrites the hash to a bare
  // `#/desk` -- and by the time the port list has arrived and the auto-run
  // effect is ready to act, the cargo it was supposed to solve has been erased
  // from the address bar by this app's own housekeeping. Reading at mount and
  // holding the value makes the two effects independent of each other's
  // ordering.
  const [initialLink] = useState(() => readDeepLink())
  // Initialised from the URL, not hardcoded to the desk -- a link to
  // #/portfolio has to land on Portfolio, and it has to do so on the FIRST
  // render rather than by flashing the desk and then swapping.
  const [view, setView] = useState<DeskView>(initialLink.view)
  const [ports, setPorts] = useState<PortListing[]>([])
  const [portsError, setPortsError] = useState<string | null>(null)
  // 3.4: the static chokepoint reference table (real id/name/centre/radius)
  // -- cheap and cacheable, same "fetch once at app start" treatment as
  // `ports` above, since it only changes when opt.chokepoints itself is
  // edited. Failure is non-fatal: the map overlay simply has nothing to
  // join a quote's fracture bands against, same as an empty `ports`.
  const [chokepoints, setChokepoints] = useState<ChokepointReference[]>([])
  const [latestDate, setLatestDate] = useState<string | null>(null)
  const [envelope, setEnvelope] = useState<QuoteEnvelope | null>(null)
  // P6: retained so VoyageDeskPage can offer a real backhaul sweep for the
  // vessel(s) actually quoted -- QuoteResult never echoes the full vessel
  // specs back (only vessel_id inside assignments/repositioning), so this
  // is the one place the real draft/beam/LOA/DWT the user typed still exists.
  const [lastVessels, setLastVessels] = useState<VesselInput[]>([])
  // The request behind whatever is on screen. Kept so the URL can describe the
  // current quote, and so a reload or a shared link re-solves the same cargo.
  const [lastRequest, setLastRequest] = useState<QuoteRequest | null>(null)
  const [stages, setStages] = useState<ProgressStage[]>([])
  const [solving, setSolving] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  // Bumped whenever something asks to be brought back to the quote form --
  // the top bar's New Quote button, chiefly. The form itself
  // (components/desk/quote-form.tsx) is a permanent fixture at the top of
  // the Voyage Desk now, not a drawer that opens and closes, so "New Quote"
  // no longer means "reveal the form" -- it means "switch to the desk and
  // scroll/focus the form that is already there." QuoteForm's own effect
  // watches this value and reacts whether it was already mounted (an
  // in-place scroll) or is mounting for the first time this render (the
  // view switch below and this bump happen in the same handler, so a form
  // that mounts because of this click already carries the new token on its
  // first render, and an effect always runs after a component's first
  // render regardless of whether a dependency "changed").
  const [quoteFormFocus, setQuoteFormFocus] = useState(0)
  function goToQuoteForm() {
    setView('desk')
    setQuoteFormFocus((t) => t + 1)
  }
  // Settings and Help replace two of the four "not implemented" controls the
  // top bar used to carry. Both default closed, for the same F-53 reason the
  // quote drawer does: a modal that mounts open puts a click-eating backdrop
  // over the whole app before the user has done anything.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [accountsOpen, setAccountsOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  // Bumped when the alerts drawer closes, so the bell's count reflects what
  // was just read rather than waiting for its next slow poll.
  const [alertsRefreshKey, setAlertsRefreshKey] = useState(0)
  const [settings, setSettings] = useState<DeskSettings>(() => loadSettings())
  // The real FRED USD/INR observation, fetched once. Null until it answers,
  // and null forever if no real observation covers the pricing date -- in
  // which case `money()` keeps returning dollars rather than inventing a
  // conversion, whatever the currency preference says.
  const [inrPerUsd, setInrPerUsd] = useState<number | null>(null)
  const [fxAsOf, setFxAsOf] = useState<string | null>(null)
  const runId = useRef(0)

  // Only once the desk is actually reachable. These four fired on mount
  // unconditionally, which on a closed deployment meant four guaranteed 401s
  // in the console behind the sign-in screen -- before the app even knew
  // whether anyone was signed in. Harmless in effect and awful in practice:
  // real failures become impossible to spot in a console that always has
  // errors in it, and a user's first impression of the product is a wall of
  // red. `admitted` is false while /auth/status is still in flight, so the
  // requests wait for the answer rather than racing it.
  const admitted = !auth.loading && !auth.unreachable && (!auth.status?.enforced || !!auth.user)

  useEffect(() => {
    if (!admitted) return
    fetchPorts()
      .then(setPorts)
      .catch((err: unknown) => {
        setPortsError(err instanceof Error ? err.message : 'Failed to load ports.')
      })
    fetchMeta()
      .then((m) => setLatestDate(m.latest_data_date))
      .catch(() => setLatestDate(null))
    fetchChokepoints()
      .then(setChokepoints)
      .catch(() => setChokepoints([]))
    fetchFxRate()
      .then((f) => {
        setInrPerUsd(f.inr_per_usd)
        setFxAsOf(f.as_of)
      })
      .catch(() => setInrPerUsd(null))
  }, [admitted])

  function handleSubmit(req: QuoteRequest) {
    const id = ++runId.current
    setSolving(true)
    setStages([])
    setQuoteError(null)
    setLastVessels(req.vessels ?? [])
    setLastRequest(req)

    void streamQuote(req, {
      onStage: (stage) => {
        if (id === runId.current) setStages((prev) => [...prev, stage])
      },
      onResult: (env) => {
        if (id !== runId.current) return
        setEnvelope(env)
        setSolving(false)
      },
      onError: (err: ApiRequestError) => {
        if (id !== runId.current) return
        setQuoteError(err.message)
        setEnvelope(null)
        setSolving(false)
      },
    })
  }

  // A shared link, or a reload of one, re-solves its cargo once the app is
  // admitted and the port list has arrived.
  //
  // The guard matters more than it looks. `admitted` and `ports` both settle
  // asynchronously and this effect depends on them, so without a ref it would
  // re-submit the same quote every time either changed -- the desk would
  // appear to work, and would be solving the same cargo two or three times
  // over on every cold load. One link, one solve.
  const deepLinkRan = useRef(false)
  useEffect(() => {
    if (deepLinkRan.current || !admitted || ports.length === 0) return
    deepLinkRan.current = true
    if (!initialLink.quote) return
    handleSubmit(initialLink.quote)
    // handleSubmit is redeclared each render and is not a dependency worth
    // stabilising for a one-shot effect that is already ref-guarded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admitted, ports.length, initialLink])

  // Someone pasting a link into a tab that is ALREADY open.
  //
  // Changing only the fragment does not reload the document, so without this
  // the link that works perfectly from an email does nothing at all when
  // pasted into the address bar of a desk the reader already has in front of
  // them -- and "the link is broken" is what they will report, reasonably.
  //
  // Safe to honour in full, quote included: `writeDeepLink` uses
  // `replaceState`, which by specification does NOT fire `hashchange`, so this
  // handler only ever sees a navigation a person actually performed.
  useEffect(() => {
    function onHashChange() {
      const link = readDeepLink()
      setView(link.view)
      if (link.quote) {
        handleSubmit(link.quote)
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the URL describing what is on screen. `replaceState` only, so the
  // Back button still leaves the app rather than stepping backwards through
  // panel changes -- see lib/deep-link.ts.
  //
  // Held back until the incoming link has been consumed above, so the address
  // bar never briefly loses the cargo the user is waiting on -- a URL that
  // blinks from a full quote to `#/desk` and back reads as the link having
  // failed, right at the moment the recipient is deciding whether to trust it.
  useEffect(() => {
    if (!deepLinkRan.current && initialLink.quote) return
    writeDeepLink(view, lastRequest)
  }, [view, lastRequest, initialLink])

  const moneyCtx: MoneyContext = {
    currency: settings.currency,
    inrPerUsd,
  }

  // Every hook above runs unconditionally; the gates below are the last thing
  // before render, so switching between the sign-in screen and the desk never
  // changes the hook order.
  if (auth.loading) {
    // Deliberately blank rather than a spinner. This resolves in one local
    // request, and the only thing worse than a brief blank frame is a closed
    // desk that flashes its contents before deciding to ask for a password.
    return <div className="h-full bg-background" aria-busy="true" />
  }

  if (auth.unreachable) {
    // A backend that is down is not an unauthenticated user. Showing a
    // sign-in form here would send someone to type credentials at a server
    // that cannot answer.
    return (
      <div className="flex h-full items-center justify-center bg-background p-6">
        <div className="max-w-sm space-y-2 text-center">
          <p className="text-lead font-semibold text-risk">Cannot reach the desk</p>
          <p className="text-caption leading-relaxed text-muted-foreground">
            The backend is not answering. Start it with{' '}
            <span className="desk-num">uv run uvicorn backend.main:app --reload</span> and reload
            this page.
          </p>
        </div>
      </div>
    )
  }

  if (auth.status?.enforced && !auth.user) {
    return (
      <div className="h-full bg-background">
        <SignIn />
      </div>
    )
  }

  return (
    <MoneyProvider value={moneyCtx}>
    <div className="flex h-full flex-col overflow-hidden">
      {/* First focusable thing in the document. Without it, reaching the
          desk's primary action by keyboard meant tabbing through the whole
          navigation first -- the top bar's screen links and the section rail
          both precede <main> in DOM order. */}
      <a href="#desk-main" className="skip-link">
        Skip to the desk
      </a>
      <TopBar
        view={view}
        onSelectView={setView}
        dataThrough={latestDate}
        onNewQuote={goToQuoteForm}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenAccounts={() => setAccountsOpen(true)}
        onOpenAlerts={() => setAlertsOpen(true)}
        alertsRefreshKey={alertsRefreshKey}
      />
      <div className="flex min-h-0 flex-1">
        {/* The section rail belongs to the Voyage Desk and mounts with it --
            and only once a quote has produced the panels it points at. The
            old arrangement kept these five links in the top bar on every
            screen, where four of them scrolled to nothing. */}
        {view === 'desk' && envelope?.quote && <SectionRail />}
        {/* F-52: the nav-rail/top-bar z-50 fix (F-48) only restored the NAV
            controls' own clickability through a drawer's backdrop -- it
            never fixed the actual PAGE CONTENT here, which had no z-index
            either. The quote drawer that originally motivated this is gone
            (its form is now permanently in-page, see quote-form.tsx), but
            Settings/Help/Accounts/Alerts still open as real overlays with a
            `fixed z-40/z-50` backdrop each, so the same fix is still load-
            bearing: without it, opening any one of them while looking at
            Portfolio/Fragility/Tonnage Field/Port Twin would silently cover
            that page's own controls -- Run analysis, Run sweep, any button
            in here -- with the backdrop. Confirmed live via
            elementFromPoint at the time: it resolved to the backdrop div,
            not the button. DOM order (a drawer renders after this <main>)
            keeps the drawer panel itself on top where it actually overlaps
            this element's right edge. */}
        <main
          id="desk-main"
          tabIndex={-1}
          className="relative z-50 min-w-0 flex-1 overflow-y-auto p-2 focus:outline-none"
        >
          <Suspense fallback={<ViewLoading />}>
          {view === 'season-plan' ? (
            <SeasonPlanPage ports={ports} latestDate={latestDate} />
          ) : view === 'port-twin' ? (
            <PortTwinPage ports={ports} />
          ) : view === 'tonnage-field' ? (
            <TonnageFieldPage />
          ) : view === 'fragility' ? (
            <FragilityPage ports={ports} />
          ) : view === 'ledger' ? (
            <LedgerPage />
          ) : view === 'portfolio' ? (
            <PortfolioPage ports={ports} />
          ) : (
            <VoyageDeskPage
              envelope={envelope}
              ports={ports}
              portsError={portsError}
              latestDate={latestDate}
              chokepoints={chokepoints}
              stages={stages}
              solving={solving}
              error={quoteError}
              onSubmit={handleSubmit}
              quoteFormFocus={quoteFormFocus}
              vessels={lastVessels}
              lastRequest={lastRequest}
            />
          )}
          </Suspense>
        </main>
      </div>
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
        fx={{ inrPerUsd, asOf: fxAsOf }}
      />
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
      <AccountsDrawer open={accountsOpen} onClose={() => setAccountsOpen(false)} />
      <AlertsDrawer
        open={alertsOpen}
        onClose={() => {
          setAlertsOpen(false)
          setAlertsRefreshKey((k) => k + 1)
        }}
      />
    </div>
    </MoneyProvider>
  )
}

/** AuthProvider wraps the shell rather than living inside it, so the shell
 *  can read the session with a hook and still decide, before rendering
 *  anything, whether this deployment wants a sign-in first. */
function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}

export default App
