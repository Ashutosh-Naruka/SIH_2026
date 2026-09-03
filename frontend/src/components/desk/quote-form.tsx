import { useEffect, useMemo, useRef, useState } from 'react'
import { Panel } from '@/components/desk/panel'
import { TermText } from '@/components/desk/term'
import { Combobox, type ComboOption } from '@/components/ui/combobox'
import { prettyPort } from '@/lib/format'
import type { PortListing, QuoteRequest, VesselClass, VesselInput } from '@/lib/types'
import { cn } from '@/lib/utils'
import { EXAMPLE_CAPTION, workedExample } from '@/lib/worked-example'

interface QuoteFormProps {
  ports: PortListing[]
  portsError: string | null
  latestDate: string | null
  submitting: boolean
  onSubmit: (req: QuoteRequest) => void
  /** Focus and scroll here on mount when a caller (the top bar's New Quote
   *  button, from another screen) asks to be brought back to this form. */
  focusToken?: number
}

const VESSEL_CLASSES: VesselClass[] = ['Capesize', 'Panamax', 'Supramax', 'Handysize']
const COMMODITIES = [
  'Thermal Coal',
  'Coking Coal',
  'Iron Ore',
  'Bauxite',
  'Alumina',
  'Limestone',
  'Grain',
  'Fertiliser',
  'Petcoke',
  'Clinker',
  'Dry Bulk',
].map((c) => ({ value: c, label: c }))

interface VesselDraft {
  key: string
  vesselId: string
  vesselClass: VesselClass
  port: string
  availableFrom: string
  dwt: string
  draftM: string
  loaM: string
  beamM: string
  speedKn: string
  ladenFuel: string
  ballastFuel: string
}

/**
 * Monotonic source of React list keys for vessel rows.
 *
 * This used to be `Date.now()` plus a PRNG suffix, which needed a reviewed
 * exception in tests/test_no_synthetic_frontend_data.py -- a tripwire that
 * fails the build on any hash- or PRNG-derived value under frontend/src. The
 * exception was correct (a DOM key is not a data value) but it was pinned BY
 * LINE NUMBER, so any edit above this point broke the build twice over: once
 * on the offender scan, once on the stale-entry scan. It fired three times.
 *
 * A counter is also simply the better key. Nothing here needs randomness --
 * it needs uniqueness within one mounted list, which an incrementing integer
 * guarantees outright, where two PRNG draws only make a collision unlikely.
 */
let vesselKeySeq = 0

function newVesselDraft(n: number, availableFrom: string): VesselDraft {
  vesselKeySeq += 1
  return {
    key: `vessel-${vesselKeySeq}`,
    vesselId: `SAIL_${n}`,
    vesselClass: 'Panamax',
    port: '',
    availableFrom,
    dwt: '75000',
    draftM: '13.5',
    loaM: '225',
    beamM: '32.2',
    speedKn: '13',
    ladenFuel: '32',
    ballastFuel: '27',
  }
}

function vesselIsValid(v: VesselDraft): boolean {
  return (
    v.vesselId.trim() !== '' &&
    v.port !== '' &&
    [v.dwt, v.draftM, v.loaM, v.beamM, v.speedKn, v.ladenFuel, v.ballastFuel].every(
      (x) => Number(x) > 0,
    )
  )
}

const inputCls =
  'h-7 w-full rounded-sm border border-input bg-surface px-2 text-lead text-foreground ' +
  'transition-colors placeholder:text-muted-foreground/70 hover:border-muted-foreground/60 ' +
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted-foreground'

/**
 * The cargo input, on the page rather than behind it.
 *
 * This used to be a slide-out drawer: a full-viewport overlay that opened for
 * one submit and then closed, taking the cargo's own details with it -- to
 * see what you had just asked for, or to change one field and re-run, you
 * reopened the drawer from scratch. That is not how the desk's own other
 * screens work: Season Plan, Fragility and Tonnage Field all put their inputs
 * in a panel at the top of the page, left standing after a run, with results
 * appearing below. This form now follows that same shape -- it never closes,
 * the last cargo you priced is still sitting in it, and changing a field and
 * pressing Run quote again is the whole interaction for "what if" questions.
 */
export function QuoteForm({
  ports,
  portsError,
  latestDate,
  submitting,
  onSubmit,
  focusToken,
}: QuoteFormProps) {
  const addDaysIso = (iso: string, days: number) =>
    new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000)
      .toISOString()
      .slice(0, 10)

  // Snapshot of the mount-time fallback ("today", used only because
  // `latestDate` hasn't arrived from the parent's /meta fetch yet) -- frozen
  // in a ref so it stays fixed across re-renders. Bugfix: an earlier version
  // recomputed this fallback live from `latestDate` on every render, so by
  // the time the resync effect below ran (after `latestDate` had already
  // updated and triggered the very re-render that made the effect fire),
  // the "fallback to compare against" had already silently become today's
  // *real* value -- the prev-vs-fallback check could never match, and the
  // resync never fired at all, permanently leaving `asOf` on today's date
  // even when that's after the real data the backend has (as it is
  // whenever "today" has moved past the last real trading day).
  const fallback = useRef(latestDate ?? new Date().toISOString().slice(0, 10)).current
  const anchorDate = latestDate ?? fallback

  const lead = 14
  const width = 7

  const [cargoVolume, setCargoVolume] = useState('75000')
  const [originPort, setOriginPort] = useState('')
  const [destPort, setDestPort] = useState('')
  const [asOf, setAsOf] = useState(fallback)
  const [laycanStart, setLaycanStart] = useState(addDaysIso(fallback, lead))
  const [laycanEnd, setLaycanEnd] = useState(addDaysIso(fallback, lead + width))
  const [contractTermDays, setContractTermDays] = useState('30')
  const [commodity, setCommodity] = useState('Thermal Coal')
  const [riskTolerance, setRiskTolerance] = useState('0')
  const [vessels, setVessels] = useState<VesselDraft[]>([])
  const [revenueUsd, setRevenueUsd] = useState('')
  const [vesselsOpen, setVesselsOpen] = useState(false)

  const firstFieldRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLDivElement>(null)

  // F-02 fix: `latestDate` arrives from the parent's own /meta fetch, which
  // resolves strictly after this component's first render -- so the
  // useState() calls above always seed off `fallback` ("today"), never off
  // the real latest-market-date. Re-sync the three date fields the moment the
  // real latestDate arrives -- but only once, and only if the user hasn't
  // already edited them away from the (wrong) fallback in the meantime.
  const resynced = useRef(false)
  useEffect(() => {
    if (resynced.current || !latestDate) return
    resynced.current = true
    setAsOf((prev) => (prev === fallback ? latestDate : prev))
    setLaycanStart((prev) =>
      prev === addDaysIso(fallback, lead) ? addDaysIso(latestDate, lead) : prev,
    )
    setLaycanEnd((prev) =>
      prev === addDaysIso(fallback, lead + width) ? addDaysIso(latestDate, lead + width) : prev,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestDate])

  // "New Quote" from the top bar, or from another screen, brings the reader
  // back to this exact form rather than opening a second one -- there is
  // only ever one cargo being priced. `focusToken` changes on every such
  // request (see App.tsx); 0 is the initial mount and does not scroll.
  useEffect(() => {
    if (!focusToken) return
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    firstFieldRef.current?.focus()
  }, [focusToken])

  const portOptions = useMemo<ComboOption[]>(
    // F-39: p.name is the raw port id (e.g. "Newcastle_AU") -- prettyPort
    // matches every other screen's display convention ("Newcastle AU").
    () => ports.map((p) => ({ value: p.code, label: prettyPort(p.name), hint: p.code })),
    [ports],
  )

  const vesselsValid = vessels.every(vesselIsValid)
  const sameEnds = originPort !== '' && originPort === destPort
  const canSubmit = originPort !== '' && destPort !== '' && !sameEnds && vesselsValid

  function updateVessel(key: string, patch: Partial<VesselDraft>) {
    setVessels((vs) => vs.map((v) => (v.key === key ? { ...v, ...patch } : v)))
  }

  /**
   * Load the worked example into this form -- and stop there.
   *
   * Fills the visible fields rather than submitting on click, so the example
   * is legible before it is priced: a reader sees the cargo, the route and
   * the laycan it stands for, and "Run quote" below is the same button any
   * typed cargo uses. Nothing about the result is stored or canned.
   */
  function fillWithExample() {
    const ex = workedExample(anchorDate)
    setCargoVolume(String(ex.cargo_volume_dwt))
    setOriginPort(ex.origin_port)
    setDestPort(ex.dest_port)
    setAsOf(ex.as_of ?? anchorDate)
    setLaycanStart(ex.laycan_start)
    setLaycanEnd(ex.laycan_end)
    setContractTermDays(String(ex.contract_term_days))
    setCommodity(ex.commodity)
    setRiskTolerance(String(ex.risk_tolerance ?? 0))
    // The date fields have been set deliberately; the F-02 resync must not
    // come along afterwards and move them back to its own defaults.
    resynced.current = true
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const vesselInputs: VesselInput[] | undefined =
      vessels.length > 0
        ? vessels.map((v) => ({
            vessel_id: v.vesselId,
            vessel_class: v.vesselClass,
            current_port: v.port as VesselInput['current_port'],
            available_from: v.availableFrom,
            dwt: Number(v.dwt),
            draft_m: Number(v.draftM),
            loa_m: Number(v.loaM),
            beam_m: Number(v.beamM),
            speed_kn: Number(v.speedKn),
            laden_fuel_consumption_tpd: Number(v.ladenFuel),
            ballast_fuel_consumption_tpd: Number(v.ballastFuel),
          }))
        : undefined

    onSubmit({
      cargo_volume_dwt: Number(cargoVolume),
      origin_port: originPort as QuoteRequest['origin_port'],
      dest_port: destPort as QuoteRequest['dest_port'],
      laycan_start: laycanStart,
      laycan_end: laycanEnd,
      contract_term_days: Number(contractTermDays),
      commodity,
      as_of: asOf || undefined,
      risk_tolerance: Number(riskTolerance),
      vessels: vesselInputs,
      revenue_usd: vessels.length > 0 && revenueUsd !== '' ? Number(revenueUsd) : undefined,
    })
  }

  return (
    <div ref={formRef} id="quote-form">
      <Panel title="New Charter Quote">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Field label="Cargo volume (tonnes)">
              <input
                ref={firstFieldRef}
                type="number"
                min={1}
                required
                value={cargoVolume}
                onChange={(e) => setCargoVolume(e.target.value)}
                className={cn(inputCls, 'font-mono')}
              />
            </Field>
            <Field label="Cargo type">
              <Combobox
                value={commodity}
                onChange={setCommodity}
                options={COMMODITIES}
                allowFreeText
                placeholder="Type or pick…"
              />
            </Field>
            <Field label="Origin port">
              <Combobox
                value={originPort}
                onChange={setOriginPort}
                options={portOptions}
                placeholder={portsError ? 'Ports unavailable' : 'Search ports…'}
                disabled={portOptions.length === 0}
              />
            </Field>
            <Field label="Destination port">
              <Combobox
                value={destPort}
                onChange={setDestPort}
                options={portOptions}
                placeholder={portsError ? 'Ports unavailable' : 'Search ports…'}
                disabled={portOptions.length === 0}
              />
            </Field>

            <Field
              label="Price as of"
              hint={
                latestDate ? `Real data runs through ${latestDate}.` : undefined
              }
            >
              <input
                type="date"
                value={asOf}
                max={latestDate ?? undefined}
                onChange={(e) => {
                  const v = e.target.value
                  // Belt-and-braces: `max` stops the picker UI, but a
                  // typed/pasted value can still slip past it in some
                  // browsers -- clamp here too so this field can never hold
                  // a date the backend has no data for.
                  setAsOf(latestDate && v > latestDate ? latestDate : v)
                }}
                className={cn(inputCls, 'font-mono')}
              />
            </Field>
            <Field label="Contract term (days)">
              <input
                type="number"
                min={1}
                required
                value={contractTermDays}
                onChange={(e) => setContractTermDays(e.target.value)}
                className={cn(inputCls, 'font-mono')}
              />
            </Field>
            <Field label="Laycan start">
              <input
                type="date"
                required
                value={laycanStart}
                onChange={(e) => setLaycanStart(e.target.value)}
                className={cn(inputCls, 'font-mono')}
              />
            </Field>
            <Field label="Laycan end">
              <input
                type="date"
                required
                min={laycanStart}
                value={laycanEnd}
                onChange={(e) => setLaycanEnd(e.target.value)}
                className={cn(inputCls, 'font-mono')}
              />
            </Field>
          </div>

          <Field label={`Risk tolerance — ${riskTolerance}`} className="max-w-xs">
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={riskTolerance}
              onChange={(e) => setRiskTolerance(e.target.value)}
              className="h-1 w-full cursor-pointer appearance-none rounded bg-muted accent-primary"
            />
            <div className="flex justify-between text-micro uppercase tracking-wide text-muted-foreground">
              <span>Risk-neutral</span>
              <span>Risk-averse</span>
            </div>
          </Field>

          <div className="border-t border-border pt-2">
            <button
              type="button"
              onClick={() => setVesselsOpen((v) => !v)}
              className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              aria-expanded={vesselsOpen}
            >
              <span
                className={cn('transition-transform', vesselsOpen && 'rotate-90')}
                aria-hidden="true"
              >
                ▸
              </span>
              Vessels in hand (optional)
              {vessels.length > 0 && (
                <span className="desk-num font-normal normal-case text-muted-foreground">
                  · {vessels.length} added
                </span>
              )}
            </button>

            {vesselsOpen && (
              <div className="mt-2 space-y-2">
                {vessels.map((v, i) => (
                  <div key={v.key} className="space-y-2 rounded border border-border p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">
                        Vessel {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => setVessels((vs) => vs.filter((x) => x.key !== v.key))}
                        className="text-micro font-semibold uppercase tracking-wide text-risk hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      <input
                        value={v.vesselId}
                        onChange={(e) => updateVessel(v.key, { vesselId: e.target.value })}
                        placeholder="Vessel ID"
                        className={cn(inputCls, 'font-mono')}
                      />
                      <select
                        value={v.vesselClass}
                        onChange={(e) =>
                          updateVessel(v.key, { vesselClass: e.target.value as VesselClass })
                        }
                        className={inputCls}
                      >
                        {VESSEL_CLASSES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <select
                        value={v.port}
                        onChange={(e) => updateVessel(v.key, { port: e.target.value })}
                        className={cn(inputCls, 'col-span-2')}
                      >
                        <option value="">Current port…</option>
                        {ports.map((p) => (
                          <option key={p.code} value={p.code}>
                            {prettyPort(p.name)}
                          </option>
                        ))}
                      </select>
                      {(
                        [
                          ['dwt', 'DWT'],
                          ['draftM', 'Draft m'],
                          ['loaM', 'LOA m'],
                          ['beamM', 'Beam m'],
                          ['speedKn', 'Speed kn'],
                          ['ladenFuel', 'Laden t/d'],
                          ['ballastFuel', 'Ballast t/d'],
                        ] as const
                      /* These seven carried their name in `placeholder` only,
                         and every one of them is pre-filled from
                         newVesselDraft() -- so the label was gone the moment
                         the field was rendered. Persistent labels instead. */
                      ).map(([field, label]) => (
                        <label key={field} className="flex flex-col gap-0.5">
                          <span className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">
                            {label}
                          </span>
                          <input
                            type="number"
                            step="0.1"
                            min={0.1}
                            aria-label={label}
                            value={v[field]}
                            onChange={(e) => updateVessel(v.key, { [field]: e.target.value })}
                            className={cn(inputCls, 'font-mono')}
                          />
                        </label>
                      ))}
                      <label className="col-span-2 flex flex-col gap-0.5">
                        <span className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">
                          Available from
                        </span>
                        <input
                          type="date"
                          aria-label="Available from"
                          value={v.availableFrom}
                          onChange={(e) => updateVessel(v.key, { availableFrom: e.target.value })}
                          className={cn(inputCls, 'font-mono')}
                        />
                      </label>
                    </div>
                    {!vesselIsValid(v) && (
                      <p className="text-micro uppercase text-risk">
                        Needs an ID, a current port, and positive figures.
                      </p>
                    )}
                  </div>
                ))}

                {vessels.length > 0 && (
                  <Field label="Cargo revenue (USD, optional)" className="max-w-xs">
                    <input
                      type="number"
                      min={0}
                      placeholder="Blank means no vessel assigned to cargo"
                      value={revenueUsd}
                      onChange={(e) => setRevenueUsd(e.target.value)}
                      className={cn(inputCls, 'font-mono')}
                    />
                  </Field>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setVessels((vs) => [...vs, newVesselDraft(vs.length + 1, anchorDate)])
                  }}
                  className="text-caption font-semibold uppercase tracking-wide text-primary hover:underline"
                >
                  + Add vessel
                </button>
              </div>
            )}
          </div>

          {sameEnds && <p className="text-body text-risk">Origin and destination must differ.</p>}
          {portsError && <p className="text-body text-risk">{portsError}</p>}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <button
              type="submit"
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-sm bg-primary px-4 text-lead font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 active:bg-primary/95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!canSubmit || submitting}
              // A disabled button with no stated reason reads as broken. Say
              // which field is still missing instead.
              title={
                submitting
                  ? 'Solving…'
                  : sameEnds
                    ? 'Origin and destination must differ.'
                    : originPort === '' || destPort === ''
                      ? 'Pick an origin and a destination port first.'
                      : !vesselsValid
                        ? 'Every vessel needs an ID, a current port, and positive figures.'
                        : 'Run the quote'
              }
            >
              {submitting ? 'Solving…' : 'Run quote'}
            </button>
            <button
              type="button"
              onClick={fillWithExample}
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-sm border border-border bg-surface-2 px-3 text-caption font-semibold text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              title={`Fill this form with a real cargo: ${EXAMPLE_CAPTION}`}
            >
              Load worked example
            </button>
          </div>
        </form>
      </Panel>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      {/* Every glossary word in the label becomes explainable on hover and on
          keyboard focus. */}
      <span className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
        <TermText text={label} />
      </span>
      {children}
      {hint && <span className="text-micro leading-tight text-muted-foreground">{hint}</span>}
    </label>
  )
}
