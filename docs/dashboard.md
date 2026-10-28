# Dashboard

ImmuReach is a single-page React application that lets users browse modelled
vaccination coverage across the 26 provinces and 519 health zones (zones de
santé) of the Democratic Republic of Congo. It is built around the runtime
GeoJSONs described in [data.md](./data.md).

This document covers the runtime architecture: tech stack, layout, state, the
ECharts chart contract, and the conventions to follow when extending the app.

---

## Tech stack

| Layer            | Choice                            | Why                                           |
| ---------------- | --------------------------------- | --------------------------------------------- |
| Core             | React 18 + TypeScript + Vite      | Standard SPA stack                            |
| Styling          | Tailwind v3 + shadcn/ui           | Utility-first; shadcn for non-chart UI        |
| Charts           | ECharts via `echarts-for-react`   | One library for both maps and bar charts      |
| Client state     | Zustand                           | Shared filter state across panels             |
| Layout           | CSS Grid via Tailwind             | No layout libraries                           |
| Build            | `vite build` → `dist/`            | `npm run build`                               |
| Deploy           | `gh-pages` to GitHub Pages        | `npm run deploy`                              |

The repository also vendors a Python pipeline for the data layer (see
[data.md](./data.md)); the dashboard itself consumes the two
`public/data/*.geojson` files, the `public/data/profile.json` sidecar and the
`public/data/household_model/` files produced by that pipeline.

---

## Project layout 

```
src/
├── main.tsx                     # Vite entry, registers the 'dashboard' ECharts theme
├── App.tsx                      # DataProvider > Header + DashboardGrid
│
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   └── DashboardGrid.tsx    # one block per section (ecv, zerodose, determinants, actions, …)
│   ├── common/
│   │   ├── Ribbon.tsx           # sticky section tabs + year / age / milieu / province / zone filters
│   │   ├── InfoBubble.tsx, Notes.tsx, PlaceholderPanel.tsx, YearSelector.tsx
│   ├── features/                # one folder per section, each with an index.ts barrel
│   │   ├── ecv/                 # cards/, charts/, maps/ (EcvZeroDoseMap, EcvVaccineBarChart, …)
│   │   ├── model/               # zerodose section: cards/, charts/, maps/, tables/, ProfilingPanel
│   │   ├── determinants/        # cards/, charts/ (treemap, PDP, behaviour map)
│   │   └── actions/             # cards/, charts/ (counterfactual levers, segments)
│   └── ui/                      # shadcn-generated primitives (button, table, tabs, toggle)
│
├── context/
│   └── DataContext.tsx          # loads public/data/*, registers 'drc-provinces' / 'drc-zones'
│
├── hooks/                       # index.ts barrel re-exports everything below
│   ├── common/                  # useProvinceData, useZoneData, useTableData,
│   │                            # useMapSelectionSync, useMapHoverSync, useProvinceAntennes, …
│   ├── ecv/                     # useEcvZeroDoseMapData, useEcvVaccCovRow, useEcvScope, …
│   ├── model/                   # useAccessibilityProfile
│   ├── determinants/            # useRelativeInfluence, usePartialDependence, …
│   └── actions/                 # useCounterfactuals
│
├── store/
│   └── dashboardStore.ts        # Zustand: selections + setters
│
├── lib/
│   ├── charts/                  # option factories (*Options.ts) + theme.ts
│   └── utils/                   # csv parsing, constants, name joins, formatting, cn()
│
└── types/
    └── index.ts                 # MetricKey, ProvinceRow, ZoneRow, EcvVaccCovRow, …
```

---

## Page layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Header                                                          │
│   ImmuReach                                                     │
│   Reaching Missed Communities in DRC                            │
├─────────────────────────────────────────────────────────────────┤
│ Ribbon (sticky)                                                 │
│   section tabs · Année · Province · Zone                        │
├─────────────────────────────────────────────────────────────────┤
│ Indicator cards                                                 │
│   [BCG] [Rota] [Var] [VAA] [Polio] [PCV] [0-dose pen] [0-dose all] │
├──────────────────────────┬──────────────────────────────────────┤
│ Coverage map             │ Bar chart                            │
│ (geo by selected metric) │ (per-province or per-zone, sorted)   │
│                          │   [Coverage %] [# Children] [# Births/Year] │
├──────────────────────────┴──────────────────────────────────────┤
│ [Data] [Profiling]                       Survey year [2023][2024] │
├─────────────────────────────────────────────────────────────────┤
│ Data table  -or-  Profiling chart (accessibility)               │
└─────────────────────────────────────────────────────────────────┘
```

The bottom row is a tab switcher; the year selector only appears when the
Profiling tab is active.

---

## Interaction flow

The dashboard is driven by a small set of selections in the Zustand store.
Selecting any control fans out to the other panels via store subscriptions
— no prop drilling.

1. **Choose a province** by clicking it on the map (or on a bar in the bar
   chart, a row in the province table, or the ribbon's Province select). The
   map switches from provinces to zones and zooms into the province's bbox, the
   bar chart re-sorts, the indicator cards re-read from the province row
   (already pop-weighted), and the data table switches to per-zone mode.
2. **Pick a metric** by clicking one of the 8 cards. The map's choropleth and
   the bar chart redraw against that metric.
3. **Toggle the bar-chart unit**: coverage %, child count
   (`pred_<metric>_count`), or annual births.
4. **Click a zone** on the map, the bar chart, or the table to drill into the
   per-zone detail view (`ZoneDetail` — demographics + per-metric comparison
   bars). The indicator cards now read directly from that zone's row. The map
   stays at province zoom — drilling into a single zone does not zoom
   further. The ribbon's Zone select shows the zone; setting it (or the
   Province select) back to "Toutes" drills back up.
5. **Hover** a bar or a map shape to highlight the matching item in the
   other panel; both read and write `hoveredZoneId` in the store (it holds a
   province id at national level, a zone id once a province is selected).

---

## State store (`src/store/dashboardStore.ts`)

```ts
{
  activeSection:      DashboardSection,     // ribbon tab: 'ecv' | 'zerodose' | 'determinants' | …
  selectedMetric:     MetricKey,            // one of 8 pred_* keys
  selectedProvince:   string | null,        // cleaned displayName, e.g. "Kwilu"
  selectedZoneId:     string | null,        // ZoneRow.id (e.g. "zone-142")
  hoveredZoneId:      string | null,        // cross-panel hover (province or zone id)
  viewMode:           'data' | 'profiling', // lower-panel tab
  selectedYear:       2023 | 2024,          // collection year
  selectedMilieu:     Milieu,               // ECV only: 'all' | 'urbain' | 'rural'
  selectedAgeGroup:   AgeGroup,             // ECV only: '6-11' | '12-23' | '6-23'
  showAntenne:        boolean,              // map antenne overlay
  selectedRiVariable: string | null,        // determinants: PDP variable shown
  selectedSegment:    CounterfactualSegment | null, // actions: lever filter
}
```

`setProvince()` also clears `selectedZoneId` and turns `showAntenne` off, so
navigating provinces resets the drill-down. `setActiveSection()` snaps
`selectedYear` to a year the new section has data for. Components read with single-field selectors so re-renders
are cheap:

```ts
const selectedMetric = useDashboardStore(s => s.selectedMetric)
```

---

## Data flow

1. `DataProvider` (in `context/DataContext.tsx`) `fetch`es
   `data/provinces.geojson`, `data/zones.geojson`, and `data/profile.json`
   on mount (the third feeds the Profiling-mode panel; see below).
2. For each feature it produces a row:
   ```ts
   ProvinceRow { id, displayName, mapKey, properties }
   ZoneRow     { id, displayName, mapKey, provinceId, properties }
   ```
   - `displayName` is `cleanName(q101 or q103)` — `"kl Kwilu Province"` →
     `"Kwilu"` — for human-readable UI.
   - `mapKey` is the **raw** prefixed name. We use it as the ECharts shape key
     because two zones can share a cleaned name (e.g. "Bili" exists in both
     Bas Uele and Nord Ubangi). Indexing by `mapKey` keeps each shape
     uniquely addressable.
3. The two GeoJSONs are also registered as ECharts maps named `drc-provinces`
   and `drc-zones`, with `name: feature.properties.q101 | q103` injected so
   the map shape lookup matches `mapKey`.
4. At the same time, `DataContext` walks the province geometries and stores a
   per-province bbox (keyed by `displayName`) in `provinceBboxes`. The map
   uses these to zoom into the selected province; the zones geojson is not
   bboxed because the dashboard never zooms past the province level.
5. Hooks (`useProvinceData`, `useZoneData(province?)`) read this context. The
   panels then aggregate / filter and pass plain data to the chart factories.

`pred_*` and `pred_*_count` are typed `number | null`; the 11 zones in
Nord-Kivu/Tshopo/Ituri with no model output appear as `null` and render as
"No data" everywhere.

---

## Charts

Convention: never write `option={{ … }}` inline in JSX. Build the options in a
factory under `src/lib/charts/`, return a typed `EChartsOption`, and consume
via a `useMemo`. Charts must use the registered `'dashboard'` theme
(`src/lib/charts/theme.ts`); colours come from there, not from hard-coded
hex values inside chart options.

Every chart tooltip sets `appendToBody: true` so the popover renders into
`document.body` instead of the chart container. The chart panels use
`overflow: hidden` for rounded-border styling, which would otherwise clip
tooltips near the edge of the panel.

### Coverage map — `buildMapOptions(config)`

- Single map series, choropleth coloured by the selected metric.
- Each data point is `{ name: row.mapKey, value: pred * 100 | null }`. ECharts
  matches `name` against the registered map's shape names (which are also
  `mapKey`).
- `visualMap.inRange` colours: light → dark green for coverage metrics, light
  → dark red for zero-dose metrics. `outOfRange: '#e5e7eb'` paints null /
  ungauged shapes neutral grey.
- Tooltip looks up the row by `mapKey`, renders the cleaned `displayName` +
  metric % + child count + annual births. Null-valued shapes show
  "No data". `tooltip.appendToBody: true` so the popover escapes the panel's
  `overflow: hidden` border.
- In-shape labels are suppressed (`label.show: false` on the series root,
  `emphasis`, `select`, and the `geo` block). The tooltip already shows the
  cleaned `displayName`; ECharts would otherwise paint the raw prefixed name
  on top of the polygon.
- **Zoom-on-drill.** `buildMapOptions` accepts an optional
  `boundingCoords: [[minLon, minLat], [maxLon, maxLat]]` and forwards it to
  the `geo` block. `ModelCoverageMap` looks up the bbox for `selectedProvince`
  from `DataContext.provinceBboxes`; with no province selected it omits the
  field and ECharts auto-fits the full DRC. Province is the maximum zoom
  level — drilling into a single zone does **not** zoom further.
- Click and hover both resolve `params.name` (a `mapKey`) back to a row via
  `find(f => f.mapKey === params.name)` — never via `displayName`.

### Bar chart — `buildBarOptions(items, …)`

- Horizontal bars sorted ascending (smallest at the top) — the **caller**
  sorts the items array. `buildBarOptions` no longer re-sorts; it indexes by
  position so event handlers in `ModelBarChart.tsx` can use `params.dataIndex`
  against the same array.
- Three modes selected via in-chart buttons: coverage (%), child count
  (`pred_<metric>_count`), and annual births. In the first two modes, rows
  whose value would be `null` are dropped before sorting (so ungauged zones
  don't appear as 0-bars).
- Bars are teal by default; `hoveredZoneId` is matched against `item.id` to
  paint the hovered bar amber.
- Hover on a bar updates `hoveredZoneId`. Click selects the province at
  national level (`setProvince`) and the zone once a province is selected
  (`setSelectedZone`).

### Cross-chart linkage

The map and the bar chart talk through the store, not directly. The
`hoveredZoneId` field is the single source of truth; both panels emit/listen
on it. The bar chart repaints the hovered bar through its option; the map
mirrors it as the shape's `emphasis` style with `useMapHoverSync`, and the
selected zone as its yellow `select` style with `useMapSelectionSync`. Both
hooks call `chartRef.current?.getEchartsInstance().dispatchAction(...)`
rather than rebuilding the option.

---

## Lower panel: Data vs Profiling

The section below the chart row is a `Tabs` (shadcn `src/components/ui/tabs.tsx`)
switching between **Data** (the existing `DataTable`) and **Profiling**
(`ProfilingPanel.tsx`). The active tab is stored as `viewMode` in the Zustand
store. Selection state (province / zone / metric) is shared across both tabs.

The 2023 / 2024 `YearSelector` is rendered next to the `TabsList` in
`DashboardGrid.tsx` on the same row, but conditionally — it appears only when
`viewMode === 'profiling'`. This keeps the year toggle visible without burning
its own row of vertical space.

### Profiling panel

`ProfilingPanel.tsx` wraps the accessibility chart; it no longer owns the
year toggle (now `YearSelector.tsx`, hoisted into the Tabs row).

- `AccessibilityChart` — cumulative bar chart of the share of 0-dose children
  reachable within 30 / 60 / 90 / 120 / 150 / 180 minutes of a vaccination
  site. Driven by `useAccessibilityProfile()`, with options built by
  `buildAccessibilityOptions()`. Tooltip shows the cumulative percentage and
  the raw count at each threshold.

### Behaviour indicators (household determinants tab)

- `BehaviourIndicatorsChart` (`features/determinants/charts/`) — sits below
  the COM-B radar. Per-indicator zero-dose vs vaccinated dumbbell, sorted by
  gap size and using the percentile-clipped 0–1 scaled values for a shared
  x-axis (raw values shown in the tooltip). Driven by
  `useIndicatorComparison()`, with options built by `buildDumbbellOptions()`.
  Tooltip surfaces the one-line indicator description shipped in
  `household_model/behaviour_indicators.json → meta[].description` (authored from the
  `Household - details` sheet of `data/input/immureach/details_models.xlsx`),
  followed by the scaled and raw values for both groups and the gap.

Both hooks resolve scope from the existing selection state: zone if a zone is
selected, province if a province is selected, otherwise national. If the
deeper level has no data for the selected area, the hook falls back to the
next level up and logs a console warning; the panel header also surfaces the
fallback level.

## Data table

`DataTable.tsx` dispatches to one of three child components based on store
state:

| Mode      | When                                | Component        |
| --------- | ----------------------------------- | ---------------- |
| `province` | No province selected               | `ProvinceTable`  |
| `zone`    | Province selected, no zone clicked  | `ZoneTable`      |
| `detail`  | Zone clicked                        | `ZoneDetail`     |

Both `ProvinceTable` and `ZoneTable` sort by clickable column headers (name,
population, births, or any of the 8 metrics). Cell renderers show `—` for
`null`; sort comparators sink null rows to the bottom in both ascending and
descending order (so direction toggling doesn't reshuffle the missing rows
to the top).

`ZoneDetail` is a full panel (no table) with three sections:

1. **Header** — an eyebrow line `"<Province> · Zone de Santé"` plus the
   zone's `displayName`.
2. **Demographics** — six tiles in the same visual rhythm as `IndicatorCard`
   (slate-50 background, label + `?` info popover, large bold value):
   `total_population`, `births_per_year`, `pop_0_12mo` (under 1),
   `pop_6_12mo` (6–11 months, the vaccine-target denominator), `pop_0_5yo` (under 5),
   and `imr` (per 1,000 births). Each tile's `?` tooltip carries a one-line
   description and a "Source" line attributing the value (GRID3 population
   rasters, DHS 2024 IMR, or the combination used for `births_per_year`).
3. **Coverage vs province & national average** — 2-column grid of small
   comparison cards, one per metric. Each card shows three stacked mini-bars
   (zone / province / national) on a shared 0–100 scale. The zone bar uses
   the accent (teal for coverage, red for zero-dose) and bold text; province
   and national bars use slate-300. Zones with `null` predictions render
   "No data for this zone." instead of empty bars. National values are a
   population-weighted aggregate across provinces
   (`Σ pred_*_count / Σ pop_6_12mo` × 100), computed once and memoised.

Drill-up is handled by the ribbon's Province / Zone selects — neither
`ZoneTable` nor `ZoneDetail` ship their own back-link UI.

### Key Indicators scope

`ModelIndicatorCardGrid` reads the same selection state and routes by deepest
scope:

- **Zone selected** → the zone row's `pred_*` and `pred_*_count` directly.
- **Province selected, no zone** → the province row's pre-computed
  pop-weighted `pred_*` and `pred_*_count` (do **not** average over the
  province's zones — those values are already weighted at build time).
- **No selection** → national pop-weighted aggregate
  `Σ pred_*_count / Σ pop_6_12mo` across all provinces.

---

## Conventions

- Never define ECharts option objects inline in JSX; use `useMemo` or a
  factory in `src/lib/charts/`.
- Option factories live in `src/lib/charts/` and accept typed data + config
  parameters; they return `EChartsOption`.
- All charts use the registered `'dashboard'` theme; pull colours from
  there, not from inline hex.
- Use the Zustand store to coordinate panels — no prop-drilling for shared
  selections.
- Don't put business logic in components — extract to hooks (`src/hooks/`)
  or utilities (`src/lib/`).
- Tailwind for everything except chart options. No global CSS files, no
  CSS-in-JS libraries.
- Charts are ECharts only; don't introduce Chart.js, Recharts, Visx, etc.

---

## Local development

```bash
npm install
npm run dev               # vite dev server, http://localhost:5173
npm run build             # tsc -b && vite build  →  dist/
npm run preview           # serve the production build
npm run build-data        # regenerate geojsons, profile.json, household_model/behaviour_indicators.json
npm run deploy            # build, then publish dist/ to gh-pages
```

`build-data` runs `uv run scripts/build-dashboard-geojson.py` (geojsons),
`uv run scripts/build-profile-json.py` (Profiling-mode sidecar) and
`uv run scripts/model_HZ/build-behaviour-indicators.py`. The other
scripts in `scripts/` run independently; see [data.md](./data.md) for the full
pipeline.

---

## Adding a panel

Most new panels follow the same recipe:

1. Add any new selection fields to `dashboardStore.ts` (e.g. a year selector).
2. Build a hook in `src/hooks/` that reads `DataContext` + the store and
   returns the rows your panel needs.
3. Build the chart options in `src/lib/charts/<your-chart>.ts`. Accept typed
   data, return `EChartsOption`. Pull colours from the dashboard theme.
4. Render an `EChartsReact` in your component; wire `onEvents` for clicks
   and hovers, and update the store accordingly.
5. Slot the new component into `DashboardGrid.tsx`.

For panels that depend on data not already in the geojsons, either extend
`build-dashboard-geojson.py` to add the field to each feature (good for small
per-area scalars that fit the existing geojson contract) or extend
`build-profile-json.py` to enrich the sidecar (good for multi-dimensional
data: year × scope × group). The Profiling-mode panels use the sidecar
pattern.
