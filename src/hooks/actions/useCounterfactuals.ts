import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import type { DeterminantCategory } from '@/types'
import {
  LEVER_CATEGORIES,
  LEVER_FALLBACK_LABELS,
  counterfactualProvinces,
  leverUsage,
  pairChildren,
  summariseScenario,
  type CounterfactualChild,
  type LeverUsage,
  type ScenarioSummary,
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
  hcs: ScenarioSummary
  indiv: ScenarioSummary
}

export interface CounterfactualData {
  // Provinces the counterfactual analysis covers.
  provinces: string[]
  // All covered provinces together: the Actions tab has no province filter.
  scope: CounterfactualProvinceSummary
  // Every covered province, then all of them together (shift chart).
  byProvince: CounterfactualProvinceSummary[]
  // Children of the scope, both scenarios side by side.
  children: CounterfactualChild[]
  // Lever usage among the children of the scope.
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
    hcs: summariseScenario(rows, 'hcs'),
    indiv: summariseScenario(rows, 'indiv'),
  }
}

export function useCounterfactuals(): CounterfactualData | null {
  const { counterfactuals, covariates } = useData()

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
    return { provinces, allChildren, byProvince }
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

    return {
      provinces: base.provinces,
      scope,
      byProvince: base.byProvince,
      children,
      levers: leverUsage(children).map(l => ({
        ...l,
        label: labelByLever.get(l.lever) ?? l.lever,
        category: LEVER_CATEGORIES[l.lever],
      })),
    }
  }, [base, labelByLever])
}
