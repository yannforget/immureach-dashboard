import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { useDashboardStore } from '@/store/dashboardStore'
import { buildIndicatorRows, topGapIndicator, type IndicatorRow } from '@/lib/utils/behaviourIndicators'
import { useProvinceData } from '../common/useProvinceData'
import { useZoneData } from '../common/useZoneData'
import type { IndicatorValueMap, ProvinceRow, ZoneRow } from '@/types'

export interface BehaviourMapFeatureValue {
  mapKey: string
  displayName: string
  // Indicator with the widest zero-dose vs vaccinated gap in this area; null
  // when the survey has no indicator for it.
  top: IndicatorRow | null
  // True for zones outside the selected province (zone-level view only).
  dimmed?: boolean
}

// Per-area "dominant" behaviour indicator for the Déterminants map: provinces
// when no province is selected, the selected province's zones otherwise (the
// rest of the country stays as a dimmed backdrop). Same level switching as
// useEcvZeroDoseMapData.
//
// behaviour_indicators.json keys provinces and zones by display name, the
// same lookup useIndicatorComparison does for the dumbbell chart.
export function useBehaviourMapData(): {
  features: (ProvinceRow | ZoneRow)[]
  values: BehaviourMapFeatureValue[]
  mapName: 'drc-provinces' | 'drc-zones'
} {
  const { behaviourIndicators, covariates } = useData()
  const selectedYear = useDashboardStore(s => s.selectedYear)
  const selectedProvince = useDashboardStore(s => s.selectedProvince)
  const provinces = useProvinceData()
  const zones = useZoneData(selectedProvince)
  const allZones = useZoneData(null)

  const features = selectedProvince ? zones : provinces
  const mapName = selectedProvince ? 'drc-zones' : 'drc-provinces'

  const values = useMemo(() => {
    const yearBlock = behaviourIndicators?.[String(selectedYear)]
    const meta = behaviourIndicators?.meta ?? []
    const categoryByKey = new Map(covariates.map(c => [c.variable_name, c.Category]))

    const topFor = (entry: IndicatorValueMap | undefined) =>
      entry ? topGapIndicator(buildIndicatorRows(entry, meta, categoryByKey)) : null

    if (!selectedProvince) {
      return features.map(f => ({
        mapKey: f.mapKey,
        displayName: f.displayName,
        top: topFor(yearBlock?.provinces[f.displayName]),
      }))
    }

    return allZones.map(f => ({
      mapKey: f.mapKey,
      displayName: f.displayName,
      top: topFor(yearBlock?.zones[f.displayName]),
      dimmed: f.provinceId !== selectedProvince,
    }))
  }, [behaviourIndicators, covariates, selectedYear, selectedProvince, features, allZones])

  return { features, values, mapName }
}
