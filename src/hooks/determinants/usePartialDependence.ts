import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { groupPartialDependence, pdpYExtent, PDP_DISCRETE_MAX_VALUES, type PdpPoint } from '@/lib/utils/partialDependence'
import { useDashboardStore } from '@/store/dashboardStore'
import { useRelativeInfluence } from './useRelativeInfluence'
import type { RiCategory } from '@/types'

export interface PdpItem {
  variable: string
  label: string
  description: string
  category: RiCategory
  // Mean relative influence, in %.
  influence: number
  mean: PdpPoint[]
  discrete: boolean
  // Change in predicted share between the lowest and highest point of the
  // mean curve, in share units (0-1).
  range: number
}

// Partial dependency curves of the household-model variables, joined with
// their relative influence (label, COM-B category). Variables without a
// relative influence (e.g. Y0_min) are left out. Largest influence first.
export function usePartialDependence(): PdpItem[] {
  const { partialDependence } = useData()
  const { items: riItems } = useRelativeInfluence()

  return useMemo(() => {
    const curves = groupPartialDependence(partialDependence)
    return riItems.flatMap(ri => {
      const c = curves.get(ri.variable)
      if (!c || c.mean.length === 0) return []
      const [lo, hi] = pdpYExtent([c.mean])
      return [{
        variable: ri.variable,
        label: ri.label,
        description: ri.description,
        category: ri.category,
        influence: ri.mean,
        mean: c.mean,
        discrete: c.mean.length <= PDP_DISCRETE_MAX_VALUES,
        range: hi - lo,
      }]
    })
  }, [partialDependence, riItems])
}

// Item whose curve is shown in detail: the one picked in the store, or the
// most influential one when nothing (or an unknown variable) is picked.
export function useSelectedPdpItem(items: PdpItem[]): PdpItem | undefined {
  const selected = useDashboardStore(s => s.selectedRiVariable)
  return useMemo(
    () => items.find(i => i.variable === selected) ?? items[0],
    [items, selected],
  )
}
