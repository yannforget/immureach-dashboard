import type { EChartsOption } from 'echarts'

interface AccessibilityConfig {
  thresholds: number[]
  counts: number[]
  cumulativePct: number[]
  total: number
}

export function buildAccessibilityOptions(config: AccessibilityConfig): EChartsOption {
  const { thresholds, counts, cumulativePct, total } = config
  const categories = thresholds.map((t) => `≤ ${t} min`)

  return {
    grid: { left: 50, right: 24, top: 28, bottom: 40 },
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params
        const i = p.dataIndex as number
        const pct = cumulativePct[i].toFixed(1)
        const reached = Math.round(counts[i]).toLocaleString()
        const tot = Math.round(total).toLocaleString()
        return (
          `<strong>${categories[i]}</strong><br/>` +
          `${pct}% of 0-dose children<br/>` +
          `(${reached} of ${tot})`
        )
      },
    },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { color: '#475569', fontSize: 12 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { color: '#475569', formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#e2e8f0' } },
    },
    series: [
      {
        name: 'Cumulative share of 0-dose children',
        type: 'bar',
        data: cumulativePct.map((v) => Number(v.toFixed(2))),
        barWidth: '60%',
        // Pull bar fill from the teal palette set up in the dashboard theme
        // (theme.color[0] = teal-600).
        itemStyle: { color: '#0d9488' },
        emphasis: { itemStyle: { color: '#fbbf24' } },
        label: {
          show: true,
          position: 'top',
          color: '#0f172a',
          fontSize: 11,
          formatter: (params: any) => `${(params.value as number).toFixed(0)}%`,
        },
      },
    ],
  }
}
