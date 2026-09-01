import { useMemo } from 'react'
import EChartsReact from 'echarts-for-react'
import { useAccessibilityProfile } from '@/hooks'
import { buildAccessibilityOptions } from '@/lib/charts/accessibilityOptions'

export function ModelAccessibilityChart() {
  const profile = useAccessibilityProfile()

  const options = useMemo(() => {
    if (!profile) return null
    return buildAccessibilityOptions({
      thresholds: profile.thresholds,
      counts: profile.counts,
      cumulativePct: profile.cumulativePct,
      total: profile.total,
    })
  }, [profile])

  if (!profile || !options) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">
            Accessibility profile
          </h3>
        </div>
        <div className="flex flex-1 items-center justify-center bg-slate-50 text-sm text-slate-500">
          No accessibility data for this selection.
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">
          Profil d'accessibilité · {profile.scopeLabel}
        </h3>
        <p className="text-xs text-slate-500">
          Proportion d'enfants n'ayant reçu aucune dose, par tranche de temps de trajet jusqu'à l'établissement de santé le plus proche
          {profile.scopeLevel !== profile.requestedLevel && (
            <span className="ml-1 text-amber-600">· showing {profile.scopeLevel} fallback</span>
          )}
        </p>
      </div>
      <div className="flex-1">
        <EChartsReact
          option={options}
          theme="dashboard"
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
