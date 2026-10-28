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
