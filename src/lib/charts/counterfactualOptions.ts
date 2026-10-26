import type { EChartsOption } from 'echarts'
import type { CounterfactualProvinceSummary, LeverItem } from '@/hooks'
import type { CounterfactualChild, CounterfactualSegment } from '@/lib/utils/counterfactuals'
import { SCENARIO_LABELS, SEGMENT_LABELS, SEGMENT_ORDER } from '@/lib/utils/counterfactuals'
import type { CounterfactualScenario, DeterminantCategory } from '@/types'
import {
  CF_FADED_OPACITY,
  CF_INITIAL_COLOR,
  CF_SCENARIO_COLORS,
  CF_SEGMENT_COLORS,
  CF_THRESHOLD_COLOR,
} from './theme'

const pct = (v: number) => `${Math.round(v * 100)} %`

// ---------------------------------------------------------------------------
// Segments: 100 % stacked bar per province (+ all provinces together).
// ---------------------------------------------------------------------------

interface SegmentBarConfig {
  rows: CounterfactualProvinceSummary[]
  selectedSegment: CounterfactualSegment | null
  // Label of the row the other charts are scoped to, set in bold.
  scopeLabel: string
}

export function buildSegmentBarOptions(config: SegmentBarConfig): EChartsOption {
  const { rows, selectedSegment, scopeLabel } = config

  return {
    grid: { left: 90, right: 24, top: 40, bottom: 32 },
    legend: { top: 8, left: 'center', itemGap: 20, data: SEGMENT_ORDER.map(s => SEGMENT_LABELS[s]) },
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      formatter: (p: any) => {
        const row = rows[p.dataIndex]
        const seg = row.segments.find(s => SEGMENT_LABELS[s.segment] === p.seriesName)!
        return (
          `<strong>${row.label}</strong><br/>${p.marker}${p.seriesName} : ` +
          `${pct(seg.share)} (${seg.count} / ${row.children} enfants)`
        )
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 1,
      axisLabel: { formatter: (v: number) => pct(v) },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.map(r => r.label),
      axisTick: { show: false },
      axisLabel: {
        fontWeight: 'bold',
        formatter: (v: string) => (v === scopeLabel ? `{sel|${v}}` : v),
        rich: { sel: { fontWeight: 'bold', color: '#0f172a' } },
      },
    },
    series: SEGMENT_ORDER.map(segment => ({
      id: segment,
      name: SEGMENT_LABELS[segment],
      type: 'bar',
      stack: 'segments',
      barWidth: '55%',
      itemStyle: {
        color: CF_SEGMENT_COLORS[segment],
        borderRadius: 0,
        opacity: selectedSegment && selectedSegment !== segment ? CF_FADED_OPACITY : 1,
      },
      label: {
        show: true,
        color: '#fff',
        fontWeight: 'bold',
        formatter: (p: any) => (p.value >= 0.06 ? pct(p.value) : ''),
      },
      emphasis: { focus: 'none' },
      data: rows.map(r => r.segments.find(s => s.segment === segment)!.share),
    })),
  }
}

// ---------------------------------------------------------------------------
// Probability shift: mean probability before -> after, per province x scenario.
// ---------------------------------------------------------------------------

interface ShiftRow {
  label: string
  province: string
  scenario: CounterfactualScenario
  initial: number
  final: number
  reached: number
}

export function buildProbabilityShiftOptions(
  rows: CounterfactualProvinceSummary[],
  threshold: number,
): EChartsOption {
  const items: ShiftRow[] = rows.flatMap(r =>
    (['indiv', 'hcs'] as CounterfactualScenario[]).map(scenario => ({
      label: `${r.label} · ${SCENARIO_LABELS[scenario]}`,
      province: r.label,
      scenario,
      initial: r[scenario].meanInitial,
      final: r[scenario].meanFinal,
      reached: r[scenario].reached,
    })),
  )

  return {
    grid: { left: 16, right: 56, top: 56, bottom: 40, containLabel: true },
    legend: {
      top: 8,
      left: 'center',
      itemGap: 20,
      data: ['Actuelle', SCENARIO_LABELS.indiv, SCENARIO_LABELS.hcs],
    },
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const arr = Array.isArray(params) ? params : [params]
        const r = items[arr[0].dataIndex]
        return (
          `<strong>${r.province}</strong> · ${SCENARIO_LABELS[r.scenario]}<br/>` +
          `Probabilité moyenne actuelle : ${pct(r.initial)}<br/>` +
          `Probabilité moyenne après changement : ${pct(r.final)}<br/>` +
          `Enfants passant le seuil : <strong>${pct(r.reached)}</strong>`
        )
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 1,
      name: 'Probabilité moyenne de vaccination',
      nameLocation: 'middle',
      nameGap: 28,
      axisLabel: { formatter: (v: number) => pct(v) },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: items.map(i => i.label),
      axisTick: { show: false },
    },
    series: [
      {
        name: 'connector',
        type: 'custom',
        silent: true,
        data: items.map((r, i) => [i, r.initial, r.final]),
        renderItem: (_params: any, api: any) => {
          const p1 = api.coord([api.value(1), api.value(0)])
          const p2 = api.coord([api.value(2), api.value(0)])
          return {
            type: 'line',
            shape: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] },
            style: { stroke: '#cbd5e1', lineWidth: 3 },
          }
        },
      },
      {
        name: 'Actuelle',
        type: 'scatter',
        symbolSize: 12,
        itemStyle: { color: CF_INITIAL_COLOR },
        data: items.map((r, i) => [r.initial, i]),
        z: 3,
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: CF_THRESHOLD_COLOR },
          // The y axis is inverted, so the line's start is its top end.
          label: { position: 'start', formatter: `Seuil ${pct(threshold)}`, color: CF_THRESHOLD_COLOR },
          data: [{ xAxis: threshold }],
        },
      },
      ...(['indiv', 'hcs'] as CounterfactualScenario[]).map(scenario => ({
        name: SCENARIO_LABELS[scenario],
        type: 'scatter' as const,
        symbolSize: 14,
        itemStyle: { color: CF_SCENARIO_COLORS[scenario] },
        // Points of the other scenario are left empty so each row has one.
        data: items.map((r, i) => (r.scenario === scenario ? [r.final, i] : [null, i])),
        label: {
          show: true,
          position: 'right' as const,
          color: CF_SCENARIO_COLORS[scenario],
          fontWeight: 'bold' as const,
          formatter: (p: any) => {
            const r = items[p.dataIndex]
            return r.scenario === scenario ? pct(r.final) : ''
          },
        },
        z: 4,
      })),
    ],
  }
}

// ---------------------------------------------------------------------------
// Levers: share of children whose characteristic had to change.
// ---------------------------------------------------------------------------

interface LeverBarConfig {
  levers: LeverItem[]
  categoryColors: Record<DeterminantCategory, string>
  categoryLabels: Record<DeterminantCategory, string>
}

function formatChange(v: number): string {
  const abs = Math.abs(v)
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}`
}

export function buildLeverBarOptions(config: LeverBarConfig): EChartsOption {
  const { levers, categoryColors, categoryLabels } = config

  return {
    // Fixed margin: containLabel does not measure the rich-text labels.
    grid: { left: 220, right: 48, top: 16, bottom: 32 },
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      extraCssText: 'max-width: 320px; white-space: normal;',
      formatter: (p: any) => {
        const l = levers[p.dataIndex]
        return (
          `<strong>${l.label}</strong> · ${SCENARIO_LABELS[l.scenario]}<br/>` +
          `<span style="color:${categoryColors[l.category]}">●</span> ${categoryLabels[l.category]}<br/>` +
          `Modifié pour ${pct(l.share)} des enfants (${l.count})<br/>` +
          `Changement médian : ${formatChange(l.medianChange)} ` //+
          // `<span style="color:#64748b">(unité de la variable, à confirmer)</span>`
        )
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 1,
      axisLabel: { formatter: (v: number) => pct(v) },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: levers.map(l => l.label),
      axisTick: { show: false },
      // Label and bar share the scenario colour; the COM-B category is in the tooltip.
      axisLabel: {
        formatter: (v: string, i: number) => {
          const l = levers[i]
          return l ? `{${l.scenario}|${v}}` : v
        },
        rich: {
          hcs: { color: CF_SCENARIO_COLORS.hcs, fontWeight: 'bold' },
          indiv: { color: CF_SCENARIO_COLORS.indiv, fontWeight: 'bold' },
        },
      },
    },
    series: [
      {
        type: 'bar',
        barWidth: '60%',
        itemStyle: { borderRadius: [0, 3, 3, 0] },
        label: {
          show: true,
          position: 'right',
          formatter: (p: any) => pct(p.value),
        },
        data: levers.map(l => ({
          value: l.share,
          itemStyle: { color: CF_SCENARIO_COLORS[l.scenario] },
        })),
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Children: probability under each scenario, one point per child.
// ---------------------------------------------------------------------------

interface ChildScatterConfig {
  children: CounterfactualChild[]
  selectedSegment: CounterfactualSegment | null
  threshold: number
}

export function buildChildScatterOptions(config: ChildScatterConfig): EChartsOption {
  const { children, selectedSegment, threshold: t } = config

  const quadrant = (segment: CounterfactualSegment, x: [number, number], y: [number, number], pos: string) => ({
    name: SEGMENT_LABELS[segment],
    xAxis: x[0],
    yAxis: y[0],
    itemStyle: { color: CF_SEGMENT_COLORS[segment], opacity: 0.05 },
    label: { position: pos, color: CF_SEGMENT_COLORS[segment], fontWeight: 'bold' },
    end: { xAxis: x[1], yAxis: y[1] },
  })

  return {
    grid: { left: 56, right: 24, top: 24, bottom: 52 },
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      formatter: (p: any) => {
        if (p.seriesType !== 'scatter') return ''
        const c: CounterfactualChild = p.data.child
        return (
          `<strong>${c.province}</strong> · ${SEGMENT_LABELS[c.segment]}<br/>` +
          `Probabilité actuelle : ${pct(c.predInitial)}<br/>` +
          `<span style="color:${CF_SCENARIO_COLORS.hcs}">●</span> ${SCENARIO_LABELS.hcs} : ${pct(c.hcs.predFinal)}<br/>` +
          `<span style="color:${CF_SCENARIO_COLORS.indiv}">●</span> ${SCENARIO_LABELS.indiv} : ${pct(c.indiv.predFinal)}`
        )
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 1,
      name: `Probabilité · ${SCENARIO_LABELS.hcs}`,
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: { color: CF_SCENARIO_COLORS.hcs, fontWeight: 'bold' },
      axisLabel: { formatter: (v: number) => pct(v) },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 1,
      name: `Probabilité · ${SCENARIO_LABELS.indiv}`,
      nameLocation: 'middle',
      nameGap: 40,
      nameTextStyle: { color: CF_SCENARIO_COLORS.indiv, fontWeight: 'bold' },
      axisLabel: { formatter: (v: number) => pct(v) },
      splitLine: { show: false },
    },
    series: [
      {
        type: 'scatter',
        symbolSize: 6,
        data: children.map(c => ({
          value: [c.hcs.predFinal, c.indiv.predFinal],
          child: c,
          itemStyle: {
            color: CF_SEGMENT_COLORS[c.segment],
            opacity: selectedSegment && selectedSegment !== c.segment ? CF_FADED_OPACITY : 0.7,
          },
        })),
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: CF_THRESHOLD_COLOR },
          label: { show: false },
          data: [{ xAxis: t }, { yAxis: t }],
        },
        markArea: {
          silent: true,
          data: [
            quadrant('indiv', [0, t], [t, 1], 'insideTopLeft'),
            quadrant('both', [t, 1], [t, 1], 'insideTopRight'),
            quadrant('neither', [0, t], [0, t], 'insideBottomLeft'),
            quadrant('hcs', [t, 1], [0, t], 'insideBottomRight'),
          ].map(({ end, ...start }) => [start, end]) as any,
        },
      },
    ],
  }
}
