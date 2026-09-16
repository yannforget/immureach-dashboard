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
    certificat_naissance: 'Possession certificat naissance',
    naissance_enregistree: 'Naissance enregistrée',
    possession_carte: 'Possession carte vaccination',
    carte_ou_document: 'Possession carte ou document',
    mere: 'Mère',
    gardienne: 'Gardienne',
    // BeSD4 — importance perçue des vaccins, one label per modality.
    besd4_pas_important: 'Pas du tout important',
    besd4_peu_important: 'Quelque peu important',
    besd4_moyen_important: 'Moyennement important',
    besd4_tres_important: 'Très important',
    // BeSD6 — confiance dans les agents de santé vaccinateurs.
    besd6_aucune_confiance: 'Aucune confiance',
    besd6_confiance_limitee: 'Confiance limitée',
    besd6_confiance_moyenne: 'Confiance moyenne',
    besd6_grande_confiance: 'Grande confiance',
    // BeSD19 — difficultés d'accès citées (BeSD19_a à BeSD19_e).
    besd19_aucune_difficulte: 'Aucune difficulté',
    besd19_trajet: 'Trajet difficile',
    besd19_horaires: 'Horaires inadaptés',
    besd19_refoulement: 'Refoulé sans vaccin',
    besd19_attente: 'Attente trop longue',
    // BeSD20 — problèmes des services cités (BeSD21_a à BeSD21_h).
    besd21_satisfait: 'Satisfait(e)',
    besd21_rupture: 'Vaccin indisponible',
    besd21_ouverture: 'Ouverture tardive',
    besd21_attente: 'Attente trop longue',
    besd21_proprete: 'Manque de propreté',
    besd21_formation: 'Personnel mal formé',
    besd21_respect: 'Personnel irrespectueux',
    besd21_temps: 'Trop peu de temps accordé',
};

// Variable roots charted on the ECV characteristics panel, in tab order.
// Acts as a whitelist: `<root>_pct` columns present in the CSV but absent
// here are parsed but never charted. Roots sharing an
// ECV_CARACTERISTIC_GROUPS entry collapse into a single multi-series tab.
export const ECV_CARACTERISTIC_KEYS: string[] = [
    'certificat_naissance',
    'naissance_enregistree',
    'possession_carte',
    'carte_ou_document',
    'mere',
    'gardienne',
    'besd4_pas_important',
    'besd4_peu_important',
    'besd4_moyen_important',
    'besd4_tres_important',
    'besd6_aucune_confiance',
    'besd6_confiance_limitee',
    'besd6_confiance_moyenne',
    'besd6_grande_confiance',
    'besd19_trajet',
    'besd19_horaires',
    'besd19_refoulement',
    'besd19_attente',
    'besd21_rupture',
    'besd21_ouverture',
    'besd21_attente',
    'besd21_proprete',
    'besd21_formation',
    'besd21_respect',
    'besd21_temps',
];

// Variables that belong to the *same* chart tab. Each entry is one tab; every
// charted variable left out of every entry gets its own single-series tab.
// Only roots listed in ECV_CARACTERISTIC_KEYS are considered, and the group
// takes the tab slot of its first listed variable. Every tab is drawn as a
// stacked bar.
//
// `exclusive` says what the stack adds up to, which is what the chart's y axis
// and tooltip key off:
//   true  — the variables are the modalities of one question, so exactly one
//           of them holds for each child and the segments fill the bar to
//           exactly 100% (Mère / Gardienne, BeSD4, BeSD6).
//   false — the variables are the options of a multi-select question, so a
//           caregiver can pick several and the answers overlap. There is no
//           total to stack towards, so these groups are drawn as a heatmap
//           (one row per option, one column per area) instead of a bar.
export const ECV_CARACTERISTIC_GROUPS: Record<
    string,
    { label: string; variables: string[]; exclusive: boolean }
> = {
    mere_gardienne: {
        label: 'Mère / Gardienne',
        variables: ['mere', 'gardienne'],
        exclusive: true,
    },
    besd4_importance: {
        label: 'Importance des vaccins',
        variables: [
            'besd4_pas_important',
            'besd4_peu_important',
            'besd4_moyen_important',
            'besd4_tres_important',
        ],
        exclusive: true,
    },
    besd6_confiance: {
        label: 'Confiance aux vaccinateurs',
        variables: [
            'besd6_aucune_confiance',
            'besd6_confiance_limitee',
            'besd6_confiance_moyenne',
            'besd6_grande_confiance',
        ],
        exclusive: true,
    },
    besd19_acces: {
        label: "Difficultés d'accès",
        variables: [
            'besd19_trajet',
            'besd19_horaires',
            'besd19_refoulement',
            'besd19_attente',
        ],
        exclusive: false,
    },
    besd21_problemes: {
        label: 'Problèmes des services',
        variables: [
            'besd21_rupture',
            'besd21_ouverture',
            'besd21_attente',
            'besd21_proprete',
            'besd21_formation',
            'besd21_respect',
            'besd21_temps',
        ],
        exclusive: false,
    },
};

