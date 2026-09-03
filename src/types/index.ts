export type MetricKey =
  | 'pred_bcg'
  | 'pred_rota'
  | 'pred_var'
  | 'pred_vaa'
  | 'pred_polio'
  | 'pred_pcv'
  | 'pred_zerodosepenta'
  | 'pred_zerodoseall';

export interface MetricMeta {
  key: MetricKey;
  label: string;
  countKey: string;
  isZeroDose: boolean;
  description: string;
}

export interface ProvinceProperties {
  q101: string;
  pop_6_24mo: number;
  pred_bcg: number | null;
  pred_rota: number | null;
  pred_var: number | null;
  pred_vaa: number | null;
  pred_polio: number | null;
  pred_pcv: number | null;
  pred_zerodosepenta: number | null;
  pred_zerodoseall: number | null;
  pred_bcg_count: number | null;
  pred_rota_count: number | null;
  pred_var_count: number | null;
  pred_vaa_count: number | null;
  pred_polio_count: number | null;
  pred_pcv_count: number | null;
  pred_zerodosepenta_count: number | null;
  pred_zerodoseall_count: number | null;
}

export interface ZoneProperties extends ProvinceProperties {
  q103: string;
  // PEV/EPI antenne (operational hub) the zone reports to. Only a few provinces have antenne assignments — null elsewhere.
  antenne: string | null;
}

export interface AntenneGroup {
  antenne: string;
  color: string;
  // The zone that *is* the antenne head. Resolved by exact displayName
  // match first; if that fails (e.g. "Kikwit" has no zone literally named
  // "Kikwit", only "Kikwit Nord" / "Kikwit Sud"), we fall back to the
  // first zone whose displayName contains the antenne name. Null only if
  // no zone in the group matches even loosely.
  headMapKey: string | null;
  headCentroid: [number, number] | null;
  memberMapKeys: string[];
}

export interface ProvinceRow {
  id: string;
  displayName: string;
  // Unique key matching the registered ECharts map shape. Distinct from
  // displayName because two zones can share a cleaned name (e.g. "Bili" exists
  // in both Bas Uele and Nord Ubangi) and ECharts indexes shapes by name.
  mapKey: string;
  properties: ProvinceProperties;
}

export interface ZoneRow {
  id: string;
  displayName: string;
  mapKey: string;
  provinceId: string;
  // [lon, lat] of the zone's bbox centre — used to anchor map markers
  // (e.g. the antenne-head icon in Antenne mode).
  centroid: [number, number];
  properties: ZoneProperties;
}

export type TableMode = 'province' | 'zone' | 'detail';

export type ViewMode = 'data' | 'profiling';

export type DashboardSection = 'ecv' | 'zerodose' | 'determinants' | 'actions';

export type Year = 2022 | 2023;

export const ACCESSIBILITY_THRESHOLDS = [30, 60, 90, 120, 150, 180] as const;
export type AccessibilityThreshold = (typeof ACCESSIBILITY_THRESHOLDS)[number];

export interface AccessibilityIsochrone {
  min: AccessibilityThreshold;
  n_0d: number | null;
  n: number | null;
}

export interface AccessibilityEntry {
  n_0d: number | null;
  n: number | null;
  isochrones: AccessibilityIsochrone[];
}

export interface IndicatorMeta {
  key: string;
  label: string;
  description?: string;
}

export interface IndicatorPair {
  // Scaled 0-1 values (percentile-clipped per year, suitable for shared axis).
  zd: number | null;
  vacc: number | null;
  // Raw values surfaced in the tooltip for context.
  zd_raw: number | null;
  vacc_raw: number | null;
}

export type IndicatorValueMap = Record<string, IndicatorPair>;

export interface AccessibilityYear {
  national: AccessibilityEntry | null;
  provinces: Record<string, AccessibilityEntry>;
  zones: Record<string, AccessibilityEntry>;
}

export interface IndicatorsYear {
  national: IndicatorValueMap;
  provinces: Record<string, IndicatorValueMap>;
  zones: Record<string, IndicatorValueMap>;
}

export interface ProfileData {
  years: Year[];
  accessibility: {
    thresholds: number[];
  } & Record<string, AccessibilityYear>;
  indicators: {
    meta: IndicatorMeta[];
  } & Record<string, IndicatorsYear>;
}

export type ProfileScopeLevel = 'national' | 'province' | 'zone';

// One row of public/data/key_ecv.csv (columns: year, level, province, zone,
// nb_people, nb_zones, penta_cov, zdc_cov, penta_cov_low/high,
// zdc_cov_low/high). `province`/`zone` are only populated for the matching
// `level`; penta_cov/zdc_cov and the *_low/_high pairs bound their 95%
// confidence interval, all as 0-100 percentages.
export interface KeyEcvRow {
  year: Year;
  level: ProfileScopeLevel;
  province: string | null;
  zone: string | null;
  nb_people: number | null;
  nb_zones: number | null;
  nb_areas: number | null;
  nb_areas_tot: number | null;
  penta_cov: number | null;
  zdc_cov: number | null;
  penta_cov_low: number | null;
  penta_cov_high: number | null;
  zdc_cov_low: number | null;
  zdc_cov_high: number | null;
}

// A single `<metric>_pct` + `<metric>_95CI` pair from the ECV vaccination
// coverage survey (public/data/ecv_vaccination_coverage.csv). `pct` is a
// 0-100 percentage; `ciLow`/`ciHigh` bound its 95% confidence interval. Any
// of the three can be null when the source cell was empty/unparseable.
export interface EcvMetricValue {
  pct: number | null;
  ciLow: number | null;
  ciHigh: number | null;
}

// Keys for the 21 `_pct`/`_95CI` metric pairs in
// public/data/ecv_vaccination_coverage.csv, matching the snake_case column
// prefixes written by scripts/prepare-ecv-vaccination-coverage.py.
export type EcvMetricKey =
  | 'possession_carte'
  | 'couverture_de_base'
  | 'couverture_complete'
  | 'zero_dose'
  | 'bcg'
  | 'penta1'
  | 'penta2'
  | 'penta3'
  | 'polio0'
  | 'polio1'
  | 'polio2'
  | 'polio3'
  | 'pcv1'
  | 'pcv2'
  | 'pcv3'
  | 'rota1'
  | 'rota2'
  | 'rota3'
  | 'vpi'
  | 'var'
  | 'vaa';

// One row of public/data/ecv_vaccination_coverage.csv. `province`/`zone` are
// only populated for the matching `level`, mirroring KeyEcvRow.
export interface EcvVaccCovRow {
  year: number;
  level: ProfileScopeLevel;
  province: string | null;
  zone: string | null;
  nbrChildren: number | null;
  nbreAs: number | null;
  asEnq: number | null;
  metrics: Record<EcvMetricKey, EcvMetricValue>;
}

// A single `<root>_pct` value from the ECV household characteristics survey
// (public/data/ecv_caracteristics.csv), with its optional 95% CI bounds.
// Any of the three can be null when the source cell was empty/unparseable.
export interface EcvCaracteristicValue {
  pct: number | null;
  low: number | null;
  high: number | null;
}

// One row of public/data/ecv_caracteristics.csv. `province`/`zone` are only
// populated for the matching `level`, mirroring KeyEcvRow. `values` is keyed
// by the variable root (e.g. "possession_carte", "mere", "gardienne") so new
// `<root>_pct/_low/_high` columns are picked up without type changes.
export interface EcvCaracteristicsRow {
  year: number;
  level: ProfileScopeLevel;
  province: string | null;
  zone: string | null;
  nbChildren: number | null;
  values: Record<string, EcvCaracteristicValue>;
}

export interface CovariateRow {
  Category: string;
  var_description: string;
  variable_name: string;
}

export interface RelativeInfluenceRow {
  Variable: string;
  mean_ri: number;
  median_ri: number;
  lower_q_ri: number;
  upper_q_ri: number;
}

export type DeterminantCategory = 'Capacity' | 'Motivation' | 'Opportunity';

export interface DeterminantVariable {
  variable_name: string;
  var_description: string;
  category: DeterminantCategory;
  mean_ri: number;
  /** Log-scaled (1-100) value used for radar rendering so near-zero variables stay visible */
  scaled_ri: number;
}

export interface CategorySummary {
  category: DeterminantCategory;
  label: string;
  /** Short informational description used on the category cards */
  description: string;
  variableCount: number;
}