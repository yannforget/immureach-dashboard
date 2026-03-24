import { Button } from '@/components/ui/button'
import { useDashboardStore } from '@/store/dashboardStore'
import { useProvinceData } from '@/hooks/useProvinceData'
import { getDisplayName } from '@/lib/dataUtils'

export function ProvinceSelector() {
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const setProvince = useDashboardStore(s => s.setProvince)
  const provinces = useProvinceData()

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-700">Province</h2>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={selectedProvince === null ? 'default' : 'outline'}
          onClick={() => setProvince(null)}
          className="rounded-md"
        >
          All
        </Button>
        {provinces.map(province => (
          <Button
            key={province.id}
            variant={selectedProvince === province.displayName ? 'default' : 'outline'}
            onClick={() => setProvince(province.displayName)}
            className="rounded-md"
          >
            {getDisplayName(province.displayName)}
          </Button>
        ))}
      </div>
    </div>
  )
}
