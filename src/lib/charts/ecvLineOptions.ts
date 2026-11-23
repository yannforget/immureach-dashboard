import type {
  EChartsOption,
  TooltipComponentFormatterCallbackParams,
  LineSeriesOption,
} from 'echarts'
import { ECV_LINE_COLORS, ECV_LINE_PALETTE } from './theme'
import type { EcvLineSeries } from '@/hooks'

interface EcvLineConfig {
  years: number[]
  series: EcvLineSeries[]
  scopeLabel: string
}

// Picks a series colour from ECV_LINE_COLORS. Unknown metric keys cycle the fallback palette.
function seriesColor(series: EcvLineSeries[], index: number): string {
  const key = series[index].key
  return ECV_LINE_COLORS[key] ?? ECV_LINE_PALETTE[index % ECV_LINE_PALETTE.length]
}

// The 95% CI is drawn as a continuous band rather than one bar per year.
// ECharts has no built-in band, so we fake it with two stacked line series
// sharing a per-metric stack name: the first spans 0 → ciLow (transparent),
// the second spans ciLow → ciHigh and carries the visible, translucent fill.
// A missing CI bound collapses to the point value itself, so the band thins
// to the line instead of drawing from/to 0. Both series share the line's name
// so the legend toggles line + band together, and are silenced/excluded from
// the tooltip.
function buildBandSeries(
  s: EcvLineSeries,
  years: number[],
  color: string,
): [LineSeriesOption, LineSeriesOption] {
  const lowerData = s.values.map((v, i) => [years[i], s.ciLow[i] ?? v])
  const upperData = s.values.map((v, i) => {
    const low = s.ciLow[i] ?? v
    const high = s.ciHigh[i] ?? v
    if (low == null || high == null) return [years[i], null]
    return [years[i], high - low]
  })

  const base: LineSeriesOption = {
    name: s.name,
    type: 'line',
    stack: `ci-${s.key}`,
    connectNulls: false,
    symbol: 'none',
    silent: true,
    tooltip: { show: false },
    z: 1,
    itemStyle: { opacity: 0 },
    lineStyle: { opacity: 0 },
  }

  return [
    {
      ...base,
      data: lowerData,
      areaStyle: { opacity: 0 },
    },
    {
      ...base,
      data: upperData,
      areaStyle: { color, opacity: 0.18 },
    },
  ]
}

// Line chart of ECV coverage rates across survey years — one line per
// selected variable, each overlaid with a translucent 95%-CI band. 
// Nulls create gaps (connectNulls: false) rather than drawing a 0.
export function buildEcvEvolutionLineOptions(config: EcvLineConfig): EChartsOption {
  const { years, series } = config

  const chartSeries: LineSeriesOption[] = series.flatMap((s, i) => {
    const color = seriesColor(series, i)
    const [ciLowSeries, ciHighSeries] = buildBandSeries(s, years, color)

    const lineSeries: LineSeriesOption = {
      name: s.name,
      type: 'line',
      data: s.values.map((v, j) => [years[j], v]),
      connectNulls: false,
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: { width: 2 },
      itemStyle: { color },
      emphasis: { itemStyle: { color: '#fbbf24' } },
      z: 2,
    }

    // Line series must come first: the legend derives each item's colour from
    // the first series sharing that name (getSeriesByName(name)[0]), and the
    // transparent band series would otherwise make the legend icon invisible.
    return [lineSeries, ciLowSeries, ciHighSeries]
  })

  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      axisPointer: { type: 'line', snap: true },
      formatter: (params: TooltipComponentFormatterCallbackParams) => {
        const list = Array.isArray(params) ? params : [params]
        // On a value axis the hovered year comes from the data point itself.
        const firstValue = list[0].value
        const year = Array.isArray(firstValue) ? firstValue[0] : list[0].name
        let html = `<strong>${year}</strong><br/>`
        for (const p of list) {
          const s = series.find(s => s.name === p.seriesName)
          if (!s) continue
          const v = Array.isArray(p.value) ? p.value[1] : p.value
          if (v == null) {
            html += `${s.name}: —<br/>`
            continue
          }
          let row = `${s.name}: ${Number(v).toFixed(1)}%`
          const low = s.ciLow[p.dataIndex]
          const high = s.ciHigh[p.dataIndex]
          if (low != null && high != null) {
            row += ` (IC 95%: ${low.toFixed(1)} – ${high.toFixed(1)})`
          } else {
            row += ' (IC 95%: NA)'
          }
          html += `${row}<br/>`
        }
        return html
      },
    },
    legend: {
      type: 'scroll',
      top: 8,
      left: 'center',
    },
    grid: {
      left: 12,
      right: 16,
      top: 48,
      bottom: 24,
      containLabel: true,
    },
    // Numeric axis (not category) so spacing is proportional to elapsed time:
    // a 2024 → 2026 gap is drawn twice as wide as 2023 → 2024. Ticks and
    // labels are pinned to the survey years so in-between years (e.g. 2025)
    // don't get a label.
    xAxis: {
      type: 'value',
      // Half-year padding so the first/last points aren't flush with the edge.
      min: years[0] - 0.5,
      max: years[years.length - 1] + 0.5,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { lineStyle: { color: '#cbd5e1' }, customValues: years },
      axisLabel: { color: '#475569', customValues: years, formatter: (v: number) => String(v) },
      splitLine: { show: false },
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
    series: chartSeries,
  }

  return option
}
