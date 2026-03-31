import type { EChartsOption } from 'echarts'
import type { ProvinceRow, ZoneRow, MetricKey } from '@/types'
import { METRIC_META, getColorScaleBounds } from '@/lib/dataUtils'

interface MapConfig {
  features: (ZoneRow | ProvinceRow)[]
  metric: MetricKey
  isZeroDose: boolean
  mapName: 'drc-provinces' | 'drc-zones'
  showAntennes?: boolean
  zoneRows?: ZoneRow[]
}

export function buildMapOptions(config: MapConfig): EChartsOption {
  const {
    features,
    metric,
    isZeroDose,
    mapName,
    showAntennes = false,
    zoneRows = [],
  } = config

  const metricMeta = METRIC_META[metric]

  // Get coverage values for colorscale bounds
  const values = features.map(f => {
    const value = (f.properties as any)[metric]
    const numValue = typeof value === 'number' ? value : 0
    // Multiply all percentages by 100
    return numValue * 100
  })

  // Calculate bounds separately for coverage vs zero-dose
  // This ensures all coverage metrics share the same scale, and zero-dose metrics share their own
  let { min, max } = getColorScaleBounds(values)

  // For zero-dose metrics, use a reasonable range (0-10 children by default)
  if (isZeroDose && max < 10) {
    max = 10
  }

  // Prepare data series - either coverage or antenne data
  let dataSeries: any[]
  let seriesName: string

  if (showAntennes && zoneRows.length > 0) {
    // Show binary antenne map
    seriesName = 'Antennes'
    dataSeries = features.map(f => {
      const isAntenne = (f.properties as any).is_antenne === true
      return {
        name: f.displayName,
        value: isAntenne ? 1 : 0,
      }
    })
  } else {
    // Show coverage map
    seriesName = metricMeta.label
    dataSeries = features.map(f => {
      const rawValue = (f.properties as any)[metric] ?? 0
      const value = rawValue * 100
      return {
        name: f.displayName,
        value,
      }
    })
  }

  const series: any[] = [
    {
      name: seriesName,
      type: 'map',
      geoIndex: 0,
      data: dataSeries,
      itemStyle: {
        areaColor: '#e2e8f0',
        borderColor: '#cbd5e1',
        borderWidth: 0.5,
      },
      emphasis: {
        itemStyle: {
          areaColor: '#bfdbfe',
          borderColor: '#0369a1',
          borderWidth: 1.5,
        },
      },
      select: {
        itemStyle: {
          areaColor: '#fbbf24', // Yellow color for selected areas
          borderColor: '#f59e0b',
          borderWidth: 2,
        },
      },
      selectedMode: 'single', // Allow selecting one area at a time
    },
  ]

  const option: EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        if (params.componentType === 'series') {
          if (params.seriesName === 'Antennes') {
            return `${params.name}<br/>⭐ Antenne`
          }

          // Find the corresponding feature for this area
          const feature = features.find(f => f.displayName === params.name)
          if (!feature) return ''

          const value = params.value
          const displayPercentage = typeof value === 'number'
            ? (value).toFixed(1)
            : value

          // Get count value
          const countValue = (feature.properties as any)[metricMeta.countKey]
          const displayCount = typeof countValue === 'number'
            ? Math.round(countValue).toLocaleString()
            : '—'

          // Get births per year
          const birthsValue = (feature.properties as any).births_per_year
          const displayBirths = typeof birthsValue === 'number'
            ? Math.round(birthsValue).toLocaleString()
            : '—'

          // Build tooltip with 3 data points
          let tooltip = `<strong>${params.name}</strong><br/>`
          tooltip += `${metricMeta.label}: ${displayPercentage}%<br/>`
          tooltip += `# Children: ${displayCount}<br/>`
          tooltip += `Births/Year: ${displayBirths}`

          return tooltip
        }
        return ''
      },
    },
    visualMap: showAntennes
      ? {
          min: 0,
          max: 1,
          inRange: {
            color: ['#e5e7eb', '#dc2626'], // light gray for 0 (non-antenne), red for 1 (antenne)
          },
          show: false, // Hide the legend but keep the color mapping
        }
      : {
          min: min,
          max: max,
          inRange: isZeroDose
            ? {
                color: ['#fee2e2', '#7f1d1d'], // light red to dark red
              }
            : {
                color: ['#d1fae5', '#047857'], // light green to dark green
              },
          textStyle: {
            color: '#475569',
            fontSize: 12,
          },
          bottom: 20,
          left: 20,
          orient: 'vertical',
          text: [`${Math.round(max)}%`, `${Math.round(min)}%`],
        },
    geo: {
      map: mapName,
      roam: false,
      selectedMode: 'single',
    } as any,
    series: series as any,
  }

  return option
}
