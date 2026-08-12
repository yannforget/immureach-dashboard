import type { EChartsOption } from 'echarts'
import { getColorScaleBounds } from '@/lib/utils/dataUtils'
import type { EcvMapFeatureValue } from '@/hooks'

interface EcvMapConfig {
  values: EcvMapFeatureValue[]
  mapName: 'drc-provinces' | 'drc-zones'
  // [[minLon, minLat], [maxLon, maxLat]] — when set, ECharts fits the geo view
  // to these coords instead of auto-fitting the full registered map.
  boundingCoords?: [[number, number], [number, number]]
}

export function buildEcvZeroDoseMapOptions(config: EcvMapConfig): EChartsOption {
  const { values, mapName, boundingCoords } = config

  const byMapKey = new Map(values.map(v => [v.mapKey, v]))

  const numeric = values.map(v => v.pct).filter((v): v is number => typeof v === 'number')
  const bounds = getColorScaleBounds(numeric)
  const min = bounds.min
  let max = bounds.max
  // Zero-dose rates are usually low single digits to low double digits — keep
  // a minimum spread so the scale doesn't collapse to a single color.
  if (max < 10) max = 10

  const dataSeries = values.map(v => ({ name: v.mapKey, value: v.pct }))

  const option: EChartsOption = {
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      formatter: (params: any) => {
        if (params.componentType !== 'series') return ''
        const entry = byMapKey.get(params.name)
        const displayName = entry?.displayName ?? params.name

        if (!entry || entry.pct == null) {
          return `<strong>${displayName}</strong><br/>Pas de données`
        }

        let tooltip = `<strong>${displayName}</strong><br/>`
        tooltip += `Zéro dose: ${entry.pct.toFixed(1)}%`
        if (entry.ciLow != null && entry.ciHigh != null) {
          tooltip += `<br/>IC 95%: ${entry.ciLow.toFixed(1)}% – ${entry.ciHigh.toFixed(1)}%`
        }
        return tooltip
      },
    },
    visualMap: {
      min,
      max,
      inRange: {
        color: ['#fee2e2', '#7f1d1d'], // light red to dark red
      },
      outOfRange: {
        color: '#e5e7eb', // neutral grey for null values
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
    series: [
      {
        name: 'Zéro dose',
        type: 'map',
        geoIndex: 0,
        data: dataSeries,
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
            areaColor: '#fbbf24',
            borderColor: '#f59e0b',
            borderWidth: 2,
          },
        },
        selectedMode: 'single',
      },
    ] as any,
  }

  return option
}