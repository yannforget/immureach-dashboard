import { useState } from 'react'
import { useDashboardStore } from '@/store/dashboardStore'
import type { MetricKey } from '@/types'

interface IndicatorCardProps {
  metricKey: MetricKey
  label: string
  value: number  // percentage (0-100)
  count: number  // vaccinated count or zero-dose child count
  isZeroDose: boolean
}

// Vaccine descriptions mapping
const VACCINE_DESCRIPTIONS: Record<MetricKey, { coverage: string; count: string }> = {
  pred_bcg: {
    coverage: "Proportion estimée d'enfants vaccinés par le BCG (vaccin contre la tuberculose)",
    count: "Nombre estimé d'enfants vaccinés par le BCG parmi la population âgée de 6 à 24 mois"
  },
  pred_rota: {
    coverage: "Proportion estimée d'enfants vaccinés contre le rotavirus",
    count: "Nombre estimé d'enfants vaccinés contre le rotavirus parmi la population âgée de 6 à 24 mois"
  },
  pred_var: {
    coverage: "Proportion estimée d'enfants vaccinés contre la rougeole",
    count: "Nombre estimé d'enfants vaccinés contre la rougeole parmi la population âgée de 6 à 24 mois"
  },
  pred_vaa: {
    coverage: "Proportion estimée d'enfants vaccinés contre la fièvre jaune",
    count: "Nombre estimé d'enfants vaccinés contre la fièvre jaune parmi la population âgée de 6 à 24 mois"
  },
  pred_polio: {
    coverage: "Proportion estimée d'enfants vaccinés contre la polio",
    count: "Nombre estimé d'enfants vaccinés contre la polio parmi la population âgée de 6 à 24 mois"
  },
  pred_pcv: {
    coverage: "Proportion estimée d'enfants vaccinés contre le pneumocoque (Streptococcus pneumoniae)",
    count: "Nombre estimé d'enfants vaccinés contre le pneumocoque parmi la population âgée de 6 à 24 mois"
  },
  pred_zerodosepenta: {
    coverage: "Proportion estimée d'enfants n'ayant reçu aucune dose, sur la base du taux de couverture vaccinale par le vaccin pentavalent",
    count: "Nombre estimé d'enfants n'ayant reçu aucune dose (vaccin pentavalent) parmi la population âgée de 6 à 24 mois"
  },
  pred_zerodoseall: {
    coverage: "Proportion estimée d'enfants n'ayant reçu aucune dose, sur la base du taux de couverture vaccinale pour l'ensemble des vaccins",
    count: "Nombre estimé d'enfants n'ayant reçu aucune dose (tous vaccins confondus) parmi la population âgée de 6 à 24 mois"
  }
}

function getMetricDescription(metricKey: MetricKey): string {
  return VACCINE_DESCRIPTIONS[metricKey]?.coverage || ''
}

function getCountDescription(metricKey: MetricKey): string {
  return VACCINE_DESCRIPTIONS[metricKey]?.count || ''
}

export function IndicatorCardZeroDose({
  metricKey,
  label,
  value,
  count,
  isZeroDose,
}: IndicatorCardProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const selectedMetric = useDashboardStore(s => s.selectedMetric)
  const setMetric = useDashboardStore(s => s.setMetric)

  const isSelected = selectedMetric === metricKey

  const displayValue = Math.round(value)
  const suffix = '%'
  const formattedCount = Math.round(count).toLocaleString()
  const countLabel = `${formattedCount} (6 à 24 mois)`

  const metricDescription = getMetricDescription(metricKey)
  const countDescription = getCountDescription(metricKey)

  return (
    <button
      onClick={() => setMetric(metricKey)}
      className={`rounded-lg border px-4 py-3 text-left transition-all ${isSelected
        ? 'border-teal-600 bg-teal-50 shadow-md'
        : 'border-slate-200 bg-white hover:border-teal-400'
        }`}
    >
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
            title="Plus d'informations"
            style={{ fontSize: '10px', fontWeight: '600' }}
          >
            ?
          </div>
          {showTooltip && (
            <div className="absolute right-0 top-5 z-50 w-64 rounded-md bg-slate-900 px-3 py-3 text-xs text-white shadow-lg space-y-2">
              <div>
                <div className="font-semibold mb-1">{isZeroDose ? 'Zero-dose Children' : 'Coverage Rate'}</div>
                <div className="text-slate-300">{metricDescription}</div>
              </div>
              <div>
                <div className="font-semibold text-slate-400 text-2xs mb-1">Sources</div>
                <div className="text-slate-300">Modèles ImmuReach models + sondages nationaux</div>
              </div>
              <div>
                <div className="font-semibold mb-1">Nombre d'enfants</div>
                <div className="text-slate-300">{countDescription}</div>
              </div>
              <div>
                <div className="font-semibold text-slate-400 text-2xs mb-1">Sources</div>
                <div className="text-slate-300">Estimations ImmuReach + données population GRID3</div>
              </div>
              <div className="absolute -top-1 right-2 h-2 w-2 rotate-45 bg-slate-900"></div>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">
        {displayValue}
        <span className="text-sm text-slate-600">{suffix}</span>
      </p>
      <p className="text-xs text-slate-500">{countLabel}</p>
    </button>
  )
}
