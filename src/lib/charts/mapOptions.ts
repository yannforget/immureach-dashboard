import type { EChartsOption } from 'echarts'
import type { ProvinceRow, ZoneRow, MetricKey } from '@/types'
import { METRIC_META, getColorScaleBounds } from '@/lib/dataUtils'

interface MapConfig {
  features: (ZoneRow | ProvinceRow)[]
  metric: MetricKey
  isZeroDose: boolean
  mapName: 'drc-provinces' | 'drc-zones'
  // [[minLon, minLat], [maxLon, maxLat]] — when set, ECharts fits the geo view
  // to these coords instead of auto-fitting the full registered map.
  boundingCoords?: [[number, number], [number, number]]
}

export function buildMapOptions(config: MapConfig): EChartsOption {
  const { features, metric, isZeroDose, mapName, boundingCoords } = config

  const metricMeta = METRIC_META[metric]

  // Collect numeric coverage values for colorscale bounds. Null predictions
  // (ungauged zones) are excluded so they don't drag the scale.
  const values = features
    .map(f => (f.properties as any)[metric])
    .filter((v): v is number => typeof v === 'number')
    .map(v => v * 100)

  let { min, max } = getColorScaleBounds(values)

  if (isZeroDose && max < 10) {
    max = 10
  }

  const dataSeries = features.map(f => {
    const rawValue = (f.properties as any)[metric]
    const value = typeof rawValue === 'number' ? rawValue * 100 : null
    return {
      // mapKey matches the registered map shape (raw province-prefixed name),
      // so two zones with the same cleaned name (e.g. "Bili") stay distinct.
      name: f.mapKey,
      value,
    }
  })

  const series: any[] = [
    {
      name: metricMeta.label,
      type: 'map',
      geoIndex: 0,
      data: dataSeries,
      // Tooltip already shows the cleaned displayName; suppress the in-shape
      // raw-name label that ECharts otherwise paints on hover/select.
      label: { show: false },
      itemStyle: {
        areaColor: '#e2e8f0',
        borderColor: '#cbd5e1',
        borderWidth: 0.5,
      },
      emphasis: {
        label: { show: false },
        itemStyle: {
          areaColor: '#bfdbfe',
          borderColor: '#0369a1',
          borderWidth: 1.5,
        },
      },
      select: {
        label: { show: false },
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
      appendToBody: true,
      formatter: (params: any) => {
        if (params.componentType !== 'series') return ''

        const feature = features.find(f => f.mapKey === params.name)
        const displayName = feature ? feature.displayName : params.name

        const value = params.value
        if (value == null) {
          return `<strong>${displayName}</strong><br/>No data`
        }
        if (!feature) return ''

        const displayPercentage = (value as number).toFixed(1)

        const countValue = (feature.properties as any)[metricMeta.countKey]
        const displayCount = typeof countValue === 'number'
          ? Math.round(countValue).toLocaleString()
          : '—'

        const birthsValue = (feature.properties as any).births_per_year
        const displayBirths = typeof birthsValue === 'number'
          ? Math.round(birthsValue).toLocaleString()
          : '—'

        let tooltip = `<strong>${displayName}</strong><br/>`
        tooltip += `${metricMeta.label}: ${displayPercentage}%<br/>`
        tooltip += `# Children: ${displayCount}<br/>`
        tooltip += `Births/Year: ${displayBirths}`
        return tooltip
      },
    },
    visualMap: {
      min: min,
      max: max,
      inRange: isZeroDose
        ? {
            color: ['#fee2e2', '#7f1d1d'], // light red to dark red
          }
        : {
            color: ['#d1fae5', '#047857'], // light green to dark green
          },
      outOfRange: {
        color: '#e5e7eb', // neutral grey for null / out-of-range values
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
      label: { show: false },
      emphasis: { label: { show: false } },
      ...(boundingCoords ? { boundingCoords } : {}),
    } as any,
    series: series as any,
  }

  return option
}
