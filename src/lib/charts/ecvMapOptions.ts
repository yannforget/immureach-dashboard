import type { EChartsOption } from 'echarts'
import { getColorScaleBounds } from '@/lib/utils/dataUtils'
import { MAP_NO_DATA_COLOR, MAP_OUT_OF_SCOPE_COLOR } from '@/lib/charts/theme'
import type { EcvMapFeatureValue } from '@/hooks'

// Zoom bounds, shared with the map's +/- buttons. `1` is the fitted view.
export const ZOOM_MIN = 1
export const ZOOM_MAX = 12

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

  // Map-shape name (the raw, province-prefixed boundary name) -> the cleaned
  // name the rest of the dashboard shows. Used by every label and tooltip.
  const regionLabel = (params: { name: string }) =>
    byMapKey.get(params.name)?.displayName ?? params.name

  // Only in-province zones drive the color scale; dimmed (out-of-province)
  // zones keep their tooltip data but must not stretch the bounds.
  const numeric = values
    .filter(v => !v.dimmed)
    .map(v => v.pct)
    .filter((v): v is number => typeof v === 'number')
  const bounds = getColorScaleBounds(numeric)
  const min = bounds.min
  let max = bounds.max
  // Zero-dose rates are usually low single digits to low double digits — keep
  // a minimum spread so the scale doesn't collapse to a single color.
  if (max < 10) max = 10

  // Three kinds of shape, and they must not look alike:
  //  - one with an estimate, coloured by the visualMap ramp;
  //  - one the selection covers but the survey has no estimate for (most zones
  //    under the `urbain` filter, where no surveyed household was urban) —
  //    dark grey, because "the survey never reached this habitat here" is a
  //    finding of its own and must not read as background;
  //  - one outside the selected province — pale, so it reads as backdrop.
  //
  // How the two greys are applied is not interchangeable with the obvious
  // `itemStyle.areaColor`. This series renders through `geoIndex`, so ECharts
  // resolves each region's itemStyle off the *geo* model rather than off the
  // data item (MapDraw's `isGeo` branch) and a per-item `areaColor` is
  // silently dropped; the only per-item colour that survives is the fill the
  // visual pipeline computes. Hence: `visualMap: false` opts the item out of
  // the ramp, and `itemStyle.color` — the key that maps to `style.fill`, not
  // `areaColor` — is then what paints the shape.
  const greyShape = (mapKey: string, color: string) => ({
    name: mapKey,
    value: null,
    visualMap: false,
    itemStyle: { color },
  })

  const dataSeries = values.map(v =>
    v.dimmed
      ? greyShape(v.mapKey, MAP_OUT_OF_SCOPE_COLOR)
      : v.pct == null
        ? greyShape(v.mapKey, MAP_NO_DATA_COLOR)
        : { name: v.mapKey, value: v.pct },
  )

  const option: EChartsOption = {
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      formatter: (params: any) => {
        if (params.componentType !== 'series') return ''
        const entry = byMapKey.get(params.name)
        const displayName = entry?.displayName ?? params.name

        if (!entry || entry.pct == null) {
          return `<strong>${displayName}</strong><br/>Aucune donnée`
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
      // Unreachable in practice — every valueless shape opts out of the
      // ramp above — but a sane fallback if one ever slips through.
      outOfRange: {
        color: MAP_OUT_OF_SCOPE_COLOR,
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
      roam: true,
      scaleLimit: { min: ZOOM_MIN, max: ZOOM_MAX },
      selectedMode: 'single',
      // Shapes are registered under the province-prefixed boundary name
      // ("kl Mungindu", "kl Kwilu Province") because q103 alone is not unique
      // DRC-wide — so every label has to be routed through `regionLabel` or it
      // renders that raw key. `geo.select.label.show` defaults to *true*, and
      // this series draws through `geoIndex`, so the label of a clicked shape
      // comes from the geo model: without a formatter it showed the prefix.
      // GeoModel.getFormattedLabel resolves any non-normal status (select
      // included) against `emphasis.label.formatter`, hence the two below.
      label: { show: false, formatter: regionLabel },
      emphasis: { label: { show: false, formatter: regionLabel } },
      select: {
        label: {
          show: true,
          formatter: regionLabel,
          color: '#224387',
          fontSize: 12,
        },
      },
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