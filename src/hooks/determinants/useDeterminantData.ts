import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import type { CategorySummary, DeterminantCategory, DeterminantVariable } from '@/types'

export const CATEGORY_ORDER: DeterminantCategory[] = ['Capacity', 'Motivation', 'Opportunity']

export const CATEGORY_LABELS: Record<DeterminantCategory, string> = {
  Capacity: 'Capacité',
  Motivation: 'Motivation',
  Opportunity: 'Opportunité',
}

// Hex colours for each COM-B category, used both by the radar axes and the
// category cards. They are intentionally distinct so the radar spokes read as
// three coordinated groups at a glance.
export const CATEGORY_COLORS: Record<DeterminantCategory, string> = {
  Capacity: '#0d9488', // teal-600
  Motivation: '#f59e0b', // amber-500
  Opportunity: '#2563eb', // blue-600
}

// Short informational descriptions distilled from context.txt and shown on the
// category cards instead of numerical metrics.
export const CATEGORY_DESCRIPTIONS: Record<DeterminantCategory, string> = {
  Capacity:
    'Renvoie aux connaissances, compétences et aptitudes permettant de se faire vacciner — capacité psychologique (savoir) et physique.',
  Motivation:
    'Renvoie aux processus internes qui orientent la décision — motivation réflexive (planification, bénéfices perçus) et automatique (impulsions, peurs).',
  Opportunity:
    "Renvoie aux facteurs externes qui rendent le comportement possible — opportunité physique (accès, environnement, coûts) et sociale (normes, confiance).",
}

export interface DeterminantData {
  variables: DeterminantVariable[]
  categories: CategorySummary[]
}

// Joins covariates_description.csv (variable_name → category + description)
// with relative_influences.csv (mean_ri) on variable_name == Variable, keeping
// only the three COM-B categories.
// Values are standardised for the radar: the raw mean_ri follows a strongly
// skewed distribution (from ~0.01 to ~26), so near-zero variables were
// invisible. A log10 transform followed by a min-max rescale maps every value
// onto the [1, 100] range while the original figure is preserved for tooltips.
function standardize(values: number[]): number[] {
  const logs = values.map(v => Math.log10(v))
  const min = Math.min(...logs)
  const max = Math.max(...logs)
  const span = max - min || 1
  return logs.map(l => 1 + (99 * (l - min)) / span)
}

export function useDeterminantData(): DeterminantData {
  const { covariates, relativeInfluences } = useData()

  const variables = useMemo<DeterminantVariable[]>(() => {
    const riMap = new Map(relativeInfluences.map(r => [r.Variable, r]))
    const joined = covariates
      .map(c => {
        const ri = riMap.get(c.variable_name)
        if (!ri) { return null }
        return {
          variable_name: c.variable_name,
          var_description: c.var_description,
          category: c.Category as DeterminantCategory,
          mean_ri: ri.mean_ri,
        }
      })
      .filter((v): v is DeterminantVariable & { scaled_ri?: number } => v !== null)

    const scaled = standardize(joined.map(v => v.mean_ri))
    return joined.map((v, i) => ({ ...v, scaled_ri: scaled[i] }))
  }, [covariates, relativeInfluences])

  const categories = useMemo<CategorySummary[]>(
    () =>
      CATEGORY_ORDER.map(cat => {
        const vars = variables.filter(v => v.category === cat)
        return {
          category: cat,
          label: CATEGORY_LABELS[cat],
          description: CATEGORY_DESCRIPTIONS[cat],
          variableCount: vars.length,
        }
      }),
    [variables]
  )

  return { variables, categories }
}
