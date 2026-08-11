import type {
  EChartsOption,
  TooltipComponentFormatterCallbackParams,
  LineSeriesOption,
} from 'echarts'
import { ECV_LINE_COLORS, ECV_LINE_PALETTE } from './theme'
import type { EcvLineSeries } from '@/hooks/ecv/useEcvEvolutionLineData'

interface EcvLineConfig {
  years: number[]
  series: EcvLineSeries[]
  selectedYear: number
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
  color: string,
): [LineSeriesOption, LineSeriesOption] {
  const lowerData = s.values.map((v, i) => s.ciLow[i] ?? v)
  const upperData = s.values.map((v, i) => {
    const low = s.ciLow[i] ?? v
    const high = s.ciHigh[i] ?? v
    if (low == null || high == null) return null
    return high - low
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
// Nulls create gaps (connectNulls: false) rather than drawing a 0. A dashed
// vertical markLine highlights the ribbon's selected year, so the single-year
// filter still reads as the "current" point.
export function buildEcvEvolutionLineOptions(config: EcvLineConfig): EChartsOption {
  const { years, series, selectedYear } = config

  const chartSeries: LineSeriesOption[] = series.flatMap((s, i) => {
    const color = seriesColor(series, i)
    const [ciLowSeries, ciHighSeries] = buildBandSeries(s, color)

    const lineSeries: LineSeriesOption = {
      name: s.name,
      type: 'line',
      data: s.values,
      connectNulls: false,
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: { width: 2 },
      itemStyle: { color },
      emphasis: { itemStyle: { color: '#fbbf24' } },
      z: 2,
    }
    if (i === 0) {
      lineSeries.markLine = {
        symbol: 'none',
        silent: true,
        lineStyle: { type: 'dashed', color: '#94a3b8' },
        label: { formatter: `${selectedYear}`, color: '#475569' },
        data: [{ xAxis: selectedYear }],
      }
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
      axisPointer: { type: 'line' },
      formatter: (params: TooltipComponentFormatterCallbackParams) => {
        const list = Array.isArray(params) ? params : [params]
        let html = `<strong>${list[0].name}</strong><br/>`
        for (const p of list) {
          const s = series.find(s => s.name === p.seriesName)
          if (!s) continue
          const v = p.value
          if (v == null) {
            html += `${s.name}: —<br/>`
            continue
          }
          let row = `${s.name}: ${Number(v).toFixed(1)}%`
          const low = s.ciLow[p.dataIndex]
          const high = s.ciHigh[p.dataIndex]
          if (low != null && high != null) {
            row += ` (IC 95%: ${low.toFixed(1)} – ${high.toFixed(1)})`
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
    xAxis: {
      type: 'category',
      data: years,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: { color: '#475569' },
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
