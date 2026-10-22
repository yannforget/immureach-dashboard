import type { EChartsOption } from 'echarts'
import { CATEGORY_COLORS, CATEGORY_LABELS } from '@/hooks/determinants/useDeterminantData'
import { MAP_NO_DATA_COLOR, MAP_OUT_OF_SCOPE_COLOR } from '@/lib/charts/theme'
import { indicatorTooltipHtml } from '@/lib/charts/dumbbellOptions'
import { ZOOM_MAX, ZOOM_MIN } from '@/lib/charts/ecvMapOptions'
import type { BehaviourMapFeatureValue } from '@/hooks'

interface BehaviourMapConfig {
  values: BehaviourMapFeatureValue[]
  mapName: 'drc-provinces' | 'drc-zones'
  boundingCoords?: [[number, number], [number, number]]
}

// Each area is painted with the COM-B colour of its widest-gap indicator.
// Categorical fill, so no visualMap: the legend is drawn by the component.
export function buildBehaviourMapOptions(config: BehaviourMapConfig): EChartsOption {
  const { values, mapName, boundingCoords } = config

  const byMapKey = new Map(values.map(v => [v.mapKey, v]))
  const regionLabel = (params: { name: string }) =>
    byMapKey.get(params.name)?.displayName ?? params.name

  // A standalone map series (no `geoIndex`), so per-item `areaColor` is
  // honoured — the ecvMapOptions.ts workaround is not needed here. The fill is
  // repeated in emphasis/select so hover and selection only change the
  // outline and the category colour keeps reading.
  const dataSeries = values.map(v => {
    const areaColor = v.dimmed
      ? MAP_OUT_OF_SCOPE_COLOR
      : v.top?.category
        ? CATEGORY_COLORS[v.top.category]
        : MAP_NO_DATA_COLOR
    return {
      name: v.mapKey,
      value: v.top ? Math.abs(v.top.gap) : null,
      itemStyle: { areaColor },
      emphasis: { itemStyle: { areaColor } },
      select: { itemStyle: { areaColor } },
    }
  })

  return {
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      extraCssText: 'max-width: 320px; white-space: normal;',
      formatter: (params: any) => {
        if (params.componentType !== 'series') return ''
        const entry = byMapKey.get(params.name)
        const displayName = entry?.displayName ?? params.name
        const top = entry?.top
        if (!top || !top.category) {
          return `<strong>${displayName}</strong><br/>Aucune donnée`
        }
        const color = CATEGORY_COLORS[top.category]
        return (
          `<div style="color:#64748b; font-size: 11px;">${displayName} · ` +
          `<span style="color:${color}; font-weight: 600;">${CATEGORY_LABELS[top.category]}</span></div>` +
          indicatorTooltipHtml(top)
        )
      },
    },
    series: [
      {
        name: 'Indicateur dominant',
        type: 'map',
        map: mapName,
        roam: true,
        scaleLimit: { min: ZOOM_MIN, max: ZOOM_MAX },
        ...(boundingCoords ? { boundingCoords } : {}),
        data: dataSeries,
        selectedMode: 'single',
        // Labels routed through `regionLabel` so the raw, province-prefixed
        // shape key never shows (see ecvMapOptions.ts).
        label: { show: false, formatter: regionLabel },
        itemStyle: {
          areaColor: '#e2e8f0',
          borderColor: '#ffffff',
          borderWidth: 0.5,
        },
        emphasis: {
          label: { show: false, formatter: regionLabel },
          itemStyle: { borderColor: '#0f172a', borderWidth: 1.5 },
        },
        select: {
          label: { show: true, formatter: regionLabel, color: '#0f172a', fontSize: 12 },
          itemStyle: { borderColor: '#0f172a', borderWidth: 2.5 },
        },
      },
    ] as any,
  }
}
