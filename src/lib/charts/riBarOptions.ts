import { color as echartsColor, type EChartsOption } from 'echarts'
import type { RiCategoryGroup, RiItem } from '@/hooks'
import { RI_CATEGORY_COLORS, RI_CATEGORY_LABELS } from '@/hooks/determinants/useRelativeInfluence'
import { RI_LABEL_COLOR } from './theme'
import { formatRi } from '@/lib/utils/riFormat'

interface RiBarConfig {
  categories: RiCategoryGroup[]
}

// One row per component (header, no bar) followed by one row per variable.
type RiBarRow =
  | { kind: 'category'; group: RiCategoryGroup }
  | { kind: 'variable'; item: RiItem; alpha: number }

// Same tint range as the treemap: within a component, the most influential
// variable gets the most saturated shade of the component colour.
const ALPHA_RANGE: [number, number] = [0.3, 0.85]

function buildRows(categories: RiCategoryGroup[]): RiBarRow[] {
  return categories.flatMap(group => {
    const values = group.items.map(i => i.mean)
    const min = Math.min(...values)
    const span = Math.max(...values) - min
    const alphaOf = (v: number) =>
      span > 0 ? ALPHA_RANGE[0] + ((v - min) / span) * (ALPHA_RANGE[1] - ALPHA_RANGE[0]) : ALPHA_RANGE[1]
    return [
      { kind: 'category' as const, group },
      ...group.items.map(item => ({ kind: 'variable' as const, item, alpha: alphaOf(item.mean) })),
    ]
  })
}

// Matches the treemap tooltips: cumulative influence for a component, label,
// description, component and 95 % interval for a variable.
function tooltipHtml(row: RiBarRow): string {
  if (row.kind === 'category') {
    return `<strong>${row.group.label}</strong><br/>Influence cumulée : <strong>${formatRi(row.group.total)}</strong>`
  }
  const i = row.item
  const desc = i.description
    ? `<div style="margin: 4px 0 6px; color:#475569; font-size: 11px; line-height: 1.35; white-space: normal;">${i.description}</div>`
    : '<br/>'
  return (
    `<strong>${i.label}</strong>` +
    desc +
    `<span style="color:${RI_CATEGORY_COLORS[i.category]}">●</span> ` +
    `${RI_CATEGORY_LABELS[i.category]}<br/>` +
    `Influence moyenne : <strong>${formatRi(i.mean)}</strong><br/>` +
    `Intervalle à 95 % : ${formatRi(i.lower)} – ${formatRi(i.upper)}`
  )
}

const RI_BAR_ROW_HEIGHT = 20

// Height the bar chart needs to give each row room for its label.
export const riBarChartHeight = (categories: RiCategoryGroup[]): number =>
  categories.reduce((n, g) => n + 1 + g.items.length, 0) * RI_BAR_ROW_HEIGHT + 40

export function buildRiBarOptions(config: RiBarConfig): EChartsOption {
  const rows = buildRows(config.categories)

  // Component headers are drawn in their colour, in bold, with their total.
  const rich = Object.fromEntries(
    config.categories.map(g => [
      g.category,
      { color: RI_CATEGORY_COLORS[g.category], fontWeight: 'bold' as const, fontSize: 12, padding: [6, 0, 0, 0] },
    ]),
  )

  return {
    // Fixed margin: containLabel does not measure the rich-text labels.
    grid: { left: 232, right: 56, top: 8, bottom: 32 },
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      // Cap tooltip width so the description wraps instead of running off-screen.
      extraCssText: 'max-width: 320px; white-space: normal;',
      formatter: (p: any) => tooltipHtml(rows[p.dataIndex]),
    },
    xAxis: {
      type: 'value',
      min: 0,
      axisLabel: { formatter: (v: number) => `${v} %` },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.map(r => (r.kind === 'category' ? r.group.label : r.item.label)),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        color: RI_LABEL_COLOR,
        fontSize: 11,
        // Long names are cut; the tooltip gives them in full.
        width: 216,
        overflow: 'truncate',
        formatter: (v: string, i: number) => {
          const r = rows[i]
          return r?.kind === 'category' ? `{${r.group.category}|${v} · ${formatRi(r.group.total)}}` : v
        },
        rich,
      },
    },
    series: [
      {
        name: 'Influence relative',
        type: 'bar',
        barWidth: '70%',
        itemStyle: { borderRadius: [0, 3, 3, 0] },
        // Variables outlined when hovered, as in the treemap.
        emphasis: { itemStyle: { borderColor: RI_LABEL_COLOR, borderWidth: 1.5 } },
        label: {
          show: true,
          position: 'right',
          color: RI_LABEL_COLOR,
          fontSize: 11,
          formatter: (p: any) => {
            const r = rows[p.dataIndex]
            return r.kind === 'variable' ? formatRi(r.item.mean) : ''
          },
        },
        data: rows.map(r =>
          r.kind === 'category'
            ? { value: null }
            : {
                value: r.item.mean,
                variable: r.item.variable,
                itemStyle: { color: echartsColor.modifyAlpha(RI_CATEGORY_COLORS[r.item.category], r.alpha) },
              },
        ),
      },
    ],
  }
}
