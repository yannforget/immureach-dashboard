import type { EcvMetricKey, MetricKey, MetricMeta } from '@/types';
import { EcvMetricMeta } from './ecvVaccCov';


// MODEL //
export const MODEL_METRIC_KEYS: MetricKey[] = [
    'pred_bcg',
    'pred_rota',
    'pred_var',
    'pred_vaa',
    'pred_polio',
    'pred_pcv',
    'pred_zerodosepenta',
    'pred_zerodoseall',
];

export const MODEL_METRIC_META: Record<MetricKey, MetricMeta> = {
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

// ECV // 
export const ECV_METRIC_KEYS: EcvMetricKey[] = [
    'possession_carte',
    'couverture_de_base',
    'couverture_complete',
    'zero_dose',
    'bcg',
    'penta1',
    'penta2',
    'penta3',
    'polio0',
    'polio1',
    'polio2',
    'polio3',
    'pcv1',
    'pcv2',
    'pcv3',
    'rota1',
    'rota2',
    'rota3',
    'vpi',
    'var',
    'vaa',
];

export const ECV_METRIC_META: Record<EcvMetricKey, EcvMetricMeta> = {
    possession_carte: { key: 'possession_carte', label: 'Possession de carte' },
    couverture_de_base: { key: 'couverture_de_base', label: 'Couverture de base' },
    couverture_complete: { key: 'couverture_complete', label: 'Couverture complète' },
    zero_dose: { key: 'zero_dose', label: 'Zéro dose' },
    bcg: { key: 'bcg', label: 'BCG' },
    penta1: { key: 'penta1', label: 'Penta1' },
    penta2: { key: 'penta2', label: 'Penta2' },
    penta3: { key: 'penta3', label: 'Penta3' },
    polio0: { key: 'polio0', label: 'Polio0' },
    polio1: { key: 'polio1', label: 'Polio1' },
    polio2: { key: 'polio2', label: 'Polio2' },
    polio3: { key: 'polio3', label: 'Polio3' },
    pcv1: { key: 'pcv1', label: 'PCV1' },
    pcv2: { key: 'pcv2', label: 'PCV2' },
    pcv3: { key: 'pcv3', label: 'PCV3' },
    rota1: { key: 'rota1', label: 'ROTA1' },
    rota2: { key: 'rota2', label: 'ROTA2' },
    rota3: { key: 'rota3', label: 'ROTA3' },
    vpi: { key: 'vpi', label: 'VPI' },
    var: { key: 'var', label: 'VAR (rougeole)' },
    vaa: { key: 'vaa', label: 'VAA (fièvre jaune)' },
};
// The metrics shown on the ECV bar chart: every vaccine-dose indicator
// except zero-dose (which drives the map) and the three summary/possession
// indicators (possession_carte, couverture_de_base, couverture_complete).

export const ECV_BAR_METRIC_KEYS: EcvMetricKey[] = ECV_METRIC_KEYS.filter(
    k => !['possession_carte', 'couverture_de_base', 'couverture_complete', 'zero_dose'].includes(k)
)

// Variables offered on the ECV evolution line chart: every ECV metric
// except the summary/possession indicators. Zero-dose stays available here
// even though it is absent from the bar chart.
export const ECV_LINE_METRIC_KEYS: EcvMetricKey[] = ECV_METRIC_KEYS.filter(
    k => !['possession_carte', 'couverture_de_base', 'couverture_complete'].includes(k)
);

// ECV CARACTERISTICS //

// Human-readable French labels for the variable roots of
// ecv_caracteristics.csv (`<root>_pct/_low/_high` column families). Roots
// missing from this map fall back to the humanized column name in the hook.
export const ECV_CARACTERISTIC_VARIABLE_LABELS: Record<string, string> = {
    possession_carte: 'Possession de carte',
    mere: 'Mère',
    gardienne: 'Gardienne',
};

// Variables that belong to the *same* chart tab. Each entry is one tab:
// "mere" and "gardienne" are two answers to the same question, so they are
// grouped and drawn as stacked bars; every other variable (now and any
// `<root>_pct` column added later) gets its own single-series tab.
export const ECV_CARACTERISTIC_GROUPS: Record<string, { label: string; variables: string[] }> = {
    mere_gardienne: { label: 'Mère / Gardienne', variables: ['mere', 'gardienne'] },
};

