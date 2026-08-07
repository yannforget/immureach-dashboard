import React from 'react'
import { useDashboardStore } from '@/store/dashboardStore'
import { useZoneData } from '@/hooks/useZoneData'

export function Breadcrumb() {
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const selectedZoneId = useDashboardStore(s => s.selectedZoneId)
  const setProvince = useDashboardStore(s => s.setProvince)
  const setSelectedZone = useDashboardStore(s => s.setSelectedZone)
  const zones = useZoneData(null)

  const zone = selectedZoneId ? zones.find(z => z.id === selectedZoneId) : null

  const rootIsLeaf = selectedProvince === null
  const provinceIsLeaf = selectedProvince !== null && selectedZoneId === null
  const zoneIsLeaf = selectedZoneId !== null

  const linkClass =
    'font-medium text-teal-600 underline-offset-2 hover:text-teal-800 hover:underline'
  const leafClass =
    'font-semibold text-teal-700 border-b-2 border-teal-600'
  const separatorClass = 'text-teal-600/60'

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-base">
      {rootIsLeaf ? (
        <span className={leafClass}>DRC</span>
      ) : (
        <button
          type="button"
          onClick={() => setProvince(null)}
          className={linkClass}
        >
          DRC
        </button>
      )}

      {selectedProvince !== null && (
        <>
          <span className={separatorClass} aria-hidden="true">
            ›
          </span>
          {provinceIsLeaf ? (
            <span className={leafClass}>{selectedProvince}</span>
          ) : (
            <button
              type="button"
              onClick={() => setSelectedZone(null)}
              className={linkClass}
            >
              {selectedProvince}
            </button>
          )}
        </>
      )}

      {zoneIsLeaf && (
        <>
          <span className={separatorClass} aria-hidden="true">
            ›
          </span>
          <span className={leafClass}>{zone?.displayName ?? '…'}</span>
        </>
      )}
    </nav>
  )
}
