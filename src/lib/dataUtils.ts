import type { MetricKey, MetricMeta } from '@/types';

/**
 * Clean display name: remove prefix, " Province" and " Zone de Santé" suffixes
 * e.g., "kl Kwilu Province" -> "Kwilu"
 * e.g., "some Zone de Santé Name" -> "Name"
 */
export function cleanName(name: string): string {
  // Remove 2-letter prefix
  let cleaned = name.replace(/^[a-z]{2}\s/, '');
  // Remove " Province" suffix
  cleaned = cleaned.replace(/ Province$/, '');
  // Remove " Zone de Santé" suffix
  cleaned = cleaned.replace(/ Zone de Santé$/, '');
  return cleaned;
}

/**
 * Get display name for province buttons (drop " Province" suffix)
 */
export function getDisplayName(fullName: string): string {
  return fullName.replace(/ Province$/, '');
}

/**
 * Compute colorscale bounds as multiples of 10
 */
export function getColorScaleBounds(values: number[]): { min: number; max: number } {
  const validValues = values.filter(v => !isNaN(v) && v >= 0);
  if (validValues.length === 0) return { min: 0, max: 100 };

  const min = Math.floor(Math.min(...validValues) / 10) * 10;
  const max = Math.ceil(Math.max(...validValues) / 10) * 10;

  return { min: Math.max(0, min), max: Math.max(100, max) };
}

/**
 * Metric metadata: all 8 immunization metrics
 */
export const METRIC_META: Record<MetricKey, MetricMeta> = {
  pred_bcg: {
    key: 'pred_bcg',
    label: 'BCG',
    countKey: 'pred_bcg_count',
    isZeroDose: false,
    description: 'Vaccin contre la tuberculose',
  },
  pred_rota: {
    key: 'pred_rota',
    label: 'Rotavirus',
    countKey: 'pred_rota_count',
    isZeroDose: false,
    description: 'Vaccin contre le rotavirus',
  },
  pred_var: {
    key: 'pred_var',
    label: 'Varicelle',
    countKey: 'pred_var_count',
    isZeroDose: false,
    description: 'Vaccin contre la rougeole',
  },
  pred_vaa: {
    key: 'pred_vaa',
    label: 'VAA',
    countKey: 'pred_vaa_count',
    isZeroDose: false,
    description: 'Vaccin contre la fièvre jaune',
  },
  pred_polio: {
    key: 'pred_polio',
    label: 'Polio',
    countKey: 'pred_polio_count',
    isZeroDose: false,
    description: 'Vaccin contre la polio',
  },
  pred_pcv: {
    key: 'pred_pcv',
    label: 'PCV',
    countKey: 'pred_pcv_count',
    isZeroDose: false,
    description: 'Vaccin antipneumococcique',
  },
  pred_zerodosepenta: {
    key: 'pred_zerodosepenta',
    label: '0-dose (pentavalent)',
    countKey: 'pred_zerodosepenta_count',
    isZeroDose: true,
    description: "Enfants n'ayant reçu aucune dose, sur la base du taux de couverture vaccinale par le vaccin pentavalent",
  },
  pred_zerodoseall: {
    key: 'pred_zerodoseall',
    label: '0-dose (tous vaccins)',
    countKey: 'pred_zerodoseall_count',
    isZeroDose: true,
    description: "Enfants n'ayant reçu aucune dose, sur la base du taux de couverture vaccinale pour l'ensemble des vaccins",
  },
};

export const METRIC_KEYS: MetricKey[] = [
  'pred_bcg',
  'pred_rota',
  'pred_var',
  'pred_vaa',
  'pred_polio',
  'pred_pcv',
  'pred_zerodosepenta',
  'pred_zerodoseall',
];
