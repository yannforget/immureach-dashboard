import type { EChartsOption } from 'echarts'
import type { DeterminantVariable } from '@/types'
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/hooks/determinants/useDeterminantData'

export interface DeterminantRadarConfig {
  variables: DeterminantVariable[]
}

const CATEGORY_ORDER_LIST = ['Capacity', 'Motivation', 'Opportunity'] as const

// The long human descriptions (e.g. "Perceived ease to vaccinate children")
// would overlap badly across 26 spokes, so axes carry a short, word-wrapped
// version derived from the source description while the full text lives in the
// tooltip.
function shorten(name: string): string {
  const words = name.trim().split(/\s+/)
  return words
    .reduce<string[]>((acc, word) => {
      const current = acc[acc.length - 1]
      if (current && (current + ' ' + word).length <= 16) {
        acc[acc.length - 1] = current + ' ' + word
      } else {
        acc.push(word)
      }
      return acc
    }, [])
    .join(' ')
}

// Single radar chart with one spoke per determinant variable. 
// Each spoke is coloured by its COM-B category so the three groups read clearly at a glance; 
// the ring area is drawn in a soft teal to keep the overall palette consistent with the rest of the dashboard.
// Values are log-scaled (1-100) so variables with near-zero influence remain visible.
export function buildDeterminantRadarOptions(config: DeterminantRadarConfig): EChartsOption {
  const { variables } = config
  const maxInfluence = Math.max(...variables.map(v => v.scaled_ri))
  const roundedMax = Math.ceil(maxInfluence / 10) * 10

  return {
    tooltip: { show: false },
    legend: {
      orient: 'horizontal',
      top: 4,
      left: 'center',
      data: CATEGORY_ORDER_LIST.map(c => CATEGORY_LABELS[c]),
      textStyle: { fontSize: 11, color: '#475569' },
      itemWidth: 12,
      itemHeight: 12,
    },
    radar: {
      center: ['50%', '56%'],
      radius: '66%',
      startAngle: 90,
      shape: 'polygon',
      splitNumber: 4,
      axisNameGap: 20,
      axisName: {
        fontSize: 10,
        lineHeight: 11,
        backgroundColor: 'rgba(248,250,252,0.7)',
        borderRadius: 2,
        padding: [1, 2],
        rich: {
          cap: { color: CATEGORY_COLORS.Capacity, fontWeight: 'bold' },
          mot: { color: CATEGORY_COLORS.Motivation, fontWeight: 'bold' },
          opp: { color: CATEGORY_COLORS.Opportunity, fontWeight: 'bold' },
        },
        formatter: (name?: string) => {
          const v = variables.find(x => shorten(x.var_description) === name)
          if (!v) return name ?? ''
          const key =
            v.category === 'Capacity'
              ? 'cap'
              : v.category === 'Motivation'
                ? 'mot'
                : 'opp'
          return `{${key}|${name}}`
        },
      },
      splitLine: { lineStyle: { color: '#e2e8f0' } },
      splitArea: { areaStyle: { color: ['rgba(13,148,136,0.03)', 'rgba(13,148,136,0.06)'] } },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      indicator: variables.map(v => ({
        name: shorten(v.var_description),
        max: roundedMax,
      })),
    },
    series: [
      {
        type: 'radar',
        symbol: 'circle',
        symbolSize: 3,
        // cursor: 'default',
        silent: true,
        data: [
          {
            name: 'Influence relative',
            value: variables.map(v => v.scaled_ri),
            lineStyle: { color: '#0d9488', width: 1.75 },
            itemStyle: { color: '#0d9488' },
            areaStyle: { color: 'rgba(13,148,136,0.18)' },
            emphasis: { itemStyle: { color: '#fbbf24' } },
          },
        ],
      },
    ],
  }
}
