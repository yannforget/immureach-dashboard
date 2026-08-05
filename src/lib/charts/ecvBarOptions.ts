import type { EChartsOption } from 'echarts'

export interface EcvBarItem {
  name: string
  value: number | null
  ciLow: number | null
  ciHigh: number | null
}

interface EcvBarConfig {
  items: EcvBarItem[]
}

// Horizontal bar chart of vaccine-coverage percentages with a 95%-CI whisker
// overlaid on each bar. ECharts has no built-in error-bar series, so the CI
// is drawn with a `custom` series whose renderItem paints a line + two end
// caps at each bar's y-position — the standard ECharts error-bar pattern,
// mirrored for a horizontal (category-on-y, value-on-x) layout.
export function buildEcvVaccineBarOptions(config: EcvBarConfig): EChartsOption {
  const { items } = config

  const names = items.map(item => item.name)
  const values = items.map(item => item.value ?? 0)

  // [categoryIndex, ciLow, ciHigh] — falls back to the bar value itself when
  // a CI bound is missing, so the whisker collapses to a point rather than
  // drawing from/to 0.
  const errorBarData = items.map((item, i) => [
    i,
    item.ciLow ?? item.value ?? 0,
    item.ciHigh ?? item.value ?? 0,
  ])

  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return ''
        const item = items[params[0].dataIndex]
        if (!item) return ''

        let tooltip = `<strong>${item.name}</strong><br/>`
        tooltip += item.value != null ? `Couverture: ${item.value.toFixed(1)}%` : 'Couverture: —'
        if (item.ciLow != null && item.ciHigh != null) {
          tooltip += `<br/>IC 95%: ${item.ciLow.toFixed(1)}% – ${item.ciHigh.toFixed(1)}%`
        }
        return tooltip
      },
    },
    grid: {
      left: 10,
      right: 40,
      top: 20,
      bottom: 20,
      containLabel: true,
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: { color: '#475569', formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#e2e8f0' } },
    },
    yAxis: {
      type: 'category',
      data: names,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#334155', fontSize: 12 },
      splitLine: { show: false },
    },
    series: [
      {
        name: 'Couverture',
        type: 'bar',
        data: values,
        barWidth: '55%',
        itemStyle: { color: '#0d9488' },
        emphasis: { itemStyle: { color: '#fbbf24' } },
        label: {
          show: true,
          position: 'right',
          color: '#334155',
          fontSize: 11,
          formatter: (p: any) => `${Number(p.value).toFixed(1)}%`,
        },
        z: 2,
      },
      {
        name: 'IC 95%',
        type: 'custom',
        coordinateSystem: 'cartesian2d',
        renderItem: (_params: any, api: any) => {
          const categoryIndex = api.value(0)
          const lowPoint = api.coord([api.value(1), categoryIndex])
          const highPoint = api.coord([api.value(2), categoryIndex])
          const halfWidth = 5
          const style = api.style({
            stroke: '#0f766e',
            fill: undefined,
            lineWidth: 1.5,
          })
          return {
            type: 'group',
            children: [
              {
                type: 'line',
                shape: { x1: lowPoint[0], y1: lowPoint[1], x2: highPoint[0], y2: highPoint[1] },
                style,
              },
              {
                type: 'line',
                shape: {
                  x1: lowPoint[0],
                  y1: lowPoint[1] - halfWidth,
                  x2: lowPoint[0],
                  y2: lowPoint[1] + halfWidth,
                },
                style,
              },
              {
                type: 'line',
                shape: {
                  x1: highPoint[0],
                  y1: highPoint[1] - halfWidth,
                  x2: highPoint[0],
                  y2: highPoint[1] + halfWidth,
                },
                style,
              },
            ],
          }
        },
        data: errorBarData,
        encode: { x: [1, 2], y: 0 },
        // Purely decorative — the `bar` series above already handles hover
        // and the axis tooltip already surfaces the CI text.
        silent: true,
        z: 3,
      },
    ] as any,
  }

  return option
}