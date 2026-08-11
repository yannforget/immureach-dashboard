import type { EcvMetricKey } from '@/types'

// Explicit per-metric colours for the ECV evolution line chart. Any key
// not listed here falls back to ECV_LINE_PALETTE.
export const ECV_LINE_COLORS: Record<EcvMetricKey, string> = {
  possession_carte: '#0d9488',
  couverture_de_base: '#2563eb',
  couverture_complete: '#7c3aed',
  zero_dose: '#dc2626',
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
