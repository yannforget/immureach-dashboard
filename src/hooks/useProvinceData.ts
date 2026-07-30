import type { ProvinceRow } from '@/types'
import { useData } from '@/context/DataContext'
import { useMemo } from 'react'

export function useProvinceData(): ProvinceRow[] {
  const { provinces } = useData()
  return useMemo(
    () => [...provinces].sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr')),
    [provinces],
  )
}
