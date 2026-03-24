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
    coverage: 'Predicted proportion of children vaccinated with BCG (vaccine against tuberculosis)',
    count: 'Predicted number of children vaccinated with BCG in the 6-24 months population'
  },
  pred_rota: {
    coverage: 'Predicted proportion of children vaccinated with rotavirus vaccine',
    count: 'Predicted number of children vaccinated with rotavirus vaccine in the 6-24 months population'
  },
  pred_var: {
    coverage: 'Predicted proportion of children vaccinated with measles vaccine',
    count: 'Predicted number of children vaccinated with measles vaccine in the 6-24 months population'
  },
  pred_vaa: {
    coverage: 'Predicted proportion of children vaccinated with yellow fever vaccine',
    count: 'Predicted number of children vaccinated with yellow fever vaccine in the 6-24 months population'
  },
  pred_polio: {
    coverage: 'Predicted proportion of children vaccinated with polio vaccine',
    count: 'Predicted number of children vaccinated with polio vaccine in the 6-24 months population'
  },
  pred_pcv: {
    coverage: 'Predicted proportion of children vaccinated with pneumococcal vaccine (against Streptococcus pneumoniae)',
    count: 'Predicted number of children vaccinated with pneumococcal vaccine in the 6-24 months population'
  },
  pred_zerodosepenta: {
    coverage: 'Predicted proportion of zero dose children based on pentavalent vaccine uptake',
    count: 'Predicted number of zero dose children (pentavalent) in the 6-24 months population'
  },
  pred_zerodoseall: {
    coverage: 'Predicted proportion of zero dose children based on uptake of all vaccines',
    count: 'Predicted number of zero dose children (all vaccines) in the 6-24 months population'
  }
}

function getMetricDescription(metricKey: MetricKey, isZeroDose: boolean): string {
  return VACCINE_DESCRIPTIONS[metricKey]?.coverage || ''
}

function getCountDescription(metricKey: MetricKey): string {
  return VACCINE_DESCRIPTIONS[metricKey]?.count || ''
}

export function IndicatorCard({
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
  const countLabel = isZeroDose ? `${formattedCount} (6-24 mo)` : `${formattedCount} (6-24 mo)`

  const metricDescription = getMetricDescription(metricKey, isZeroDose)
  const countDescription = getCountDescription(metricKey)

  return (
    <button
      onClick={() => setMetric(metricKey)}
      className={`rounded-lg border px-4 py-3 text-left transition-all ${
        isSelected
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
            title="More information"
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
                <div className="font-semibold text-slate-400 text-2xs mb-1">Source</div>
                <div className="text-slate-300">ImmuReach models + national surveys</div>
              </div>
              <div>
                <div className="font-semibold mb-1">Number of Children</div>
                <div className="text-slate-300">{countDescription}</div>
              </div>
              <div>
                <div className="font-semibold text-slate-400 text-2xs mb-1">Source</div>
                <div className="text-slate-300">ImmuReach estimates + GRID3 population data</div>
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
