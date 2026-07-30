import type { EChartsOption } from 'echarts'
import type { IndicatorRow } from '@/hooks/useIndicatorComparison'

interface DumbbellConfig {
  items: IndicatorRow[]
}

// Palette pulled from the dashboard theme: teal for vaccinated (matches the
// existing coverage palette) and red for zero-dose (matches the zero-dose
// choropleth scale in mapOptions.ts).
const VACC = '#0d9488'
const ZD = '#b91c1c'
const CONNECTOR = '#cbd5e1'

export function buildDumbbellOptions(config: DumbbellConfig): EChartsOption {
  const { items } = config
  const categories = items.map((r) => r.label)
  // [categoryIndex, vaccinated, zero-dose] tuples drive the renderItem
  // connector below.
  const connectors = items.map((r, i) => [i, r.vacc, r.zd])
  const vaccPoints = items.map((r, i) => [r.vacc, i])
  const zdPoints = items.map((r, i) => [r.zd, i])

  return {
    grid: { left: 170, right: 32, top: 40, bottom: 32 },
    legend: {
      top: 8,
      right: 16,
      data: ['Vacciné', 'Zéro-dose'],
      textStyle: { color: '#475569' },
    },
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      axisPointer: { type: 'shadow' },
      // Cap tooltip width so the description wraps cleanly instead of running
      // off-screen on long lines.
      extraCssText: 'max-width: 320px; white-space: normal;',
      formatter: (params: any) => {
        const arr = Array.isArray(params) ? params : [params]
        const i = arr[0].dataIndex as number
        const r = items[i]
        const gap = r.gap
        const sign = gap > 0 ? '+' : ''
        const rawZd = r.zdRaw != null ? r.zdRaw.toFixed(2) : '—'
        const rawVacc = r.vaccRaw != null ? r.vaccRaw.toFixed(2) : '—'
        const desc = r.description
          ? `<div style="margin: 4px 0 6px; color:#475569; font-size: 11px; line-height: 1.35; white-space: normal;">${r.description}</div>`
          : ''
        return (
          `<strong>${r.label}</strong>` +
          desc +
          `<span style="color:${VACC}">●</span> Vacciné: ${r.vacc.toFixed(2)} (raw ${rawVacc})<br/>` +
          `<span style="color:${ZD}">●</span> Zéro-dose: ${r.zd.toFixed(2)} (raw ${rawZd})<br/>` +
          `Ecart (0-dose − vacc): ${sign}${gap.toFixed(2)}`
        )
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 1,
      name: 'scaled 0–1',
      nameLocation: 'middle',
      nameGap: 22,
      splitLine: { lineStyle: { color: '#f1f5f9' } },
      axisLabel: { color: '#475569' },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: categories,
      axisLabel: { color: '#334155', fontSize: 12 },
      axisTick: { show: false },
    },
    series: [
      {
        name: 'connector',
        type: 'custom',
        silent: true,
        data: connectors,
        renderItem: (_params: any, api: any) => {
          const cat = api.value(0)
          const p1 = api.coord([api.value(1), cat])
          const p2 = api.coord([api.value(2), cat])
          return {
            type: 'line',
            shape: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] },
            style: { stroke: CONNECTOR, lineWidth: 3 },
          }
        },
      },
      {
        name: 'Vacciné',
        type: 'scatter',
        symbolSize: 14,
        itemStyle: { color: VACC },
        data: vaccPoints,
        z: 3,
      },
      {
        name: 'Zéro-dose',
        type: 'scatter',
        symbolSize: 14,
        itemStyle: { color: ZD },
        data: zdPoints,
        z: 3,
      },
    ],
  }
}
