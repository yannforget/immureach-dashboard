import type {
  EChartsOption,
  TooltipComponentFormatterCallbackParams,
  CustomSeriesRenderItem,
  CustomSeriesRenderItemAPI,
  CustomSeriesRenderItemParams,
  LineSeriesOption,
  CustomSeriesOption,
} from 'echarts'
import { ECV_LINE_PALETTE, ZERO_DOSE_COLOR } from './theme'
import type { EcvLineSeries } from '@/hooks/ecv/useEcvEvolutionLineData'

interface EcvLineConfig {
  years: number[]
  series: EcvLineSeries[]
  selectedYear: number
  scopeLabel: string
}

// Picks a series colour: zero-dose is always red (headline indicator), while
// every other variable cycles the categorical palette. Palette slots are
// counted over non-zero-dose series only, so zero-dose's red can never collide
// with a palette colour regardless of selection order.
function seriesColor(series: EcvLineSeries[], index: number): string {
  if (series[index].key === 'zero_dose') return ZERO_DOSE_COLOR
  const paletteIndex = series.slice(0, index).filter(s => s.key !== 'zero_dose').length
  return ECV_LINE_PALETTE[paletteIndex % ECV_LINE_PALETTE.length]
}

// Vertical 95%-CI whisker drawn with a `custom` series — ECharts has no
// built-in error-bar series for line charts, so this mirrors the ECV bar
// chart's CI overlay (a line + two end caps per point).
const renderErrorBar: CustomSeriesRenderItem = (
  _params: CustomSeriesRenderItemParams,
  api: CustomSeriesRenderItemAPI,
) => {
  const categoryIndex = api.value(0)
  const low = api.value(1)
  const high = api.value(2)
  if (low == null || high == null) return null

  const lowPoint = api.coord([categoryIndex as number, low as number])
  const highPoint = api.coord([categoryIndex as number, high as number])
  const halfWidth = 5
  const style = api.style({
    stroke: api.visual('color') as string,
    fill: undefined,
    lineWidth: 1.5,
  })

  return {
    type: 'group',
    children: [
      {
        type: 'line',
        shape: { x1: lowPoint[0], y1: lowPoint[1], x2: highPoint[0], y2: highPoint[1] },
        style,
      },
      {
        type: 'line',
        shape: { x1: lowPoint[0] - halfWidth, y1: lowPoint[1], x2: lowPoint[0] + halfWidth, y2: lowPoint[1] },
        style,
      },
      {
        type: 'line',
        shape: { x1: highPoint[0] - halfWidth, y1: highPoint[1], x2: highPoint[0] + halfWidth, y2: highPoint[1] },
        style,
      },
    ],
  }
}

// Line chart of ECV coverage rates across survey years — one line per
// selected variable, each overlaid with a 95%-CI whisker per year. Nulls
// create gaps (connectNulls: false) rather than drawing a 0. A dashed
// vertical markLine highlights the ribbon's selected year, so the single-year
// filter still reads as the "current" point.
export function buildEcvEvolutionLineOptions(config: EcvLineConfig): EChartsOption {
  const { years, series, selectedYear } = config

  const chartSeries: (LineSeriesOption | CustomSeriesOption)[] = series.flatMap((s, i) => {
    const color = seriesColor(series, i)
    // Falls back to the point value itself when a CI bound is missing, so the
    // whisker collapses to a point instead of drawing from/to 0.
    const errorBarData = s.values.map((v, yearIndex) => [
      yearIndex,
      s.ciLow[yearIndex] ?? v,
      s.ciHigh[yearIndex] ?? v,
    ])

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

    const errorBarSeries: CustomSeriesOption = {
      name: s.name,
      type: 'custom',
      coordinateSystem: 'cartesian2d',
      renderItem: renderErrorBar,
      data: errorBarData,
      encode: { x: 0, y: [1, 2] },
      itemStyle: { color },
      tooltip: { show: false },
      silent: true,
      z: 3,
    }

    return [lineSeries, errorBarSeries]
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
