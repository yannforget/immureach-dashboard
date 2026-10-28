import type { EChartsOption } from 'echarts'
import type { PdpItem } from '@/hooks'
import { RI_CATEGORY_COLORS, RI_CATEGORY_LABELS } from '@/hooks/determinants/useRelativeInfluence'
import { PDP_MUTED_TEXT_COLOR, PDP_PANEL_BORDER_COLOR, RI_LABEL_COLOR } from './theme'
import { formatPdpShare, formatPdpX, pdpYExtent } from '@/lib/utils/partialDependence'
import { formatRi } from '@/lib/utils/riFormat'

// Y-axis bounds in whole percents, padded by a point and snapped to `step`.
function yBounds(lo: number, hi: number, step: number): [number, number] {
  const min = Math.floor((lo * 100 - 1) / step) * step
  const max = Math.ceil((hi * 100 + 1) / step) * step
  return [Math.max(0, min) / 100, Math.min(100, max) / 100]
}

const percentLabel = (v: number) => `${Math.round(v * 100)} %`

interface PdpConfig {
  item: PdpItem
}

// Effect of one variable on the predicted share of non-zero-dose children,
// averaged over the model replicates.
export function buildPdpOptions({ item }: PdpConfig): EChartsOption {
  const color = RI_CATEGORY_COLORS[item.category]
  const [lo, hi] = pdpYExtent([item.mean])
  const [yMin, yMax] = yBounds(lo, hi, 5)
  const xs = item.mean.map(p => p[0])

  return {
    animationDuration: 300,
    grid: { top: 24, right: 24, bottom: 56, left: 56 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      formatter: (params: any) => {
        const mean = Array.isArray(params) ? params[0] : params
        if (!mean) return ''
        return (
          `<strong>${item.label}</strong> = ${formatPdpX(mean.value[0])}<br/>` +
          `Enfants non zéro-dose prédits : <strong>${formatPdpShare(mean.value[1])}</strong>`
        )
      },
    },
    xAxis: {
      type: 'value',
      min: Math.min(...xs),
      max: Math.max(...xs),
      // Ordinal scales and flags only take whole values.
      minInterval: item.discrete ? 1 : undefined,
      name: `${item.label} (faible → élevé)`,
      nameLocation: 'middle',
      nameGap: 32,
      nameTextStyle: { color: PDP_MUTED_TEXT_COLOR },
      axisLabel: { formatter: (v: number) => formatPdpX(v) },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: yMin,
      max: yMax,
      name: 'Enfants non zéro-dose prédits',
      nameLocation: 'middle',
      nameGap: 42,
      nameTextStyle: { color: PDP_MUTED_TEXT_COLOR },
      axisLabel: { formatter: percentLabel },
    },
    series: [
      {
        id: 'mean',
        name: 'Moyenne',
        type: 'line' as const,
        data: item.mean,
        showSymbol: false,
        lineStyle: { color, width: 3 },
        itemStyle: { color },
      },
    ],
  }
}

interface PdpGridConfig {
  items: PdpItem[]
  selected: string | null
  columns: number
  // Height of one row of panels, in px; the chart is rows * rowHeight tall.
  rowHeight: number
}

const PANEL_TITLE_HEIGHT = 34
const PANEL_GAP = 14

// Mean effect curves of several variables side by side, on a shared y-axis so
// their effect sizes compare at a glance. `columns` panels per row, columns in
// percent of the width and rows in px.
export function buildPdpGridOptions({ items, selected, columns, rowHeight }: PdpGridConfig): EChartsOption {
  const [lo, hi] = pdpYExtent(items.map(i => i.mean))
  const [yMin, yMax] = yBounds(lo, hi, 10)
  const cellW = 100 / columns

  const pos = (i: number) => ({ col: i % columns, row: Math.floor(i / columns) })
  // Room on the left of the first column for the y-axis labels.
  const left = (col: number) => `${col * cellW + (col === 0 ? 6 : 2)}%`
  const width = (col: number) => `${cellW - (col === 0 ? 8 : 4)}%`

  return {
    animation: false,
    title: items.map((item, i) => {
      const { col, row } = pos(i)
      return {
        text: item.label,
        subtext: `Influence ${formatRi(item.influence)}`,
        left: left(col),
        top: row * rowHeight,
        padding: 0,
        itemGap: 2,
        textStyle: {
          fontSize: 11,
          fontWeight: (item.variable === selected ? 'bold' : 'normal') as 'bold' | 'normal',
          color: RI_LABEL_COLOR,
          width: 140,
          overflow: 'truncate' as const,
        },
        subtextStyle: { fontSize: 10, color: PDP_MUTED_TEXT_COLOR },
      }
    }),
    // Axis trigger: the curves have no symbols for an item tooltip to hook on.
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params
        const item: PdpItem | undefined = p && items[p.seriesIndex]
        if (!item) return ''
        return (
          `<strong>${item.label}</strong> = ${formatPdpX(p.value[0])}<br/>` +
          `<span style="color:${RI_CATEGORY_COLORS[item.category]}">●</span> ${RI_CATEGORY_LABELS[item.category]}<br/>` +
          `Enfants non zéro-dose prédits : <strong>${formatPdpShare(p.value[1])}</strong>`
        )
      },
    },
    grid: items.map((item, i) => {
      const { col, row } = pos(i)
      const isSelected = item.variable === selected
      return {
        left: left(col),
        width: width(col),
        top: row * rowHeight + PANEL_TITLE_HEIGHT,
        height: rowHeight - PANEL_TITLE_HEIGHT - PANEL_GAP,
        show: true,
        borderColor: isSelected ? RI_LABEL_COLOR : PDP_PANEL_BORDER_COLOR,
        borderWidth: isSelected ? 2 : 1,
      }
    }),
    xAxis: items.map((item, i) => ({
      type: 'value' as const,
      gridIndex: i,
      min: item.mean[0][0],
      max: item.mean[item.mean.length - 1][0],
      axisLabel: { show: false },
      axisTick: { show: false },
      axisLine: { show: false },
      splitLine: { show: false },
    })),
    yAxis: items.map((_, i) => ({
      type: 'value' as const,
      gridIndex: i,
      min: yMin,
      max: yMax,
      interval: yMax - yMin,
      axisLabel: { show: pos(i).col === 0, fontSize: 9, formatter: percentLabel },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
    })),
    series: items.map((item, i) => ({
      id: item.variable,
      name: item.label,
      type: 'line' as const,
      xAxisIndex: i,
      yAxisIndex: i,
      data: item.mean,
      showSymbol: false,
      lineStyle: { color: RI_CATEGORY_COLORS[item.category], width: 2 },
      itemStyle: { color: RI_CATEGORY_COLORS[item.category] },
    })),
  }
}
