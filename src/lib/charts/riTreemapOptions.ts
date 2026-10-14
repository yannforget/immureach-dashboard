import type { EChartsOption } from 'echarts'
import type { RiCategoryGroup } from '@/hooks'
import { RI_CATEGORY_COLORS, RI_CATEGORY_LABELS } from '@/hooks/determinants/useRelativeInfluence'
import { RI_LABEL_COLOR } from './theme'
import { formatRi } from '@/lib/utils/riFormat'
import { measureText, wrappedLineCount } from '@/lib/utils/textFit'

interface RiTreemapConfig {
  categories: RiCategoryGroup[]
  // Laid-out size of a treemap node, read from the chart instance at render
  // time. Used to hide labels that don't fit their tile.
  getItemSize?: (dataIndex: number) => { width: number; height: number } | undefined
}

const LABEL_FONT_SIZE = 11
// Smaller sizes tried, in order, when the name doesn't fit at the default one,
// so long names in narrow tiles (e.g. "Normes communautaires") still show.
const LABEL_FONT_SIZES = [LABEL_FONT_SIZE, 10, 9]
const labelFont = (size: number) => `${size}px DM Sans, sans-serif`
const labelLineHeight = (size: number) => Math.round(size * 1.3)
// Default treemap label padding (5px each side) plus the 1px leaf border.
const LABEL_INSET = 12

// One rich-text style per font size, referenced by the label formatter.
const LABEL_RICH = Object.fromEntries(
  LABEL_FONT_SIZES.map(size => [`s${size}`, { fontSize: size, lineHeight: labelLineHeight(size) }]),
)

// Show "name\nvalue" when the name fits the tile without being cut (shrinking
// the font if needed), the value alone when only it fits, and nothing otherwise.
function fitLabel(name: string, value: string, size?: { width: number; height: number }): string {
  // Keep the line break inside a single rich token: with overflow 'break',
  // ECharts drops a bare "\n" placed between two tokens.
  const styled = (text: string, fontSize: number) => `{s${fontSize}|${text}}`
  if (!size) return styled(`${name}\n${value}`, LABEL_FONT_SIZE)
  const width = size.width - LABEL_INSET
  const fits = (fontSize: number, lines: number) =>
    lines * labelLineHeight(fontSize) <= size.height - LABEL_INSET
  if (!fits(LABEL_FONT_SIZE, 1) || measureText(value, labelFont(LABEL_FONT_SIZE)) > width) return ''
  for (const fontSize of LABEL_FONT_SIZES) {
    const nameLines = wrappedLineCount(name, width, labelFont(fontSize))
    if (nameLines != null && fits(fontSize, nameLines + 1)) {
      return styled(`${name}\n${value}`, fontSize)
    }
  }
  return styled(value, LABEL_FONT_SIZE)
}

export function buildRiTreemapOptions(config: RiTreemapConfig): EChartsOption {
  const { categories, getItemSize } = config

  const data = categories.map(g => ({
    name: g.label,
    value: g.total,
    itemStyle: { color: RI_CATEGORY_COLORS[g.category] },
    children: g.items.map(i => ({
      name: i.label,
      value: i.mean,
      variable: i.variable,
      description: i.description,
      category: i.category,
      lower: i.lower,
      upper: i.upper,
    })),
  }))

  return {
    tooltip: {
      appendToBody: true,
      // Cap tooltip width so the description wraps instead of running off-screen.
      extraCssText: 'max-width: 320px; white-space: normal;',
      formatter: (params: any) => {
        const d = params.data
        if (!d) return ''
        if (!d.variable) {
          return `<strong>${d.name}</strong><br/>Influence cumulée : <strong>${formatRi(d.value)}</strong>`
        }
        const desc = d.description
          ? `<div style="margin: 4px 0 6px; color:#475569; font-size: 11px; line-height: 1.35; white-space: normal;">${d.description}</div>`
          : '<br/>'
        return (
          `<strong>${d.name}</strong>` +
          desc +
          `<span style="color:${RI_CATEGORY_COLORS[d.category as keyof typeof RI_CATEGORY_COLORS]}">●</span> ` +
          `${RI_CATEGORY_LABELS[d.category as keyof typeof RI_CATEGORY_LABELS]}<br/>` +
          `Influence moyenne : <strong>${formatRi(d.value)}</strong><br/>` +
          `Intervalle à 95 % : ${formatRi(d.lower)} – ${formatRi(d.upper)}`
        )
      },
    },
    series: [
      {
        name: 'Influence relative',
        type: 'treemap',
        data,
        top: 8,
        left: 8,
        right: 8,
        bottom: 40,
        roam: false,
        visibleMin: 0,
        nodeClick: 'zoomToNode',
        breadcrumb: { show: true, bottom: 8 },
        label: {
          show: true,
          color: RI_LABEL_COLOR,
          fontSize: LABEL_FONT_SIZE,
          overflow: 'break',
          formatter: (p: any) => fitLabel(p.name, formatRi(p.value), getItemSize?.(p.dataIndex)),
          rich: LABEL_RICH,
        },
        upperLabel: {
          show: true,
          height: 24,
          color: RI_LABEL_COLOR,
          fontWeight: 'bold',
          formatter: (p: any) => `${p.name} · ${formatRi(p.value)}`,
        },
        levels: [
          // Root: the categories, separated by white gaps.
          { itemStyle: { borderColor: '#fff', borderWidth: 0, gapWidth: 3 } },
          // Categories: tint their variables by influence, the strongest
          // ones in the most saturated shade of the category colour.
          {
            colorMappingBy: 'value',
            colorAlpha: [0.3, 0.85],
            itemStyle: { borderColor: '#fff', borderWidth: 3, gapWidth: 1 },
          },
          // Variables, outlined when hovered.
          {
            itemStyle: { borderColor: '#fff', borderWidth: 1 },
            emphasis: { itemStyle: { borderColor: RI_LABEL_COLOR, borderWidth: 2 } },
          },
        ],
      },
    ],
  }
}
