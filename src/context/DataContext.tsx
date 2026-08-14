import { createContext, useContext, useEffect, useState } from 'react'
import * as echarts from 'echarts'
import { cleanName } from '@/lib/utils/dataUtils'
import { parseCsv } from '@/lib/utils/csv'
// import type { KeyEcvRow, ProfileData, ProfileScopeLevel, ProvinceRow, Year, ZoneRow } from '@/types'
import { parseEcvVaccCovCsv } from '@/lib/utils/ecvVaccCov'
import { parseEcvCaracteristicsCsv } from '@/lib/utils/ecvCaracteristics'
import type { EcvCaracteristicsRow, EcvVaccCovRow, KeyEcvRow, ProfileData, ProfileScopeLevel, ProvinceRow, Year, ZoneRow } from '@/types'

export type Bbox = [number, number, number, number] // [minLon, minLat, maxLon, maxLat]

interface DataContextType {
  provinces: ProvinceRow[]
  zones: ZoneRow[]
  profile: ProfileData | null
  keyEcv: KeyEcvRow[]
  ecvVaccCov: EcvVaccCovRow[]
  ecvCaracteristics: EcvCaracteristicsRow[]
  provinceBboxes: Record<string, Bbox>
  loading: boolean
  error: Error | null
}

function parseKeyEcvCsv(text: string): KeyEcvRow[] {
  const toNum = (v: string) => (v === '' ? null : Number(v))
  const toStr = (v: string) => (v === '' ? null : v)

  return parseCsv(text).map(r => ({
    year: Number(r.year) as Year,
    level: r.level as ProfileScopeLevel,
    province: toStr(r.province),
    zone: toStr(r.zone),
    nb_people: toNum(r.nb_people),
    nb_zones: toNum(r.nb_zones),
    nb_areas: toNum(r.nb_areas),
    penta_cov: toNum(r.penta_cov),
    zdc_cov: toNum(r.zdc_cov),
  }))
}

function computeBbox(geometry: any): Bbox {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity

  const visit = (coords: any) => {
    if (typeof coords[0] === 'number') {
      const [lon, lat] = coords as [number, number]
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      return
    }
    for (const c of coords) visit(c)
  }

  visit(geometry.coordinates)
  return [minLon, minLat, maxLon, maxLat]
}

function bboxCenter(bbox: Bbox): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
}

const DataContext = createContext<DataContextType | undefined>(undefined)

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [provinces, setProvinces] = useState<ProvinceRow[]>([])
  const [zones, setZones] = useState<ZoneRow[]>([])
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [keyEcv, setKeyEcv] = useState<KeyEcvRow[]>([])
  const [ecvVaccCov, setEcvVaccCov] = useState<EcvVaccCovRow[]>([])
  const [ecvCaracteristics, setEcvCaracteristics] = useState<EcvCaracteristicsRow[]>([])
  const [provinceBboxes, setProvinceBboxes] = useState<Record<string, Bbox>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)

        // Fetch GeoJSON files + the profiling sidecar in parallel.
        const [provincesRes, zonesRes, profileRes] = await Promise.all([
          fetch('data/provinces.geojson'),
          fetch('data/zones.geojson'),
          fetch('data/profile.json'),
        ])

        if (!provincesRes.ok || !zonesRes.ok || !profileRes.ok) {
          throw new Error('Failed to load data files')
        }

        const provincesGeo = await provincesRes.json()
        const zonesGeo = await zonesRes.json()
        const profileJson = (await profileRes.json()) as ProfileData

        // Process provinces and compute per-province bboxes for map zoom.
        // Keyed by displayName so the dashboard store's `selectedProvince`
        // (already cleaned) can look up directly.
        const bboxes: Record<string, Bbox> = {}
        const processedProvinces = (provincesGeo.features as any[]).map(
          (feature: any, index: number) => {
            const rawQ101 = (feature.properties as any).q101 || ''
            const displayName = cleanName(rawQ101)
            bboxes[displayName] = computeBbox(feature.geometry)
            return {
              id: `prov-${index}`,
              displayName,
              mapKey: rawQ101,
              properties: feature.properties,
            }
          }
        )

        // Process zones. The map key is the raw q103 (province-prefixed)
        // because two zones can share a cleaned name (e.g. "Bili" in both
        // Bas Uele and Nord Ubangi).
        const processedZones = (zonesGeo.features as any[]).map(
          (feature: any, index: number) => {
            const zoneProps = feature.properties as any
            const provinceName = cleanName(zoneProps.q101 || '')
            return {
              id: `zone-${index}`,
              displayName: cleanName(zoneProps.q103 || ''),
              mapKey: zoneProps.q103 || '',
              provinceId: provinceName,
              centroid: bboxCenter(computeBbox(feature.geometry)),
              properties: zoneProps,
            }
          }
        )

        setProvinces(processedProvinces)
        setZones(processedZones)
        setProfile(profileJson)
        setProvinceBboxes(bboxes)
        setError(null)

        // Register ECharts maps using the raw (province-prefixed) name as the
        // shape name, so each shape is uniquely identifiable.
        const provincesWithNames = {
          ...provincesGeo,
          features: (provincesGeo.features as any[]).map((feature: any) => {
            const rawQ101 = (feature.properties as any).q101 || ''
            return {
              ...feature,
              name: rawQ101,
              properties: {
                ...feature.properties,
                name: rawQ101,
              },
            }
          }),
        }

        const zonesWithNames = {
          ...zonesGeo,
          features: (zonesGeo.features as any[]).map((feature: any) => {
            const rawQ103 = (feature.properties as any).q103 || ''
            return {
              ...feature,
              name: rawQ103,
              properties: {
                ...feature.properties,
                name: rawQ103,
              },
            }
          }),
        }

        echarts.registerMap('drc-provinces', provincesWithNames as any)
        echarts.registerMap('drc-zones', zonesWithNames as any)

        // key_ecv.csv (ECV tab key figures) is fetched separately and non-fatally: 
        // it's optional/still being populated, so a missing or malformed file shouldn't break the rest of the dashboard.
        try {
          const keyEcvRes = await fetch('data/key_ecv.csv')
          if (keyEcvRes.ok) {
            setKeyEcv(parseKeyEcvCsv(await keyEcvRes.text()))
          }
        } catch (keyEcvErr) {
          console.warn('Failed to load key_ecv.csv:', keyEcvErr)
        }

        // ecv_vaccination_coverage.csv (health-zone-level EPSK survey, built by
        // scripts/prepare-ecv-vaccination-coverage.py) is likewise optional and
        // non-fatal.
        try {
          const ecvVaccCovRes = await fetch('/data/ecv_vaccination_coverage.csv')
          if (ecvVaccCovRes.ok) {
            setEcvVaccCov(parseEcvVaccCovCsv(await ecvVaccCovRes.text()))
          }
        } catch (ecvVaccCovErr) {
          console.warn('Failed to load ecv_vaccination_coverage.csv:', ecvVaccCovErr)
        }

        // ecv_caracteristics.csv (health-zone-level EPSK household-characteristics
        // survey, built by scripts/prepare-ecv-caracteristics.py) is likewise
        // optional and non-fatal.
        try {
          const ecvCaractRes = await fetch('/data/ecv_caracteristics.csv')
          if (ecvCaractRes.ok) {
            setEcvCaracteristics(parseEcvCaracteristicsCsv(await ecvCaractRes.text()))
          }
        } catch (ecvCaractErr) {
          console.warn('Failed to load ecv_caracteristics.csv:', ecvCaractErr)
        }

      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'))
        console.error('Failed to load data:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  return (
    // <DataContext.Provider value={{ provinces, zones, profile, keyEcv, provinceBboxes, loading, error }}>
    <DataContext.Provider value={{ provinces, zones, profile, keyEcv, ecvVaccCov, ecvCaracteristics, provinceBboxes, loading, error }}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const context = useContext(DataContext)
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider')
  }
  return context
}
