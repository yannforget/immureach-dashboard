import { useCounterfactuals } from '@/hooks'
import { SCENARIO_DESCRIPTIONS, SCENARIO_LABELS } from '@/lib/utils/counterfactuals'
import { CF_INITIAL_COLOR, CF_SCENARIO_COLORS } from '@/lib/charts/theme'

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
// Gain in percentage points between two probabilities (0-1).
const gain = (from: number, to: number) => `+${Math.round((to - from) * 100)} pts`

export function ActionKpiGrid() {
  const data = useCounterfactuals()
  if (!data) return null
  const { scope } = data

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-700">
        Scénarios contrefactuels · {scope.label}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Enfants zéro-dose analysés"
          value={String(scope.children)}
          detail="Enfants de l'enquête n'ayant reçu aucune dose."
          color="#334155"
        />
        <KpiCard
          label="Probabilité actuelle"
          value={pct(scope.hcs.meanInitial)}
          detail="Probabilité moyenne d'être vacciné avec les caractéristiques actuelles."
          color={CF_INITIAL_COLOR}
        />
        <KpiCard
          label={`Gain · ${SCENARIO_LABELS.indiv}`}
          value={gain(scope.indiv.meanInitial, scope.indiv.meanFinal)}
          detail={`${SCENARIO_DESCRIPTIONS.indiv} Probabilité moyenne : ${pct(scope.indiv.meanFinal)}.`}
          color={CF_SCENARIO_COLORS.indiv}
        />
        <KpiCard
          label={`Gain · ${SCENARIO_LABELS.hcs}`}
          value={gain(scope.hcs.meanInitial, scope.hcs.meanFinal)}
          detail={`${SCENARIO_DESCRIPTIONS.hcs} Probabilité moyenne : ${pct(scope.hcs.meanFinal)}.`}
          color={CF_SCENARIO_COLORS.hcs}
        />
      </div>
    </div>
  )
}
