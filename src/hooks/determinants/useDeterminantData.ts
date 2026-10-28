import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import type { CategorySummary, DeterminantCategory } from '@/types'

export const CATEGORY_ORDER: DeterminantCategory[] = ['Capacity', 'Motivation', 'Opportunity']

export const CATEGORY_LABELS: Record<DeterminantCategory, string> = {
  Capacity: 'Capacité',
  Motivation: 'Motivation',
  Opportunity: 'Opportunité',
}

// Hex colours for each COM-B category, used by the category cards and the
// behaviour-indicator labels. They are intentionally distinct so the three
// groups read as coordinated at a glance.
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
  categories: CategorySummary[]
}

// Counts the variables of each COM-B category in covariates_description.csv.
// Control covariates (age, sex, wealth...) are dropped, and a variable listed
// twice in the description file is only counted once.
export function useDeterminantData(): DeterminantData {
  const { covariates } = useData()

  const categories = useMemo<CategorySummary[]>(() => {
    const seen = new Set<string>()
    const counts = new Map<DeterminantCategory, number>()
    for (const c of covariates) {
      const cat = c.Category as DeterminantCategory
      if (!CATEGORY_ORDER.includes(cat) || seen.has(c.variable_name)) { continue }
      seen.add(c.variable_name)
      counts.set(cat, (counts.get(cat) ?? 0) + 1)
    }
    return CATEGORY_ORDER.map(cat => ({
      category: cat,
      label: CATEGORY_LABELS[cat],
      description: CATEGORY_DESCRIPTIONS[cat],
      variableCount: counts.get(cat) ?? 0,
    }))
  }, [covariates])

  return { categories }
}
