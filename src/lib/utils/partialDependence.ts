import type { PartialDependencyRow } from '@/types'

export type PdpPoint = [number, number]

export interface PdpCurves {
  // One curve per model replicate, points sorted by x.
  replicates: PdpPoint[][]
  // Mean of the replicates at each x.
  mean: PdpPoint[]
}

// Variables with this many distinct values or fewer are treated as ordinal
// scales or binary flags, whose x-axis only takes whole values.
export const PDP_DISCRETE_MAX_VALUES = 8

// Groups the rows by variable, then by replicate. The replicates share the
// same x grid, so the mean is taken value by value.
export function groupPartialDependence(rows: PartialDependencyRow[]): Map<string, PdpCurves> {
  const byVar = new Map<string, Map<number, PdpPoint[]>>()
  for (const r of rows) {
    if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) continue
    let byIter = byVar.get(r.variable)
    if (!byIter) byVar.set(r.variable, (byIter = new Map()))
    let points = byIter.get(r.iteration)
    if (!points) byIter.set(r.iteration, (points = []))
    points.push([r.x, r.y])
  }

  const curves = new Map<string, PdpCurves>()
  for (const [variable, byIter] of byVar) {
    const replicates = [...byIter.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, points]) => points.sort((a, b) => a[0] - b[0]))

    const sums = new Map<number, { sum: number; n: number }>()
    for (const points of replicates) {
      for (const [x, y] of points) {
        const s = sums.get(x) ?? { sum: 0, n: 0 }
        s.sum += y
        s.n += 1
        sums.set(x, s)
      }
    }
    const mean: PdpPoint[] = [...sums.entries()]
      .sort(([a], [b]) => a - b)
      .map(([x, s]) => [x, s.sum / s.n])

    curves.set(variable, { replicates, mean })
  }
  return curves
}

// Lowest and highest predicted share over all the given curves.
export function pdpYExtent(curves: PdpPoint[][]): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const points of curves) {
    for (const [, y] of points) {
      if (y < min) min = y
      if (y > max) max = y
    }
  }
  return [min, max]
}

// French-formatted share, e.g. 0.5412 -> "54,1 %".
export const formatPdpShare = (v: number): string =>
  `${(v * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`

// French-formatted x value: integers as is, other values with two decimals.
export const formatPdpX = (v: number): string =>
  Number.isInteger(v)
    ? String(v)
    : v.toLocaleString('fr-FR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })

// How the x values of a variable read on the axis and in tooltips.
// - labels: ordinal scale, each whole value has a text label
// - hidden: no tick labels (PCA scores, whose values have no meaning)
// - percent: share in 0-1 shown as 0-100 %, axis spans the full range
export type PdpXScale =
  | { kind: 'labels'; labels: Record<number, string> }
  | { kind: 'hidden' }
  | { kind: 'percent' }

// From data/input/immureach/behavior/x_values_RC.xlsx (x_values -> x_labels).
// Variables not listed keep plain numeric tick labels.
const PDP_X_SCALES: Record<string, PdpXScale> = {
  self_efficacy: {
    kind: 'labels',
    labels: { 1: 'Pas du tout capable', 2: 'Peu capable', 3: 'Ne sait pas', 4: 'Capable', 5: 'Très capable' },
  },
  compliance_with_procedures: { kind: 'labels', labels: { 0: 'Faible', 1: 'Haute' } },
  ease_to_vaccinate_children: {
    kind: 'labels',
    labels: {
      1: 'Ce n’est pas du tout facile',
      2: 'C’est assez peu facile',
      3: 'C’est moyennement facile',
      4: 'C’est très facile',
    },
  },
  trust_in_hcw: {
    kind: 'labels',
    labels: { 1: 'Aucune confiance', 2: 'Confiance limitée', 3: 'Confiance moyenne', 4: 'Grande confiance' },
  },
  opinion_on_vaccines: { kind: 'hidden' },
  outreach: { kind: 'hidden' },
  household_travel_ohe: { kind: 'hidden' },
  cultural_alignment: { kind: 'percent' },
  // direct_cost in the model output, renamed on load.
  affordability: { kind: 'percent' },
}

// Axis titles from the x_axis_label column of the same file; other variables
// keep "<label> (faible → élevé)". Long titles carry a line break, as axis
// names do not wrap on their own.
const PDP_X_AXIS_NAMES: Record<string, string> = {
  affordability: 'Pourcentage des ménages de la zone HZ ayant payé des services de vaccination\nau cours des dernières années',
  knowledge_vaccines: 'Nombre de nombres connus à propos de la vaccination par ménage',
  knowledge_diseases: 'Nombre de maladies infectieuses évitables par la vaccination connues par ménage',
}

export const pdpXAxisName = (variable: string): string | undefined => PDP_X_AXIS_NAMES[variable]

export const pdpXScale = (variable: string): PdpXScale | undefined => PDP_X_SCALES[variable]

// Tick label of an x value; '' where the scale shows none.
export function formatPdpXTick(variable: string, v: number): string {
  const scale = pdpXScale(variable)
  switch (scale?.kind) {
    case 'labels':
      return scale.labels[v] ?? ''
    case 'hidden':
      return ''
    case 'percent':
      return `${Math.round(v * 100)} %`
    default:
      return formatPdpX(v)
  }
}

// x value as read in a tooltip; null where the value has no meaning.
export function formatPdpXValue(variable: string, v: number): string | null {
  const scale = pdpXScale(variable)
  switch (scale?.kind) {
    case 'labels':
      return scale.labels[v] ?? formatPdpX(v)
    case 'hidden':
      return null
    case 'percent':
      return `${(v * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
    default:
      return formatPdpX(v)
  }
}
