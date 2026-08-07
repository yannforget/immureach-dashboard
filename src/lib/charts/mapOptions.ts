import type { EChartsOption } from 'echarts'
import type { ProvinceRow, ZoneRow, MetricKey, AntenneGroup } from '@/types'
import { MODEL_METRIC_META } from '@/lib/utils/constants'
import { getColorScaleBounds } from '@/lib/utils/dataUtils'

interface MapConfig {
  features: (ZoneRow | ProvinceRow)[]
  metric: MetricKey
  isZeroDose: boolean
  mapName: 'drc-provinces' | 'drc-zones'
  // [[minLon, minLat], [maxLon, maxLat]] — when set, ECharts fits the geo view
  // to these coords instead of auto-fitting the full registered map.
  boundingCoords?: [[number, number], [number, number]]
  // When set, recolour zones into categorical antenne groups instead of the
  // metric choropleth. The tooltip still shows the metric value.
  antenneOverlay?: AntenneGroup[]
}

type MetricProperties = Partial<Record<MetricKey, number | null>>
export function buildMapOptions(config: MapConfig): EChartsOption {
  const { features, metric, isZeroDose, mapName, boundingCoords, antenneOverlay } = config

  // Per-mapKey lookup of group color + head flag. Built once so the tooltip
  // can resolve antenne info from `params.name` in O(1).
  const antenneByMapKey = new Map<string, { color: string; isHead: boolean; antenne: string }>()
  if (antenneOverlay) {
    for (const group of antenneOverlay) {
      for (const mapKey of group.memberMapKeys) {
        antenneByMapKey.set(mapKey, {
          color: group.color,
          isHead: mapKey === group.headMapKey,
          antenne: group.antenne,
        })
      }
    }
  }

  const metricMeta = MODEL_METRIC_META[metric]

  // Collect numeric coverage values for colorscale bounds. Null predictions
  // (ungauged zones) are excluded so they don't drag the scale.
  const values = features
    .map(f => (f.properties as MetricProperties)[metric])
    .filter((v): v is number => typeof v === 'number')
    .map(v => v * 100)

  const bounds = getColorScaleBounds(values)
  const min = bounds.min
  let max = bounds.max

  if (isZeroDose && max < 10) {
    max = 10
  }

  const dataSeries = features.map(f => {
    const rawValue = (f.properties as MetricProperties)[metric]
    const value = typeof rawValue === 'number' ? rawValue * 100 : null
    // mapKey matches the registered map shape (raw province-prefixed name),
    // so two zones with the same cleaned name (e.g. "Bili") stay distinct.
    return { name: f.mapKey, value }
  })

  // Colour individual shapes via `geo.regions[].itemStyle`. That's the only
  // path that consistently overrides the geo default fill when the map
  // series is bound through `geoIndex`; per-datum `itemStyle` does not
  // paint geo polygons in that setup. Zones that aren't in any group are
  // left unspecified and fall through to the theme's default geo styling.
  // The antenne head is highlighted by a separate marker series (below),
  // not by a per-shape border.
  const geoRegions = antenneOverlay?.flatMap(group =>
    group.memberMapKeys.map(mapKey => ({
      name: mapKey,
      itemStyle: { areaColor: group.color, borderColor: '#ffffff', borderWidth: 0.5 },
    })),
  )

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

  // SVG path for the antenne head marker: a small broadcast-tower silhouette
  // (triangular body, two crossbars, antenna spike). Drawn in the group's
  // colour so the marker, label, and zone fill all read as one cluster.
  const ANTENNE_ICON = 'path://M0,-12 L-8,10 L8,10 Z M-4,3 L4,3 M-2,-4 L2,-4 M0,-12 L0,-16'

  if (antenneOverlay) {
    const markerData = antenneOverlay
      .filter(g => g.headCentroid !== null)
      .map(g => ({
        name: g.antenne,
        value: g.headCentroid as [number, number],
        itemStyle: { color: g.color },
        label: {
          show: true,
          position: 'top' as const,
          formatter: g.antenne,
          color: g.color,
          fontWeight: 'bold' as const,
          fontSize: 12,
          backgroundColor: 'rgba(255,255,255,0.85)',
          padding: [2, 5],
          borderRadius: 3,
        },
      }))
    if (markerData.length > 0) {
      series.push({
        type: 'scatter',
        coordinateSystem: 'geo',
        geoIndex: 0,
        data: markerData,
        symbol: ANTENNE_ICON,
        symbolSize: 22,
        // Render above the map shapes and ignore mouse events so the zone
        // tooltip / click handlers still fire through the marker.
        z: 10,
        silent: true,
      })
    }
  }

  const option: EChartsOption = {
    // When the antenne overlay is on we omit `visualMap` (so the choropleth
    // gradient stops mapping values to colours) and let `geo.regions` paint
    // each shape. The CoverageMap component also keys EChartsReact on
    // `showAntenne`, so toggling forces a remount — that prevents the
    // previous visualMap or regions block from lingering through a merge.
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
        tooltip += `# Enfants: ${displayCount}<br/>`
        tooltip += `Naissances/An: ${displayBirths}`
        if (antenneOverlay) {
          const entry = antenneByMapKey.get(params.name)
          if (entry) {
            tooltip += `<br/>Antenne: ${entry.antenne}${entry.isHead ? ' (head)' : ''}`
          }
        }
        return tooltip
      },
    },
    ...(antenneOverlay
      ? {}
      : {
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
      }),
    geo: {
      map: mapName,
      roam: false,
      selectedMode: 'single',
      label: { show: false },
      emphasis: { label: { show: false } },
      ...(geoRegions ? { regions: geoRegions } : {}),
      ...(boundingCoords ? { boundingCoords } : {}),
    } as EChartsOption['geo'],
    series, //: series as any,
  }

  return option
}
