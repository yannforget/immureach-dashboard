import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { RI_CONTROL_COLOR } from '@/lib/charts/theme'
import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_ORDER } from './useDeterminantData'
import type { RiCategory } from '@/types'

export const RI_CATEGORY_ORDER: RiCategory[] = [...CATEGORY_ORDER, 'Control']

export const RI_CATEGORY_LABELS: Record<RiCategory, string> = {
  ...CATEGORY_LABELS,
  Control: 'Autre',
}

export const RI_CATEGORY_COLORS: Record<RiCategory, string> = {
  ...CATEGORY_COLORS,
  Control: RI_CONTROL_COLOR,
}

export interface RiItem {
  variable: string
  label: string
  // Shown in the tooltip; shared with the behaviour indicators chart
  // (behaviour_indicators.json). Empty when the variable has none.
  description: string
  category: RiCategory
  mean: number
  median: number
  lower: number
  upper: number
}

export interface RiCategoryGroup {
  category: RiCategory
  label: string
  total: number
  items: RiItem[]
}

export interface RelativeInfluenceData {
  // All variables, by mean influence, largest first.
  items: RiItem[]
  // Influence summed per category, largest first.
  categories: RiCategoryGroup[]
}

// Joins relative_influences.csv with covariates_description.csv on the
// variable name to get a French label and a COM-B category. The description
// file lists some variables twice (e.g. fear_diseases), the first label wins;
// variables missing from it keep their raw name and fall into Control.
export function useRelativeInfluence(): RelativeInfluenceData {
  const { relativeInfluences, covariates, behaviourIndicators } = useData()

  return useMemo(() => {
    const metaByVar = new Map<string, { label: string; category: RiCategory }>()
    for (const c of covariates) {
      if (metaByVar.has(c.variable_name)) continue
      const category = (RI_CATEGORY_ORDER as string[]).includes(c.Category)
        ? (c.Category as RiCategory)
        : 'Control'
      metaByVar.set(c.variable_name, { label: c.var_description, category })
    }

    const descriptionByVar = new Map(
      (behaviourIndicators?.meta ?? []).map(m => [m.key, m.description ?? '']),
    )

    const items: RiItem[] = relativeInfluences
      .map(r => {
        const meta = metaByVar.get(r.variable)
        return {
          ...r,
          label: meta?.label ?? r.variable,
          description: descriptionByVar.get(r.variable) ?? '',
          category: meta?.category ?? 'Control',
        }
      })
      .sort((a, b) => b.mean - a.mean)

    const categories: RiCategoryGroup[] = RI_CATEGORY_ORDER
      .map(category => {
        const catItems = items.filter(i => i.category === category)
        return {
          category,
          label: RI_CATEGORY_LABELS[category],
          total: catItems.reduce((sum, i) => sum + i.mean, 0),
          items: catItems,
        }
      })
      .filter(g => g.items.length > 0)
      .sort((a, b) => b.total - a.total)

    return { items, categories }
  }, [relativeInfluences, covariates, behaviourIndicators])
}
