import type { DeterminantCategory } from '@/types'

interface DeterminantCardProps {
  label: string
  description: string
  variableCount: number
  color: string
  category: DeterminantCategory
}

export function DeterminantCard({
  label,
  description,
  variableCount,
  color,
  category,
}: DeterminantCardProps) {
  return (
    <div
      className={`rounded-lg border bg-white p-4 transition-shadow hover:shadow-md ${category === 'Capacity'
        ? 'border-teal-200'
        : category === 'Motivation'
          ? 'border-amber-200'
          : category === 'Opportunity'
            ? 'border-blue-200'
            : 'border-slate-200'
        }`}
      style={{ borderLeftWidth: 4, borderLeftColor: color }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
      </div>
      <p className="mt-2 text-sm leading-snug text-slate-600">{description}</p>
      <p className="mt-2 text-xs text-slate-400">
        {variableCount} {variableCount > 1 ? 'variables' : 'variable'}
      </p>
    </div>
  )
}
