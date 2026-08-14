import { useTableData } from '@/hooks'
import { ProvinceTable } from './ProvinceTable'
import { ZoneTable } from './ZoneTable'
import { ZoneDetail } from './ZoneDetail'

export function ModelVaccinationDataTable() {
  const { mode, rows, selectedZoneName } = useTableData()

  if (mode === 'province') {
    return <ProvinceTable rows={rows as any} />
  }

  if (mode === 'zone') {
    return <ZoneTable rows={rows as any} />
  }

  return <ZoneDetail row={rows[0] as any} zoneName={selectedZoneName} />
}
