import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_ORDER } from '@/hooks/determinants/useDeterminantData'
import { CONTROL_VARIABLES, INDICATOR_METHODS } from '@/lib/utils/indicatorMethods'

/**
 * Collapsible detail of how each household-model indicator is computed from
 * the ECV questionnaire, grouped by COM-B category.
 */
export function IndicatorMethodsNote() {
  return (
    <details className="mt-3 border-t border-slate-100 pt-3">
      <summary className="cursor-pointer font-medium text-slate-600 hover:text-slate-800">
        Construction des indicateurs à partir de l'ECV
      </summary>
      <p className="mt-2">
        Sauf mention contraire, les questions sont posées à la mère ou gardienne de l'enfant lors de
        l'Enquête de couverture vaccinale. Les indicateurs combinant plusieurs questions sont des
        sommes, des moyennes ou des scores d'ACP (coordonnée sur le premier axe de l'analyse en
        composantes principales). Leur cohérence interne est mesurée par l'α de Cronbach et l'ω de
        McDonald, ou par la corrélation r lorsqu'il n'y a que deux questions.
      </p>
      {CATEGORY_ORDER.map(category => (
        <div key={category} className="mt-4">
          <h4 className="mb-2 font-semibold" style={{ color: CATEGORY_COLORS[category] }}>
            {CATEGORY_LABELS[category]}
          </h4>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2">
            {INDICATOR_METHODS[category].map(m => (
              <div key={m.variable}>
                <dt className="font-medium text-slate-700">
                  {m.label}
                  {m.consistency && <span className="ml-2 text-xs font-normal text-slate-400">{m.consistency}</span>}
                </dt>
                <dd>
                  <ul className="list-disc pl-5 italic">
                    {m.questions.map(q => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                  <p>
                    <span className="text-slate-600">Calcul&nbsp;:</span> {m.construction}
                  </p>
                  {m.remark && (
                    <p>
                      <span className="text-slate-600">Remarque&nbsp;:</span> {m.remark}
                    </p>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <p className="mt-4">
        <span className="font-semibold text-slate-600">Variables de contrôle&nbsp;:</span>{' '}
        {CONTROL_VARIABLES.join(', ')}.
      </p>
      <p className="mt-3 text-xs text-slate-400">
        Bandura A. (1977), Psychological Review 84(2) ; MacDonald N. E. (2015), Vaccine 33(34) ;
        Salako J. et al. (2024), Pan African Medical Journal 47.
      </p>
    </details>
  )
}
