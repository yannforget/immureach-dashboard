import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { useDashboardStore } from '@/store/dashboardStore'
import type { DeterminantCategory } from '@/types'
import {
  LEVER_CATEGORIES,
  LEVER_FALLBACK_LABELS,
  counterfactualProvinces,
  inferThreshold,
  leverUsage,
  pairChildren,
  segmentShares,
  summariseScenario,
  type CounterfactualChild,
  type LeverUsage,
  type ScenarioSummary,
  type SegmentShare,
} from '@/lib/utils/counterfactuals'

export interface LeverItem extends LeverUsage {
  label: string
  category: DeterminantCategory
}

export interface CounterfactualProvinceSummary {
  // Province name, or null for every province together.
  province: string | null
  label: string
  children: number
  segments: SegmentShare[]
  hcs: ScenarioSummary
  indiv: ScenarioSummary
}

export interface CounterfactualData {
  // Provinces the counterfactual analysis covers.
  provinces: string[]
  // Probability (0-1) above which a child counts as reached.
  threshold: number
  // All covered provinces together: the Actions tab has no province filter.
  scope: CounterfactualProvinceSummary
  // Every covered province, then all of them together (segment / shift charts).
  byProvince: CounterfactualProvinceSummary[]
  // Children of the scope, with their segment.
  children: CounterfactualChild[]
  // Lever usage among the children of the scope and selected segment.
  levers: LeverItem[]
}

function summarise(
  province: string | null,
  rows: ReturnType<typeof useData>['counterfactuals'],
  children: CounterfactualChild[],
): CounterfactualProvinceSummary {
  return {
    province,
    label: province ?? 'Ensemble',
    children: children.length,
    segments: segmentShares(children),
    hcs: summariseScenario(rows, 'hcs'),
    indiv: summariseScenario(rows, 'indiv'),
  }
}

export function useCounterfactuals(): CounterfactualData | null {
  const { counterfactuals, covariates } = useData()
  const selectedSegment = useDashboardStore(s => s.selectedSegment)

  const base = useMemo(() => {
    if (counterfactuals.length === 0) return null
    const provinces = counterfactualProvinces(counterfactuals)
    const allChildren = pairChildren(counterfactuals)
    const byProvince = [
      ...provinces.map(p =>
        summarise(
          p,
          counterfactuals.filter(r => r.province === p),
          allChildren.filter(c => c.province === p),
        ),
      ),
      summarise(null, counterfactuals, allChildren),
    ]
    return { provinces, threshold: inferThreshold(counterfactuals), allChildren, byProvince }
  }, [counterfactuals])

  const labelByLever = useMemo(() => {
    const labels = new Map<string, string>(Object.entries(LEVER_FALLBACK_LABELS))
    for (const c of covariates) {
      if (!labels.has(c.variable_name)) labels.set(c.variable_name, c.var_description)
    }
    return labels
  }, [covariates])

  return useMemo(() => {
    if (!base) return null
    const scope = base.byProvince.find(s => s.province === null)!
    const children = base.allChildren
    const leverChildren = selectedSegment
      ? children.filter(c => c.segment === selectedSegment)
      : children

    return {
      provinces: base.provinces,
      threshold: base.threshold,
      scope,
      byProvince: base.byProvince,
      children,
      levers: leverUsage(leverChildren).map(l => ({
        ...l,
        label: labelByLever.get(l.lever) ?? l.lever,
        category: LEVER_CATEGORIES[l.lever],
      })),
    }
  }, [base, selectedSegment, labelByLever])
}
