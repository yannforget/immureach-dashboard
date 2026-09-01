import type { EChartsOption, TooltipComponentFormatterCallbackParams } from 'echarts'
import { ECV_HIGHLIGHT_RAMP, ECV_LINE_PALETTE } from './theme'
import type { EcvCaracteristicBar, EcvCaracteristicGroup } from '@/hooks'

export interface EcvCaracteristicsConfig {
  group: EcvCaracteristicGroup
  areas: EcvCaracteristicBar[]
}

// Vertical stacked bar chart for the ECV household-characteristics survey.
// One bar per area (province or zone); within the group, each variable is one
// stack segment (mere + gardienne sit on top of each other, summing to the
// total). Only `_pct` values are drawn — the `_low`/`_high` CI columns are
// intentionally ignored. Bars flagged as `highlighted` (the selected zone) are
// drawn in ECV_HIGHLIGHT_COLOR nuances (one shade per stack segment) while
// every other bar keeps its palette color.
export function buildEcvCaracteristicsOptions(config: EcvCaracteristicsConfig): EChartsOption {
  const { group, areas } = config
  const names = areas.map(a => a.name)

  const option: EChartsOption = {
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
        if (list.length > 1) {
          html += `Total: ${total.toFixed(1)}%`
        }
        return html
      },
    },
    legend:
      group.series.length > 1
        ? { type: 'scroll', top: 4, left: 'center', textStyle: { fontSize: 11 } }
        : undefined,
    grid: {
      left: 10,
      right: 12,
      top: group.series.length > 1 ? 40 : 16,
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
      itemStyle: { color: ECV_LINE_PALETTE[i % ECV_LINE_PALETTE.length] },
      emphasis: { itemStyle: { color: ECV_HIGHLIGHT_RAMP[0] } },
    })),
  }

  return option
}
