import type { EChartsOption, TooltipComponentFormatterCallbackParams } from 'echarts'
import {
  ECV_CARACTERISTIC_SERIES_COLORS,
  ECV_HEATMAP_OUTLINE_COLOR,
  ECV_HEATMAP_RAMP,
  ECV_HIGHLIGHT_RAMP,
  ECV_LINE_PALETTE,
} from './theme'
import type { EcvCaracteristicBar, EcvCaracteristicGroup } from '@/hooks'

export interface EcvCaracteristicsConfig {
  group: EcvCaracteristicGroup
  areas: EcvCaracteristicBar[]
}

// Chart for the ECV household-characteristics survey. The group's `exclusive`
// flag picks the encoding, because the two kinds of group answer different
// questions:
//   exclusive — the variables are the modalities of one question (Mère /
//               Gardienne, BeSD4, BeSD6), so exactly one holds for each child.
//               Drawn as a stacked bar per area, y axis pinned to 100%: the
//               stack is a real composition and the segment splits are
//               comparable across areas.
//   otherwise — the variables are the options of a multi-select question
//               (BeSD19, BeSD21). A caregiver can name several difficulties,
//               so the answers overlap and there is no total to stack towards.
//               Drawn as a heatmap, one row per option and one column per
//               area, because stacking them put the axis at the mercy of the
//               tallest bar (BeSD21 stacks run from 14% to 420%, so a typical
//               bar used a quarter of the plot and over half the segments fell
//               under ~4px).
//
// Only `_pct` values are drawn; the `_low`/`_high` CI columns are surfaced in
// the tooltip only. The selected zone is marked with the dashboard's amber
// (ECV_HIGHLIGHT_RAMP) as the bar's fill in the stacked form, and with a blue
// column outline (ECV_HEATMAP_OUTLINE_COLOR) in the heatmap, whose own ramp is
// amber and would swallow an amber outline.
export function buildEcvCaracteristicsOptions(config: EcvCaracteristicsConfig): EChartsOption {
  return config.group.exclusive ? buildStackedOptions(config) : buildHeatmapOptions(config)
}

// Upper bound of the colour scale, rounded up to a multiple of ten as the rest
// of the dashboard's scales are. Below ten that rule would flatten the whole
// matrix to one shade — some rounds report these problems at well under 1% —
// so a short 1/2/5 ladder takes over for the rare options.
function heatmapMax(values: number[]): number {
  const peak = values.length > 0 ? Math.max(...values) : 0
  if (peak > 10) return Math.ceil(peak / 10) * 10
  return [1, 2, 5, 10].find(step => peak <= step) ?? 10
}

function buildHeatmapOptions(config: EcvCaracteristicsConfig): EChartsOption {
  const { group, areas } = config
  const names = areas.map(a => a.name)
  // Rows read top-down in the order the group declares its variables; the y
  // axis grows upward, hence the reversal. The group carries only the problem
  // options — the "no difficulty" / "satisfied" answer has its own tab, which
  // is what keeps the colour scale scaled to the problems rather than to a row
  // that reaches 100%.
  const rows = [...group.series].reverse()

  const cells: { value: [number, number, number | null]; itemStyle?: Record<string, unknown> }[] = []
  const numeric: number[] = []

  areas.forEach((area, x) => {
    rows.forEach((series, y) => {
      const pct = area.values[series.key]?.pct ?? null
      if (typeof pct === 'number') numeric.push(pct)
      cells.push({
        value: [x, y, pct],
        // The selected zone gets an outline rather than a fill: the cell has
        // to keep showing its value colour. Blue, not the dashboard amber —
        // the ramp underneath is amber, so an amber outline vanished on the
        // high-value cells it most needed to mark.
        itemStyle: area.highlighted
          ? { borderColor: ECV_HEATMAP_OUTLINE_COLOR, borderWidth: 2 }
          : undefined,
      })
    })
  })

  // Printing the value inside the cell only survives a handful of columns;
  // past that the numbers collide and the colour carries the reading.
  const showCellLabels = areas.length <= 8

  return {
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      formatter: (params: TooltipComponentFormatterCallbackParams) => {
        const p = Array.isArray(params) ? params[0] : params
        const [x, y, pct] = p.value as [number, number, number | null]
        const area = areas[x]
        const series = rows[y]
        if (!area || !series) return ''
        let html = `<strong>${area.name}</strong><br/>${series.label}: `
        html += pct == null ? '—' : `${pct.toFixed(1)}%`
        const ci = area.values[series.key]
        if (ci?.low != null && ci?.high != null) {
          html += `<br/>IC 95%: ${ci.low.toFixed(1)}% – ${ci.high.toFixed(1)}%`
        }
        // Multi-select: the rows overlap, so no column total is meaningful.
        html += '<br/><span style="opacity:.7">Choix multiples — un enfant peut compter dans plusieurs lignes</span>'
        return html
      },
    },
    visualMap: {
      type: 'continuous',
      min: 0,
      max: heatmapMax(numeric),
      calculable: false,
      orient: 'horizontal',
      top: 2,
      right: 10,
      itemWidth: 10,
      itemHeight: 90,
      inRange: { color: ECV_HEATMAP_RAMP },
      outOfRange: { color: '#e5e7eb' },
      textStyle: { color: '#475569', fontSize: 10 },
      text: [`${heatmapMax(numeric)}%`, '0%'],
    },
    grid: {
      left: 10,
      right: 12,
      top: 34,
      bottom: 8,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: names,
      splitArea: { show: false },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#475569',
        fontSize: 10,
        interval: 0,
        rotate: names.length > 6 ? 40 : 0,
      },
    },
    yAxis: {
      type: 'category',
      data: rows.map(s => s.label),
      splitArea: { show: false },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#475569',
        fontSize: 10,
        width: 130,
        overflow: 'truncate',
      },
    },
    series: [
      {
        name: group.label,
        type: 'heatmap',
        data: cells,
        itemStyle: { borderColor: '#ffffff', borderWidth: 1 },
        label: {
          show: showCellLabels,
          fontSize: 10,
          formatter: (p: { value?: unknown }) => {
            const pct = (p.value as [number, number, number | null])[2]
            return pct == null ? '' : pct.toFixed(0)
          },
        },
        emphasis: {
          itemStyle: { borderColor: ECV_HEATMAP_OUTLINE_COLOR, borderWidth: 2 },
        },
      },
    ],
  }
}

// Segment colour for a stacked group: the variable's own colour when the theme
// declares one (the ordinal BeSD4/BeSD6 ramps, Mère / Gardienne), otherwise the
// categorical palette by series index.
function seriesColor(key: string, index: number): string {
  return ECV_CARACTERISTIC_SERIES_COLORS[key] ?? ECV_LINE_PALETTE[index % ECV_LINE_PALETTE.length]
}

function buildStackedOptions(config: EcvCaracteristicsConfig): EChartsOption {
  const { group, areas } = config
  const names = areas.map(a => a.name)
  const multi = group.series.length > 1

  return {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      axisPointer: { type: 'shadow' },
      formatter: (params: TooltipComponentFormatterCallbackParams) => {
        const list = Array.isArray(params) ? params : [params]
        if (list.length === 0) return ''
        const areaName = String(list[0].name)
        let total = 0
        let html = `<strong>${areaName}</strong><br/>`
        for (const p of list) {
          const value = p.value
          if (typeof value !== 'number') {
            html += `${p.seriesName}: —<br/>`
            continue
          }
          total += value
          html += `${p.seriesName}: ${value.toFixed(1)}%<br/>`
        }
        if (list.length > 1) html += `Total: ${total.toFixed(1)}%`
        return html
      },
    },
    legend: multi
      ? { type: 'scroll', top: 4, left: 'center', textStyle: { fontSize: 11 } }
      : undefined,
    grid: {
      left: 10,
      right: 12,
      top: multi ? 40 : 16,
      bottom: 36,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: names,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: {
        color: '#475569',
        fontSize: 10,
        interval: 0,
        rotate: names.length > 10 ? 35 : 0,
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { show: false },
      axisLabel: { color: '#475569', formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#e2e8f0' } },
    },
    series: group.series.map((series, i) => ({
      name: series.label,
      type: 'bar',
      stack: 'total',
      barMaxWidth: 26,
      data: areas.map(a => ({
        value: a.values[series.key]?.pct ?? null,
        itemStyle: a.highlighted
          ? { color: ECV_HIGHLIGHT_RAMP[i % ECV_HIGHLIGHT_RAMP.length] }
          : undefined,
      })),
      itemStyle: { color: seriesColor(series.key, i) },
      emphasis: { itemStyle: { color: ECV_HIGHLIGHT_RAMP[0] } },
    })),
  }
}
