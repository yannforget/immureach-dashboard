import type { EChartsOption } from 'echarts'

interface BarItem {
  name: string
  value: number
  count?: number
  id?: string
}

interface BarConfig {
  items: BarItem[]
  hoveredId: string | null
  metricLabel: string
  suffix: string
  isZeroDose?: boolean
}

export function buildBarOptions(config: BarConfig): EChartsOption {
  const { items, hoveredId, metricLabel, suffix, isZeroDose = false } = config

  // Sort items in descending order (largest at top)
  const sortedItems = [...items].sort((a, b) => a.value - b.value)

  const names = sortedItems.map(item => item.name)
  const values = sortedItems.map(item => item.value)
  const ids = sortedItems.map(item => item.id || item.name)

  // Create item style with hover highlight
  const itemStyles = ids.map(id => ({
    color: hoveredId === id ? '#fbbf24' : '#0d9488', // amber vs teal
  }))

  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
      },
      formatter: (params: any) => {
        if (Array.isArray(params) && params.length > 0) {
          const param = params[0]
          const dataIndex = param.dataIndex
          const item = sortedItems[dataIndex]

          // Format percentage consistently: (value * 100).toFixed(1) for coverage, just toFixed(1) for zero-dose
          const displayValue = isZeroDose
            ? (item.value).toFixed(1)
            : (item.value).toFixed(1)

          // Format count if available
          let tooltip = `<strong>${item.name}</strong><br/>`
          tooltip += `${metricLabel}: ${displayValue}${suffix}`

          if (typeof item.count === 'number') {
            const displayCount = Math.round(item.count).toLocaleString()
            tooltip += `<br/># Children: ${displayCount}`
          }

          return tooltip
        }
        return ''
      },
    },
    grid: {
      left: 10,
      right: 20,
      top: 20,
      bottom: 20,
      containLabel: false,
    },
    xAxis: {
      type: 'value',
      axisLine: {
        lineStyle: {
          color: '#cbd5e1',
        },
      },
      axisTick: {
        lineStyle: {
          color: '#cbd5e1',
        },
      },
      axisLabel: {
        color: '#475569',
      },
      splitLine: {
        lineStyle: {
          color: '#e2e8f0',
        },
      },
    },
    yAxis: {
      type: 'category',
      data: names,
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        show: false,
      },
      splitLine: {
        show: false,
      },
    },
    series: [
      {
        name: metricLabel,
        type: 'bar',
        data: values.map((v, i) => ({
          value: v,
          itemStyle: itemStyles[i],
        })),
        barWidth: '60%',
        barGap: '8%',
        label: {
          show: true,
          position: 'insideLeft',
          color: '#ffffff',
          fontSize: 12,
          fontWeight: 500,
          distance: 4,
          formatter: (params: any) => names[params.dataIndex] || '',
        },
        emphasis: {
          itemStyle: {
            color: '#fbbf24',
          },
          label: {
            color: '#000000',
          },
        },
      },
    ],
  }

  return option
}
