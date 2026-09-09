# System Architecture

**Chartering Desk** · PS ID SIH26006 · Team Code Hackerz

This document describes the components, the data flow between them, and the responsibility
boundary each layer is held to. For the method behind every individual engine, and why that
method rather than another, see [`technical-reference.md`](technical-reference.md).

---

## 1. High-level flow

```text
                 Logistics manager
                        |
                        |  tonnes . origin . destination . laycan . term . (vessel)
                        v
        +-----------------------------------------------+
        |  React + TypeScript dashboard   (Vercel)      |
        +-----------------------+-----------------------+
                                |  /api  (server-side proxy)
                                v
        +-----------------------------------------------+
        |  FastAPI backend  (Render)  .  21 endpoints   |
        +-----------------------+-----------------------+
                                |
        +-----------------------v-----------------------+
        |  MARKET LAYER                                 |
        |  14 yrs of real indices -> XGBoost quantile   |
        |  forecast . P10/P50/P90 at 7 / 30 / 90 days   |
        +-----------------------+-----------------------+
                                |  rate fan ($/day)
        +-----------------------v-----------------------+
        |  DECISION LAYER                               |
        |  ceiling -> LSMC option value of waiting      |
        |          -> weather tax on the WAIT branch    |
        |          -> LOCK / WAIT + exercise boundary   |
        +------+-----------------------------+----------+
               |                             |
   +-----------v-----------+   +-------------v-----------+
   |  PHYSICAL LAYER       |   |  RISK LAYER             |
   |  fleet-mix frontier   |   |  rate regime anomaly    |
   |  port feasibility     |   |  port congestion        |
   |  CP-SAT scheduling    |   |  chokepoint disruption  |
   |  route + chokepoints  |   |  cyclone climatology    |
   |  landed cost          |   |  CII carbon projection  |
   +-----------+-----------+   +-------------+-----------+
               +--------------+--------------+
                              v
        +-----------------------------------------------+
        |  ACCOUNTABILITY LAYER                         |
        |  append-only decision ledger . fragility      |
        |  sweep . per-field provenance labels          |
        +-----------------------------------------------+
                              |
                              v
                   Dated, explained recommendation
```

---

## 2. The offline data pipeline

Nothing in the request path fetches data. Every external source is pulled by a build-time
harvester, written to disk, and committed, so a clean clone serves real numbers with no
network access and no credentials.

```text
raw_data/            src/data_builders/          src/data/               src/ml/
(raw external   -->  (harvesters and        -->  (processed parquet -->  (feature build,
 pulls, never         transforms)                 and csv, committed)     training, export)
 hand-edited)
                                                        |
                                                        v
                                              src/data/models/*.ubj
                                              (three XGBoost quantile
                                               models, one per horizon)
```

Harvesters live in `src/data_builders/`, where `harvest_portwatch.py` is the reference pattern
(resumable, rate-limited, cached, offline-safe). The one deliberate exception to build-time
fetching is the rolling seven-day marine wave forecast, which cannot be harvested once; it is
cached for 12 hours and degrades to "no signal" rather than raising into a quote.

---

## 3. Components

### 3.1 Frontend: `frontend/`

React 19 + TypeScript on Vite, styled with Tailwind. Five screens, reached from the left rail:

| Screen | Responsibility |
|---|---|
| **Voyage Desk** | The main screen. Charter-quote form, LOCK/WAIT verdict, forecast fan, risk feed, fleet-mix frontier, port constraints, voyage assignments, landed cost, backhaul, route map |
| **Port Twin** | Per-port reality: berth register, tide rule, empirical wait and handling percentiles, raw recent port calls |
| **Tonnage Field** | Physical ship-supply tightness by vessel class and ocean basin, plus the identification-gate verdict |
| **Fragility** | Multi-variable flip-point sweep: how far each input must move before the recommendation changes |
| **Ledger** | Live append-only decision record, and a structurally separate historical replay |

Charts are hand-rolled SVG; there is no charting library. `frontend/src/lib/api.ts` is the single
API client, and `POST /quote/stream` drives a server-sent-events progress indicator so a
multi-second solve reports which stage it is in rather than spinning.

### 3.2 Backend: `backend/`

FastAPI. Every route lives in `backend/main.py`; `backend/serialize.py` converts domain models to
wire format. Conventions that hold across all 21 endpoints:

- Ports are code strings resolved by one shared helper.
- An unknown port or vessel class returns **422** with the valid list.
- Missing market data returns **503**.
- A structurally infeasible quote still returns **200** with a typed envelope naming the problem
  because "no ship fits" is a real answer, not an error.

Models and the on-disk market/port-call data are loaded once into a long-lived process at
startup, not per request.

### 3.3 Domain logic: `src/`

| Package | Responsibility |
|---|---|
| `src/ml/` | Feature construction, model training and evaluation, the live forecast loader |
| `src/opt/` | The optimizer: quote orchestration, ceiling, optimal stopping, Monte Carlo, fleet mix, voyage scheduling, routing, congestion, risk, landed cost, backhaul, repositioning, portfolio, backtest, ledger |
| `src/tonnage/` | Ship-supply reconstruction from satellite port calls: basins, class mix, stock-flow, forward projection, supply curve, identification gate |
| `src/berth_truth/` | Port reality: berth registers, tide authority, port-call facts, empirical wait and handling distributions |
| `src/fragility/` | Tiered flip-point search over the whole decision |
| `src/emissions/` | IMO carbon-intensity (CII) arithmetic and rating bands |
| `src/anchorage/` | Sentinel-1 SAR CFAR vessel detection and census |
| `src/alerts/` | Standing alert definitions and background evaluation |
| `src/impact/` | Demand elasticity and Almgren-Chriss optimal execution. **Experimental, not wired into the product** |
| `src/auth/` | Accounts, roles and session cookies |
| `src/data_builders/` | The harvesters and transforms that build `src/data/` from `raw_data/` |
| `src/config/` | Sample-generation and pipeline configuration |

---

## 4. Layer responsibilities, and the boundaries between them

The boundaries matter as much as the components; several of them are deliberate constraints
rather than incidental structure.

**The model owns the market, and nothing else.** The forecasting model predicts the percentage
change in a published market index per vessel class. It does not know the route, the ship, the
fuel bill or the schedule. Distance, transit time, bunker cost, port dues and feasibility are the
optimizer's own voyage arithmetic, computed on top of the forecast fan. Mixing physics into the
forecast would make the walk-away price un-auditable.

**The ceiling is physics-free by design.** `opt/ceiling.py` prices the *market* decision only,
meaning the highest fixed daily rate at which locking beats spot. Voyage costs belong to the
voyage estimator.

**Uncertainty is propagated, never collapsed.** The forecast is a P10/P50/P90 band at every
horizon because the optimal-stopping solve, the savings distribution and the portfolio mix all
consume the width of that band, not its midpoint.

**Provenance never flows uphill.** Every field carries one of five labels (OBSERVED, ESTIMATED,
INFERRED, MODEL_DERIVED, DECLARED) defined in `src/data_builders/provenance.py`. A value
computed from a real input is at best MODEL_DERIVED; it never inherits its input's label. This is what lets the
interface show, per landed-cost component, how much of a number is measured versus assumed.

**A fallback that is invisible is a defect.** Where a fallback is genuinely correct, the sea
router failing offline for instance, the returned value carries a flag saying it happened
(`opt/route_trace.py`'s `is_great_circle_fallback`). Everywhere else, a named exception is
preferred to a silent default.

**Missing is not zero.** A cost component that cannot be computed renders as unavailable. There is
deliberately no single all-in landed-cost total, because summing an unknown into a total
misrepresents "we don't know" as "this costs nothing".

---

## 5. Deployment topology

```text
   Browser
      |
      |  https://sih-2026-nu-lake.vercel.app
      v
   Vercel  (static Vite build of frontend/)
      |
      |  rewrite: /api/:path*  -->  backend origin   (server-side, same-origin to the browser)
      v
   Render  (uvicorn backend.main:app)
      |
      +-- src/data/*.parquet, src/data/models/*.ubj, raw_data/   (committed, read from disk)
```

The two halves are split because their resource shapes differ: the backend loads XGBoost models
and Polars frames into a long-lived process at startup, which is the wrong fit for a
cold-start-per-request serverless function, while the frontend is a static build any host can
serve.

Vercel proxies `/api/*` server-side rather than having the browser call the backend directly, so
the backend's `samesite="lax"` session cookie keeps working without being loosened. Full runbook,
including the free-tier memory behaviour, is in [`deployment.md`](deployment.md).
