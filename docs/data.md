# Data pipeline

This document describes the data that backs the dashboard: the raw inputs we
receive from external sources, the intermediate per-domain CSVs and GeoJSONs we
compute in `data/output/`, the runtime files served to the browser from
`public/data/`, and the scripts that connect them.

```
data/input/        raw upstream files (DHS, GRID3, ImmuReach)
       │
       │  uv run scripts/*.py          (one script per domain)
       ▼
data/output/       per-domain aggregates: boundaries, population,
                   accessibility, indicators, predictions
       │
       │  uv run scripts/build-dashboard-geojson.py
       │  uv run scripts/build-profile-json.py
       ▼
public/data/       provinces.geojson, zones.geojson, profile.json
                                                       (read by the dashboard)
```

All scripts are intended to be run from the project root with `uv run`.
Dependencies are pinned in `pyproject.toml`.

---

## `data/input/` — raw upstream sources

Three providers feed the pipeline. None of these files are checked into git;
copy them locally before running the scripts.

### `data/input/dhs/`

- `imr.csv` — DHS province-level infant mortality rate (per 1000 live births).
  One row per province, used to back-derive annual births from the under-1
  population (`births = pop_u1 / (1 - imr / 1000)`).

### `data/input/grid3/`

GRID3 v4.4 gridded population rasters covering the DRC.

- `COD_population_v4_4_gridded/COD_Population_v4_4_gridded.tif` — national
  total-population raster.
- `COD_<Province>_province_population_v4.4_agesex/*.tif` — one folder per
  province, with age/sex-disaggregated rasters. We use `*_f0.tif` + `*_m0.tif`
  (under 1) and the under-5 layers; everything else is ignored.

### `data/input/immureach/`

Files produced by the ImmuReach modelling team.

- `shapes_level3.gpkg` — level-3 (zones de santé) polygons with
  `level_1_*`/`level_2_*`/`level_3_*` identifiers. Source of geometry for the
  entire pipeline; provinces are dissolved from these.
- `data_and_predictions_260317.gpkg` — zone-level model predictions: vaccine
  coverage (`pred_bcg`, `pred_rota`, …) and zero-dose rates
  (`pred_zerodosepenta`, `pred_zerodoseall`).
- `accessibility_2022.csv`, `accessibility_2023.csv` — travel-time-to-health-
  facility metrics, one row per zone per year. Includes mean travel time and
  the count of children within 30/60/90/120/150/180 minute isochrones,
  reported separately for all children and for zero-dose children.
- `indicators_households_complete.csv` — DHS-style household-survey indicators
  (trust, affordability, knowledge, fear, outreach, etc.) at the household
  level, with a survey weight (`ponderation`), survey year, and a
  `zero_dose_penta` flag.
- `pyramid_antenne.csv` — antenne assignments per zone, used only by an older
  prototype. No longer consumed by the dashboard.
- `details_models.xlsx` — documentation of the model variables and composite
  indices. The `Household - details` sheet is the source of authorship for the
  one-line descriptions surfaced in the dumbbell tooltip (those descriptions
  are baked into `scripts/build-profile-json.py` as the `INDICATOR_DESCRIPTIONS`
  constant — the script does not read the xlsx at build time, so editing the
  spreadsheet does not auto-propagate).
- `travel_times_drive.tif`, `accessibility.json`, `data_and_predictions.json`,
  `indicators.json`, `hfvacc_2024.gpkg` — auxiliary reference files; not read
  by any current script.

---

## `data/output/` — per-domain intermediates

The scripts in `scripts/` aggregate each input domain at three levels (zone,
province, national) and write CSVs/GeoJSONs to `data/output/`. These files are
the canonical clean dataset and are read both by `build-dashboard-geojson.py`
(to build the dashboard runtime payload) and by any future analyses.

### `data/output/boundaries/`

Produced by `scripts/generate-boundaries.py`.

- `zones.geojson` — 519 level-3 polygons. Properties: `level_1_id`,
  `level_1_name`, `level_2_id`, `level_2_name`, `level_3_id`, `level_3_name`.
- `provinces.geojson` — 26 level-2 polygons, dissolved from `zones.geojson` by
  `level_2_id`. Properties: `level_1_id`, `level_1_name`, `level_2_id`,
  `level_2_name`.

Geometries are simplified topology-aware with mapshaper (Douglas–Peucker) so
shared borders stay coincident. The simplification ratio defaults to 10 %
(vertices kept) and is configurable via CLI argument.

### `data/output/population/`

Produced by `scripts/aggregate-population.py`.

- `zones.csv` — one row per zone with `total_population`, `pop_u1`, `pop_u5`,
  `pop_6_12mo`, `pop_12_24mo`, `pop_6_24mo`, `births_per_year` and the level
  IDs/names.
- `provinces.csv` — same columns at the province level (sum of zones).

Methodology:

```
births_per_year = pop_u1 / (1 - imr / 1000)
pop_6_12mo      = pop_u1 * 0.5
pop_12_24mo     = (pop_u5 - pop_u1) * 0.25
pop_6_24mo      = pop_6_12mo + pop_12_24mo
```

The 6–24 month band is the denominator for vaccine coverage counts shown in
the dashboard.

### `data/output/accessibility/`

Produced by `scripts/aggregate-accessibility.py` (DuckDB).

- `zone_2022.csv`, `zone_2023.csv` — passthrough of the per-zone CSV with
  geometry dropped.
- `province_2022.csv`, `province_2023.csv` — counts (`n`, `n_0d`,
  `n_{30/60/90/120/150/180}mn`, `n_0d_{…}mn`) summed across zones in each
  province; `mean_travel` averaged weighted by `n`, `mean_travel_0d`
  averaged weighted by `n_0d`. Median columns are dropped.
- `national_2022.csv`, `national_2023.csv` — same aggregation across all
  zones.

### `data/output/indicators/`

Produced by `scripts/aggregate-indicators.py` (DuckDB).

- `zone_<year>.csv`, `province_<year>.csv`, `national_<year>.csv` for 2022 and
  2023.
- `radar_data.json` — pre-aggregated payload for radar charts (national,
  per-province and per-zone, split by zero-dose status).

Aggregation rules:

1. Household-level rows are aggregated to the zone/province/national level
   using `ponderation` (survey weight) as the weight.
2. Each year × level group is also split by `zero_dose_penta` (0 / 1) so
   downstream charts can compare drivers between zero-dose and non-zero-dose
   children.
3. Every numeric indicator is also written in a `<name>_scaled` variant: a
   0–1 min/max scaling whose bounds are computed once per year from the
   *zone-level* averages, pooled across both zero-dose groups, then clipped
   to the **p5/p95** of those averages and clamped to `[0, 1]`. This keeps
   typical zones spread across the full 0–1 range despite a handful of
   indicators that are heavily right-skewed z-scores.

See the [auto-memory notes](../../.claude/projects/-var-home-yannforget-Bluesquare-immureach-immureach-dashboard/memory/)
for the rationale behind that scaling choice.

### `data/output/predictions/`

Produced by `scripts/prepare-predictions.py`.

- `zones.csv` — one row per zone with all eight `pred_*` columns from the
  predictions geopackage.
- `provinces.csv` — predictions averaged across zones, weighted by
  `pop_6_24mo`.
- `country.csv` — single row, national average weighted by `pop_6_24mo`.

The eight metrics are: `pred_bcg`, `pred_rota`, `pred_var`, `pred_vaa`,
`pred_polio`, `pred_pcv`, `pred_zerodosepenta`, `pred_zerodoseall`. All are
proportions in `[0, 1]`.

Coverage is available for 508 of the 519 zones; 11 zones (active conflict
areas, mostly Nord-Kivu) have no model output.

---

## `public/data/` — runtime payload for the dashboard

Produced by `scripts/build-dashboard-geojson.py` and `scripts/build-profile-json.py` from `data/output/`.

- `provinces.geojson` — 26 features (~0.3 MB compact JSON).
- `zones.geojson` — 519 features (~1.4 MB compact JSON).
- `profile.json` — sidecar for Profiling-mode panels (~2 MB compact JSON):
  accessibility isochrone counts and behaviour-indicator zero-dose / vaccinated
  pairs, nested as `{ accessibility | indicators }[year][national|provinces|zones][area]`.
  Area keys are the dashboard's *cleaned* names (matching `displayName` /
  `selectedProvince`), so the frontend hooks look up rows directly without
  re-cleaning at runtime. The `indicators.meta` block also ships a `description`
  per indicator (one-line plain-English explanation), which the dumbbell
  tooltip surfaces to give decision-makers context on each composite index.

These are the only data files fetched at runtime. Each feature's `properties`
carries everything the dashboard needs (no separate CSVs are loaded in the
browser):

| Field                          | Provinces | Zones | Notes                              |
| ------------------------------ | --------- | ----- | ---------------------------------- |
| `q101`                         | ✅         | ✅     | Raw `level_2_name`, e.g. `"kl Kwilu Province"` — used as ECharts map key |
| `q103`                         | —         | ✅     | Raw `level_3_name`, e.g. `"kl Bagata Zone de Santé"` |
| `total_population`             | ✅         | ✅     |                                    |
| `pop_0_12mo`, `pop_0_5yo`      | ✅         | ✅     | Renamed from `pop_u1` / `pop_u5`   |
| `pop_6_12mo`, `pop_12_24mo`, `pop_6_24mo` | ✅ | ✅  |                                    |
| `births_per_year`              | ✅         | ✅     |                                    |
| `imr`                          | ✅         | ✅     |                                    |
| `pred_<metric>`                | ✅         | ✅     | 8 metrics, `0..1` or `null`         |
| `pred_<metric>_count`          | ✅         | ✅     | `pred_<metric> * pop_6_24mo`, or `null` |
| `level_{1,2,3}_{id,name}`      | ✅         | ✅     | Kept verbatim for future joins     |

Null handling: the 11 zones without coverage predictions emit `null` for every
`pred_*` and `pred_*_count` (the geometry and population fields are still
present). Two zones (Kowe in Haut-Katanga, Lualaba in Lualaba province) also
have `null` population because the upstream raster aggregation yielded `NaN`.
The dashboard renders all such cells as a grey "No data" state.

---

## Scripts

All scripts live in `scripts/` and are run from the project root.

| Script                          | Reads from                                | Writes to                                    |
| ------------------------------- | ----------------------------------------- | -------------------------------------------- |
| `generate-boundaries.py`        | `data/input/immureach/shapes_level3.gpkg` | `data/output/boundaries/`                    |
| `aggregate-population.py`       | `data/input/grid3/`, `data/input/dhs/imr.csv`, `data/output/boundaries/` | `data/output/population/`                    |
| `aggregate-accessibility.py`    | `data/input/immureach/accessibility_*.csv` | `data/output/accessibility/`                 |
| `aggregate-indicators.py`       | `data/input/immureach/indicators_households_complete.csv` | `data/output/indicators/`                    |
| `prepare-predictions.py`        | `data/input/immureach/data_and_predictions_260317.gpkg`, `data/output/population/zones.csv` | `data/output/predictions/`                   |
| `build-dashboard-geojson.py`    | `data/output/{boundaries,population,predictions}/` | `public/data/{provinces,zones}.geojson`      |
| `build-profile-json.py`         | `data/output/{accessibility,indicators}/`  | `public/data/profile.json`                   |

### Running the full pipeline

There is dependency ordering between the scripts; run them in this order on
a fresh checkout:

```bash
uv run scripts/generate-boundaries.py        # boundaries first
uv run scripts/aggregate-population.py       # needs boundaries
uv run scripts/prepare-predictions.py        # needs population (for weights)
uv run scripts/aggregate-accessibility.py    # independent
uv run scripts/aggregate-indicators.py       # independent

uv run scripts/build-dashboard-geojson.py    # builds provinces/zones.geojson
uv run scripts/build-profile-json.py         # builds profile.json sidecar
# or, equivalently:
npm run build-data
```

The accessibility and indicators scripts are independent of the rest and can
run in any order. Only `build-dashboard-geojson.py` and `build-profile-json.py`
write to `public/data/`; everything else stays inside `data/output/`.

### Notes on `build-dashboard-geojson.py`

- Joins predictions to boundaries by `(level_2_name, level_3_name)` (and just
  `level_2_name` for provinces). Population joins similarly.
- Hard-fails if the number of zones without predictions diverges from the
  known 11; this guards against silent upstream drift.
- Computes `pred_<m>_count = pred_<m> * pop_6_24mo` once at build time so the
  runtime doesn't have to.
- Renames `level_2_name → q101`, `level_3_name → q103`, `pop_u1 → pop_0_12mo`,
  `pop_u5 → pop_0_5yo` to match the dashboard's existing field contract.
- Coerces upstream `NaN` to JSON `null` (`allow_nan=False`) so the output is
  valid JSON that browsers can `fetch().then(r => r.json())`.
- Writes compact JSON (no indent, `ensure_ascii=False`); for 519 zones this
  lands at ~1.4 MB. If the file ever crosses 5 MB, add a 4-decimal-place
  coordinate-rounding pass before serialisation (≈11 m precision, plenty for
  a national choropleth).

### Notes on `build-profile-json.py`

- Reads only the per-level CSVs produced by `aggregate-accessibility.py` and
  `aggregate-indicators.py`; no dependency on boundaries, predictions, or
  population.
- Normalises area keys: the accessibility CSVs ship cleaned `level_2_name` /
  `level_3_name` ("Bas Uele", "Aketi"), while the indicators CSVs ship raw
  prefixed names ("bu Bas Uele Province"). The script applies the same
  `cleanName` regex used in the dashboard so both sub-blocks key on the same
  `displayName` the frontend already has on hand.
- Bakes `INDICATOR_DESCRIPTIONS` (one-liner per composite index, hand-written
  from the `Household - details` sheet of `details_models.xlsx`) into each
  `indicators.meta` entry.
- Coerces upstream `NaN` to JSON `null` (`allow_nan=False`).

### Profiling-mode consumption

`accessibility/` and `indicators/` are consumed by the dashboard's
Profiling-mode panel (Data ↔ Profiling tab below the chart row):

- the cumulative-isochrone bar chart reads `profile.json → accessibility`;
- the behaviour-indicators dumbbell reads `profile.json → indicators` (scaled
  values for the shared axis; raw values and per-indicator description used in
  the tooltip).

`radar_data.json` is still produced by `aggregate-indicators.py` but currently
unused by the dashboard — kept as the source shape that informed
`build-profile-json.py` and as input for any future per-zone radar.
