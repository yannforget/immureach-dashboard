import { useDeterminantData, CATEGORY_COLORS } from '@/hooks'
import { DeterminantCard } from './DeterminantCard'

export function DeterminantCardGrid() {
  const { categories } = useDeterminantData()

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-700">Facteurs déterminants (modèle COM-B)</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {categories.map(cat => (
          <DeterminantCard
            key={cat.category}
            category={cat.category}
            label={cat.label}
            description={cat.description}
            variableCount={cat.variableCount}
            color={CATEGORY_COLORS[cat.category]}
          />
        ))}
      </div>
    </div>
  )
}
