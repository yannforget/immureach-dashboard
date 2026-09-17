import type { EcvMetricKey } from '@/types'

// Explicit per-metric colours for the ECV evolution line chart. Any key
// not listed here falls back to ECV_LINE_PALETTE.
export const ECV_LINE_COLORS: Record<EcvMetricKey, string> = {
  possession_carte: '#0d9488',
  couverture_de_base: '#2563eb',
  couverture_complete: '#7c3aed',
  zero_dose: '#822121',
  bcg: '#059669',
  penta1: '#f59e0b',
  penta2: '#ea580c',
  penta3: '#d97706',
  polio0: '#0ea5e9',
  polio1: '#0284c7',
  polio2: '#0369a1',
  polio3: '#075985',
  pcv1: '#84cc16',
  pcv2: '#65a30d',
  pcv3: '#4d7c0f',
  rota1: '#ec4899',
  rota2: '#db2777',
  rota3: '#be185d',
  vpi: '#6366f1',
  var: '#f43f5e',
  vaa: '#f97316',
};

// Amber used to highlight the currently selected area/zone across charts
// (map selection, bar emphasis, ECV characteristics selected bar).
export const ECV_HIGHLIGHT_COLOR = '#ffdf33'

// Choropleth greys, for the two different reasons a shape can be colourless.
//
// NO_DATA is a shape the current selection *does* cover but for which the
// survey has no estimate — typically a health zone where the ribbon's
// rural/urbain filter left no child at all. It is deliberately dark: those
// zones are a finding in their own right (the survey did not reach that
// habitat there), so they must not read as background.
//
// OUT_OF_SCOPE is a shape outside the current selection, e.g. the rest of the
// country once a province is picked. That one stays pale so the selection
// reads as the subject of the map.
export const MAP_NO_DATA_COLOR = '#64748b'
export const MAP_OUT_OF_SCOPE_COLOR = '#e5e7eb'

// Blends two hex colors: ratio 0 -> base, 1 -> target.
function mixHex(base: string, target: string, ratio: number): string {
  const parse = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  const [br, bg, bb] = parse(base)
  const [tr, tg, tb] = parse(target)
  const ch = (b: number, t: number) => Math.round(b + (t - b) * ratio).toString(16).padStart(2, '0')
  return `#${ch(br, tr)}${ch(bg, tg)}${ch(bb, tb)}`
}

// Nuances of the highlight color used for the selected bar's stacked segments,
// so the segment split stays visible even when the whole bar is highlighted.
// Derived from ECV_HIGHLIGHT_COLOR so the shades always harmonize; series
// index picks a shade (index 0 = ECV_HIGHLIGHT_COLOR) and larger groups cycle
// through the ramp.
export const ECV_HIGHLIGHT_RAMP: string[] = [
  ECV_HIGHLIGHT_COLOR,
  mixHex(ECV_HIGHLIGHT_COLOR, '#000000', 0.2), // darker
  mixHex(ECV_HIGHLIGHT_COLOR, '#ffffff', 0.45), // lighter
  mixHex(ECV_HIGHLIGHT_COLOR, '#000000', 0.35), // much darker
  mixHex(ECV_HIGHLIGHT_COLOR, '#ffffff', 0.7), // much lighter
]

// Sequential ramp for the ECV characteristics heatmap (multi-select groups:
// difficultés d'accès, problèmes des services). Built around the amber the
// stacked groups give to "Gardienne" (ECV_CARACTERISTIC_SERIES_COLORS), so
// every cell here reads as a reported problem — the dashboard's teal is kept
// for the favourable end of the ordinal scales below.
export const ECV_HEATMAP_RAMP: string[] = [
  '#fffbeb',
  '#fde68a',
  '#fbbf24',
  '#f59e0b',
  '#b45309',
];

// Explicit colours for the ECV characteristics stacked groups, keyed by
// variable root. Roots absent from this map fall back to ECV_LINE_PALETTE by
// series index.
//
// BeSD4 (importance perçue) and BeSD6 (confiance) are ordinal scales, so their
// modalities get a diverging ramp instead of categorical colours: the
// dashboard teal for the best answer, through green-yellow and yellow, to
// orange-red for the worst. Mère / Gardienne is not ordinal — it keeps the
// teal/amber pair the categorical palette already gave it.
export const ECV_CARACTERISTIC_SERIES_COLORS: Record<string, string> = {
  mere: '#0d9488',
  gardienne: '#f59e0b',
  besd4_tres_important: '#0d9488',
  besd4_moyen_important: '#84cc16',
  besd4_peu_important: '#eab308',
  besd4_pas_important: '#ea580c',
  besd6_grande_confiance: '#0d9488',
  besd6_confiance_moyenne: '#84cc16',
  besd6_confiance_limitee: '#eab308',
  besd6_aucune_confiance: '#ea580c',
};

// Fallback categorical palette used only for metric keys missing from ECV_LINE_COLORS.
export const ECV_LINE_PALETTE: string[] = [
  '#0d9488',
  '#f59e0b',
  '#2563eb',
  '#f43f5e',
  '#7c3aed',
  '#059669',
  '#db2777',
  '#0891b2',
  '#d97706',
  '#4f46e5',
  '#65a30d',
  '#c026d3',
];

export const ANTENNE_PALETTE: string[] = [
  '#6366f1',
  '#f59e0b',
  '#8b5cf6',
  '#0ea5e9',
  '#84cc16',
  '#ec4899',
  '#f97316',
  '#14b8a6',
];

export const DASHBOARD_THEME: any = {
  color: [
    '#0d9488',
    '#0f766e',
    '#134e4a',
    '#475569',
    '#64748b',
    '#94a3b8',
  ],
  backgroundColor: 'transparent',
  textStyle: { fontFamily: 'DM Sans, sans-serif', color: '#334155', }, // slate-700
  title: {
    textStyle: { color: '#0f172a', }, // slate-900
    subtextStyle: { color: '#475569', }, // slate-600
  },
  line: { itemStyle: { borderWidth: 2, }, lineStyle: { width: 2, }, symbolSize: 6, },
  radar: { itemStyle: { borderWidth: 2, }, lineStyle: { width: 2, }, symbolSize: 6, },
  bar: { itemStyle: { barBorderRadius: [2, 2, 0, 0], }, },
  pie: { itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2, }, },
  scatter: { itemStyle: { borderWidth: 0, borderColor: '#fff', }, },
  boxplot: { itemStyle: { borderColor: '#fff', }, },
  parallel: { itemStyle: { borderWidth: 0, borderColor: '#fff', }, },
  sankey: { itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 1.5, }, },
  funnel: { itemStyle: { borderRadius: 2, borderColor: '#fff', borderWidth: 2, }, },
  gauge: { itemStyle: { borderRadius: 10, }, },
  candlestick: { itemStyle: { color: '#ec4899', color0: '#10b981', borderColor: '#ec4899', borderColor0: '#10b981', }, },
  graph: { itemStyle: { borderWidth: 0, borderColor: '#fff', }, lineStyle: { width: 1, color: '#aaa', }, symbolSize: 4, smooth: false, },
  map: {
    itemStyle: {
      areaColor: '#e2e8f0', // slate-200
      borderColor: '#cbd5e1', // slate-300
      borderWidth: 0.5,
    },
    emphasis: {
      itemStyle: {
        areaColor: '#fbbf24', // amber-400
        borderColor: '#f59e0b', // amber-500
        borderWidth: 1,
      },
    },
  },
  geo: {
    itemStyle: {
      areaColor: '#e2e8f0', // slate-200
      borderColor: '#cbd5e1', // slate-300
      borderWidth: 0.5,
    },
    emphasis: {
      itemStyle: {
        areaColor: '#fbbf24', // amber-400
        borderColor: '#f59e0b', // amber-500
        borderWidth: 1,
      },
    },
  },
  categoryAxis: {
    axisLine: { show: true, lineStyle: { color: '#cbd5e1', }, }, // slate-300
    axisTick: { lineStyle: { color: '#cbd5e1', }, }, // slate-300
    axisLabel: { color: '#475569', }, // slate-600
    splitLine: { lineStyle: { color: ['#e2e8f0'], }, }, // slate-200
    splitArea: { areaStyle: { color: ['rgba(0, 0, 0, 0.05)'], }, },
  },
  valueAxis: {
    axisLine: { show: true, lineStyle: { color: '#cbd5e1', }, }, // slate-300
    axisTick: { lineStyle: { color: '#cbd5e1', }, }, // slate-300
    axisLabel: { color: '#475569', }, // slate-600
    splitLine: { lineStyle: { color: ['#e2e8f0'], }, }, // slate-200
    splitArea: { areaStyle: { color: ['rgba(0, 0, 0, 0.05)'], }, },
  },
  logAxis: {
    axisLine: { show: true, lineStyle: { color: '#cbd5e1', }, }, // slate-300
    axisTick: { lineStyle: { color: '#cbd5e1', }, }, // slate-300
    axisLabel: { color: '#475569', }, // slate-600
    splitLine: { lineStyle: { color: ['#e2e8f0'], }, }, // slate-200
    splitArea: { areaStyle: { color: ['rgba(0, 0, 0, 0.05)'], }, },
  },
  timeAxis: {
    axisLine: { show: true, lineStyle: { color: '#cbd5e1', }, }, // slate-300
    axisTick: { lineStyle: { color: '#cbd5e1', }, }, // slate-300
    axisLabel: { color: '#475569', }, // slate-600
    splitLine: { lineStyle: { color: ['#e2e8f0'], }, }, // slate-200
    splitArea: { areaStyle: { color: ['rgba(0, 0, 0, 0.05)'], }, },
  },
  toolbox: {
    iconStyle: { borderColor: '#0d9488', }, // teal-600
    emphasis: { iconStyle: { borderColor: '#0f766e', }, }, // teal-800
  },
  legend: { textStyle: { color: '#475569', }, }, // slate-600

  tooltip: {
    backgroundColor: '#f8fafc', // slate-50
    borderColor: '#cbd5e1', // slate-300
    borderWidth: 1,
    textStyle: { color: '#0f172a', }, // slate-900
  },
  timeline: {
    lineStyle: {
      color: '#cbd5e1', // slate-300
      width: 1,
    },
    itemStyle: {
      color: '#0d9488', // teal-600
      borderWidth: 1,
    },
    controlStyle: {
      color: '#475569', // slate-600
      borderColor: '#cbd5e1', // slate-300
      borderWidth: 0.5,
    },
    checkpointStyle: {
      color: '#e34f07',
      borderColor: 'rgba(194, 53, 49, 0.5)',
    },
    label: { color: '#475569', }, // slate-600

    emphasis: {
      itemStyle: { color: '#0f766e', }, // teal-800
      controlStyle: {
        color: '#475569', // slate-600
        borderColor: '#cbd5e1', // slate-300
        borderWidth: 0.5,
      },
      label: { color: '#475569', }, // slate-600
    },
  },

  visualMap: { textStyle: { color: '#475569', }, }, // slate-600

  dataZoom: {
    backgroundColor: 'rgba(0, 0, 0, 0)',
    dataBackgroundColor: '#e2e8f0', // slate-200
    fillerColor: 'rgba(13, 148, 136, 0.1)', // teal-600 with alpha
    handleColor: '#0d9488', // teal-600
    handleSize: '100%',
    textStyle: { color: '#475569', }, // slate-600
  },
  markPoint: { label: { color: '#fff', }, emphasis: { label: { color: '#fff', }, }, },
};
