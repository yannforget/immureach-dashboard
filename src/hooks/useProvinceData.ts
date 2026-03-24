import type { ProvinceRow } from '@/types'
import { useData } from '@/context/DataContext'

export function useProvinceData(): ProvinceRow[] {
  const { provinces } = useData()
  return provinces
}
