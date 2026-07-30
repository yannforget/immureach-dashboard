import { useMemo, useState } from 'react'
import { METRIC_KEYS, METRIC_META } from '@/lib/dataUtils'
import { useProvinceData } from '@/hooks/useProvinceData'
import type { MetricKey, ProvinceRow, ZoneRow } from '@/types'

interface ZoneDetailProps {
  row: ZoneRow
  zoneName: string | null
}

interface DemographicTileProps {
  label: string
  value: number | null | undefined
  format?: 'int' | 'rate'
  unit?: string
  description: string
  source: string
}

function DemographicTile({
  label,
  value,
  format = 'int',
  unit,
  description,
  source,
}: DemographicTileProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  let display = '—'
  if (typeof value === 'number') {
    if (format === 'rate') {
      display = value.toFixed(1)
    } else {
      display = Math.round(value).toLocaleString()
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-1">
        <h3 className="text-xs font-semibold text-slate-700">{label}</h3>
        <div
          className="relative flex-shrink-0"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div
            onClick={(e) => {
              e.stopPropagation()
              setShowTooltip(!showTooltip)
            }}
            className="w-4 h-4 rounded-full border border-slate-400 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:border-slate-600 cursor-pointer leading-none"
            role="button"
            tabIndex={0}
            title="More information"
            style={{ fontSize: '10px', fontWeight: 600 }}
          >
            ?
          </div>
          {showTooltip && (
            <div className="absolute right-0 top-5 z-50 w-56 rounded-md bg-slate-900 px-3 py-3 text-xs text-white shadow-lg space-y-2">
              <div className="text-slate-300">{description}</div>
              <div>
                <div className="font-semibold text-slate-400 text-2xs mb-1">
                  Source
                </div>
                <div className="text-slate-300">{source}</div>
              </div>
              <div className="absolute -top-1 right-2 h-2 w-2 rotate-45 bg-slate-900"></div>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">
        {display}
        {unit && <span className="text-sm text-slate-600 ml-0.5">{unit}</span>}
      </p>
    </div>
  )
}

interface ComparisonRowProps {
  label: string
  value: number
  accentClass: string
  isHighlight: boolean
}

function ComparisonRow({ label, value, accentClass, isHighlight }: ComparisonRowProps) {
  const width = `${Math.max(0, Math.min(100, value))}%`
  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-16 text-xs ${isHighlight ? 'font-semibold text-slate-900' : 'text-slate-500'
          }`}
      >
        {label}
      </div>
      <div className="relative h-2.5 flex-1 rounded-full bg-slate-100">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${accentClass}`}
          style={{ width }}
        />
      </div>
      <div
        className={`w-10 text-right text-xs tabular-nums ${isHighlight ? 'font-semibold text-slate-900' : 'text-slate-500'
          }`}
      >
        {value.toFixed(0)}%
      </div>
    </div>
  )
}

interface MetricCardProps {
  metricKey: MetricKey
  zoneValue: number | null
  provinceValue: number | null
  nationalValue: number | null
  zoneCount: number | null
}

function MetricCard({
  metricKey,
  zoneValue,
  provinceValue,
  nationalValue,
  zoneCount,
}: MetricCardProps) {
  const meta = METRIC_META[metricKey]
  const zoneAccent = meta.isZeroDose ? 'bg-red-500' : 'bg-teal-600'
  const otherAccent = 'bg-slate-300'

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h4
          className="text-sm font-semibold text-slate-900"
          title={meta.description}
        >
          {meta.label}
        </h4>
        <span className="text-xs text-slate-500">
          {typeof zoneCount === 'number'
            ? `${Math.round(zoneCount).toLocaleString()} enfants`
            : ''}
        </span>
      </div>

      {zoneValue === null ? (
        <p className="mt-3 text-xs text-slate-500">No data for this zone.</p>
      ) : (
        <div className="mt-3 space-y-1.5">
          <ComparisonRow
            label="Zone"
            value={zoneValue}
            accentClass={zoneAccent}
            isHighlight
          />
          {provinceValue !== null && (
            <ComparisonRow
              label="Province"
              value={provinceValue}
              accentClass={otherAccent}
              isHighlight={false}
            />
          )}
          {nationalValue !== null && (
            <ComparisonRow
              label="National"
              value={nationalValue}
              accentClass={otherAccent}
              isHighlight={false}
            />
          )}
        </div>
      )}
    </div>
  )
}

export function ZoneDetail({ row, zoneName }: ZoneDetailProps) {
  const provinces = useProvinceData()
  const province = useMemo(
    () => provinces.find(p => p.displayName === row.provinceId),
    [provinces, row.provinceId]
  )

  // National = population-weighted across provinces via pre-computed
  // pred_*_count / pop_6_24mo, mirroring the IndicatorCards logic.
  const nationalByMetric = useMemo(() => {
    const result: Record<MetricKey, number | null> = {} as any
    METRIC_KEYS.forEach(key => {
      const meta = METRIC_META[key]
      let countSum = 0
      let popSum = 0
      provinces.forEach((p: ProvinceRow) => {
        const c = (p.properties as any)[meta.countKey]
        const pop = (p.properties as any).pop_6_24mo
        if (typeof c === 'number' && typeof pop === 'number') {
          countSum += c
          popSum += pop
        }
      })
      result[key] = popSum > 0 ? (countSum / popSum) * 100 : null
    })
    return result
  }, [provinces])

  const props = row.properties as any

  return (
    <div className="space-y-6 p-5">
      <header>
        <div className="text-xs uppercase tracking-wide text-slate-500">
          {row.provinceId} · Zone de Santé
        </div>
        <h3 className="mt-0.5 text-2xl font-semibold text-slate-900">
          {zoneName || row.displayName}
        </h3>
      </header>

      <section>
        <h4 className="mb-3 text-sm font-semibold text-slate-700">
          Données démographiques
        </h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <DemographicTile
            label="Population totale"
            value={props.total_population}
            description="Population totale estimée résidant dans la zone."
            source="Estimations démographiques GRID3"
          />
          <DemographicTile
            label="Naissances / an"
            value={props.births_per_year}
            description="Estimation du nombre annuel de naissances vivantes, calculée à partir de la population des moins de 1 an et du taux de mortalité infantile (naissances = pop_0_12mo / (1 − TMI/1 000))."
            source="Population de moins de 1 an selon GRID3, combinée au taux de mortalité infantile (TMI) de l'enquête DHS 2024"
          />
          <DemographicTile
            label="Enfants moins de 1 an"
            value={props.pop_0_12mo}
            description="Estimation de la population âgée de 0 à 12 mois."
            source="Estimations démographiques GRID3"
          />
          <DemographicTile
            label="Enfants de 6 à 24 mois"
            value={props.pop_6_24mo}
            description="Population estimée âgée de 6 à 24 mois — dénominateur utilisé pour le calcul de la couverture vaccinale."
            source="Estimations démographiques par grille GRID3 combinées au taux de mortalité infantile (TMI) de l'enquête DHS 2024"
          />
          <DemographicTile
            label="Enfants moins 5 ans"
            value={props.pop_0_5yo}
            description="Estimation de la population âgée de 0 à 5 ans."
            source="Estimations démographiques GRID3"
          />
          <DemographicTile
            label="Taux de Mortalité Infantile"
            value={props.imr}
            format="rate"
            unit="/1k"
            description="Taux de mortalité infantile pour 1 000 naissances vivantes. Donnée fournie au niveau provincial et appliquée de manière uniforme à toutes les zones de la province."
            source="DHS 2024 (au niveau provincial)"
          />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h4 className="text-sm font-semibold text-slate-700">
            Couverture par rapport à la moyenne provinciale et nationale
          </h4>
          <span className="text-xs text-slate-500">% des enfants âgés de 6 à 24 mois</span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {METRIC_KEYS.map(key => {
            const meta = METRIC_META[key]
            const rawZone = props[key]
            const rawProvince = province
              ? (province.properties as any)[key]
              : null
            const zoneCount = props[meta.countKey]

            return (
              <MetricCard
                key={key}
                metricKey={key}
                zoneValue={
                  typeof rawZone === 'number' ? rawZone * 100 : null
                }
                provinceValue={
                  typeof rawProvince === 'number' ? rawProvince * 100 : null
                }
                nationalValue={nationalByMetric[key]}
                zoneCount={typeof zoneCount === 'number' ? zoneCount : null}
              />
            )
          })}
        </div>
      </section>
    </div>
  )
}
