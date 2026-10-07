export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <h1 className="text-3xl font-bold text-slate-900">ImmuReach</h1>
        <p className="mt-1 text-slate-600">Reaching Missed Communities in DRC</p>
        <p className="mt-3 text-justify text-sm leading-relaxed text-slate-500">
          L'objectif de ce tableau de bord est d'exploiter les données issues de l'enquête ECV et du
          SNIS afin de faciliter l'identification et le ciblage des enfants sous-vaccinées dans
          le cadre des campagnes de vaccination. Plus précisément, un modèle a été développé et validé
          pour identifier les communautés exposées à un risque de sous-vaccination. Une procédure
          d'optimisation a ensuite été mise au point et appliquée afin d'orienter l'allocation des
          ressources et d'optimiser la couverture vaccinale au sein de ces populations.
        </p>
      </div>
    </header>
  )
}
