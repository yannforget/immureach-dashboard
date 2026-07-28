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
  // PEV/EPI antenne (operational hub) the zone reports to. Only a few
  // provinces have antenne assignments — null elsewhere.
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
