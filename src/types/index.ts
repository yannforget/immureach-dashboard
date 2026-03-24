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
  pred_bcg: number;
  pred_rota: number;
  pred_var: number;
  pred_vaa: number;
  pred_polio: number;
  pred_pcv: number;
  pred_zerodosepenta: number;
  pred_zerodoseall: number;
}

export interface ZoneProperties extends ProvinceProperties {
  q103: string;
  antenne?: string | null;
  is_antenne?: boolean | null;
}

export interface ProvinceRow {
  id: string;
  displayName: string;
  properties: ProvinceProperties;
}

export interface ZoneRow {
  id: string;
  displayName: string;
  provinceId: string;
  properties: ZoneProperties;
}

export type TableMode = 'province' | 'zone' | 'detail';
