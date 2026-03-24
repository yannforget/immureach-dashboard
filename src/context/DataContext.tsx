import React, { createContext, useContext, useEffect, useState } from 'react'
import * as echarts from 'echarts'
import { cleanName } from '@/lib/dataUtils'
import type { ProvinceRow, ZoneRow } from '@/types'

interface DataContextType {
  provinces: ProvinceRow[]
  zones: ZoneRow[]
  loading: boolean
  error: Error | null
}

const DataContext = createContext<DataContextType | undefined>(undefined)

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [provinces, setProvinces] = useState<ProvinceRow[]>([])
  const [zones, setZones] = useState<ZoneRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)

        // Fetch GeoJSON files
        const [provincesRes, zonesRes] = await Promise.all([
          fetch('/data/provinces.geojson'),
          fetch('/data/zones.geojson'),
        ])

        if (!provincesRes.ok || !zonesRes.ok) {
          throw new Error('Failed to load GeoJSON files')
        }

        const provincesGeo = await provincesRes.json()
        const zonesGeo = await zonesRes.json()

        // Process provinces
        const processedProvinces = (provincesGeo.features as any[]).map(
          (feature: any, index: number) => ({
            id: `prov-${index}`,
            displayName: cleanName((feature.properties as any).q101 || ''),
            properties: feature.properties,
          })
        )

        // Process zones
        const processedZones = (zonesGeo.features as any[]).map(
          (feature: any, index: number) => {
            const props = feature.properties as any
            const provinceName = cleanName(props.q101 || '')
            return {
              id: `zone-${index}`,
              displayName: cleanName(props.q103 || ''),
              provinceId: provinceName,
              properties: props,
            }
          }
        )

        setProvinces(processedProvinces)
        setZones(processedZones)
        setError(null)

        // Register ECharts maps with name field injected
        const provincesWithNames = {
          ...provincesGeo,
          features: (provincesGeo.features as any[]).map((feature: any) => ({
            ...feature,
            name: cleanName((feature.properties as any).q101 || ''),
            properties: {
              ...feature.properties,
              name: cleanName((feature.properties as any).q101 || ''),
            },
          })),
        }

        const zonesWithNames = {
          ...zonesGeo,
          features: (zonesGeo.features as any[]).map((feature: any) => ({
            ...feature,
            name: cleanName((feature.properties as any).q103 || ''),
            properties: {
              ...feature.properties,
              name: cleanName((feature.properties as any).q103 || ''),
            },
          })),
        }

        echarts.registerMap('drc-provinces', provincesWithNames as any)
        echarts.registerMap('drc-zones', zonesWithNames as any)
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
    <DataContext.Provider value={{ provinces, zones, loading, error }}>
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
