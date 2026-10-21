import { useCounterfactuals } from '@/hooks'
import { SCENARIO_DESCRIPTIONS, SCENARIO_LABELS, SEGMENT_DESCRIPTIONS } from '@/lib/utils/counterfactuals'
import { CF_SCENARIO_COLORS, CF_SEGMENT_COLORS } from '@/lib/charts/theme'

interface KpiCardProps {
  label: string
  value: string
  detail: string
  color: string
}

function KpiCard({ label, value, detail, color }: KpiCardProps) {
  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4"
      style={{ borderLeftWidth: 4, borderLeftColor: color }}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold" style={{ color }}>{value}</p>
      <p className="mt-1 text-xs leading-snug text-slate-500">{detail}</p>
    </div>
  )
}

const pct = (v: number) => `${Math.round(v * 100)} %`

export function ActionKpiGrid() {
  const data = useCounterfactuals()
  if (!data) return null
  const { scope } = data
  const neither = scope.segments.find(s => s.segment === 'neither')!

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-700">
        Scénarios contrefactuels · {scope.label}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Enfants zéro-dose analysés"
          value={String(scope.children)}
          detail={`Probabilité moyenne actuelle d'être vacciné : ${pct(scope.hcs.meanInitial)}.`}
          color="#334155"
        />
        <KpiCard
          label={`Atteints · ${SCENARIO_LABELS.indiv}`}
          value={pct(scope.indiv.reached)}
          detail={SCENARIO_DESCRIPTIONS.indiv}
          color={CF_SCENARIO_COLORS.indiv}
        />
        <KpiCard
          label={`Atteints · ${SCENARIO_LABELS.hcs}`}
          value={pct(scope.hcs.reached)}
          detail={SCENARIO_DESCRIPTIONS.hcs}
          color={CF_SCENARIO_COLORS.hcs}
        />
        <KpiCard
          label="Non atteints"
          value={pct(neither.share)}
          detail={SEGMENT_DESCRIPTIONS.neither}
          color={CF_SEGMENT_COLORS.neither}
        />
      </div>
    </div>
  )
}
