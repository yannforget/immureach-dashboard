import { Ribbon } from '../common/Ribbon'
import { Notes } from '../common/Notes'
import { PlaceholderPanel } from '../common/PlaceholderPanel'
import { EcvIndicatorCardGrid, EcvSeriesCardGrid, EcvZeroDoseMap, EcvVaccineBarChart, EcvEvolutionLineChart, EcvCaracteristicsChart } from '@/components/features/ecv'
import { ModelIndicatorCardGrid, ModelCoverageMap, ModelBarChart, ModelVaccinationDataTable, ProfilingPanel } from '@/components/features/model'
import { DeterminantCardGrid, BehaviourIndicatorsChart, BehaviourIndicatorsMap, PartialDependenceChart, PartialDependenceGrid, RelativeInfluenceTreemap, IndicatorMethodsNote } from '@/components/features/determinants'
import { ActionKpiGrid, SegmentChart, ProbabilityShiftChart, LeverChart, ChildScatterChart } from '@/components/features/actions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { useDashboardStore } from '@/store/dashboardStore'
import type { ViewMode } from '@/types'

export function DashboardGrid() {
  const activeSection = useDashboardStore(s => s.activeSection)
  const viewMode = useDashboardStore(s => s.viewMode)
  const setViewMode = useDashboardStore(s => s.setViewMode)

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Ribbon: 5 section tabs + filters (year, province, zone; varies by section).
          Sticky so the filters stay reachable while scrolling; the page-coloured
          padding hides content scrolling underneath, and z-40 keeps it above
          the charts' own overlays (map legend, download menus). */}
      <section className="sticky top-0 z-40 mb-6 bg-slate-50 py-2">
        <Ribbon />
      </section>

      {activeSection === 'ecv' && (<section className="mb-8">
        <div className="mb-6">
          {/* ECV survey explanation */}
          <Notes>
            L’Enquête de couverture vaccinale (ECV) est une enquête nationale conduite au niveau de ménages et des
            établissements de soins de 519 zones de santé de la RDC, en prenant au minimum cinq aires de santé par
            zones de santé. Les données sur les conditions de ménages, les chefs de ménages, les mères gardiennes des
            enfants de 6-23 mois, la vaccination des enfants et la localisation géoréférencée sont collectées par interviews
            et par observation de cartes. Les analyses produisent notamment des indicateurs de couverture vaccinales,
            les raisons de non vaccination et la perception des services de vaccination.
            Données accessibles{' '}
            <a
              href="https://espkinshasa.net/?s=ECV"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-teal-700 underline hover:text-teal-800"
            >
              ici
            </a>
            .
          </Notes>
        </div>
        {/* Indicator Cards */}
        <EcvIndicatorCardGrid />
        {/* Complete vaccination series, one card per vaccine */}
        <div className="mt-6">
          <EcvSeriesCardGrid />
        </div>
        {/* Charts Grid: zero-dose map (left) + vaccine coverage bar chart (right) */}
        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <div className="h-96 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <EcvZeroDoseMap />
            </div>
            <div className="h-96 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <EcvEvolutionLineChart />
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div className="h-96 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <EcvVaccineBarChart />
            </div>
            <div className="h-96 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <EcvCaracteristicsChart />
            </div>
          </div>
        </section>
      </section>
      )}
      {activeSection === 'determinants' && (
        <>
          {/* Category cards */}
          <section className="mb-8">
            <DeterminantCardGrid />
          </section>
          {/* Behaviour indicators dumbbell (left) + map of the widest-gap
              indicator's category per area (right); the map stretches to the
              dumbbell's content-driven height. */}
          <section className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <BehaviourIndicatorsChart />
            </div>
            <div className="min-h-96 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <BehaviourIndicatorsMap />
            </div>
          </section>
          {/* Relative influence of the household-model variables */}
          <section className="mb-8">
            <div className="h-[32rem] overflow-hidden rounded-lg border border-slate-200 bg-white">
              <RelativeInfluenceTreemap />
            </div>
          </section>
          {/* Partial dependency: effect of the selected variable + overview */}
          <section className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-[32rem] overflow-hidden rounded-lg border border-slate-200 bg-white">
              <PartialDependenceChart />
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <PartialDependenceGrid />
            </div>
          </section>
          {/* COM-B explanation */}
          <section className="mt-8">
            <Notes>
              <strong>Modèle COM-B&nbsp;:</strong> le comportement de vaccination est déterminé par
              l'interaction entre trois composantes : <em>Capacité</em> (connaissances, aptitudes),
              <em> Motivation</em> (croyances, attitudes, peurs) et <em>Opportunité</em> (accès,
              normes sociales, coûts).
              <br />
              <strong>Influence relative&nbsp;:</strong> part du pouvoir prédictif du modèle ménage
              attribuée à chaque variable (total = 100&nbsp;%). Elle indique l'importance d'un
              déterminant, pas le sens de son effet sur la vaccination.
              <IndicatorMethodsNote />
            </Notes>
          </section>
        </>
      )}
      {activeSection === 'actions' && (
        <>
          {/* Counterfactual analysis explanation */}
          <section className="mb-8">
            <Notes>
              <strong>Analyse contrefactuelle&nbsp;:</strong> pour chaque enfant zéro-dose de
              l'enquête, le modèle ménage recalcule sa probabilité d'être vacciné (au moins une dose)
              en modifiant ses caractéristiques, toutes choses égales par ailleurs. Le scénario
              <em> Accès aux services</em> agit sur l'offre (opportunités manquées, sensibilisation,
              temps de trajet, doses et personnel disponibles), le scénario <em>Facteurs individuels</em> sur
              la demande (opinion, confiance en sa capacité, connaissances). Un enfant est considéré
              comme atteint lorsque cette probabilité dépasse le seuil retenu par le modèle (environ 40&nbsp;%). Analyse disponible pour le
              Kasaï et la Tshopo.
            </Notes>
          </section>
          {/* Key figures of the counterfactual scenarios */}
          <section className="mb-8">
            <ActionKpiGrid />
          </section>
          {/* Who each approach reaches (left) + mean probability shift (right) */}
          <section className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-96 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <SegmentChart />
            </div>
            <div className="h-96 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <ProbabilityShiftChart />
            </div>
          </section>
          {/* Levers to act on (left) + child-level scatter (right), both
              filtered by the selected segment */}
          <section className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-[28rem] overflow-hidden rounded-lg border border-slate-200 bg-white">
              <LeverChart />
            </div>
            <div className="h-[28rem] overflow-hidden rounded-lg border border-slate-200 bg-white">
              <ChildScatterChart />
            </div>
          </section>
        </>
      )}
      {activeSection === 'methodologie' && <PlaceholderPanel title="Méthodologie" />}

      {activeSection === 'zerodose' && (
        <>
          {/* Indicator Cards */}
          <section className="mb-8">
            <ModelIndicatorCardGrid />
          </section>
          {/* Charts Grid */}
          <section className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-96 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <ModelCoverageMap />
            </div>
            <div className="h-96 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <ModelBarChart />
            </div>
          </section>

          {/* Mode-switched lower panel: Data table vs Profiling charts */}
          <section>
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <div className="flex items-center justify-between gap-4">
                <TabsList>
                  <TabsTrigger value="data">Données</TabsTrigger>
                  <TabsTrigger value="profiling">Profils</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="data">
                <div className="rounded-lg border border-slate-200 bg-white">
                  <ModelVaccinationDataTable />
                </div>
              </TabsContent>
              <TabsContent value="profiling">
                <ProfilingPanel />
              </TabsContent>
            </Tabs>
          </section>
          <section className="mt-8">
            <Notes>
              Résultats du modèle à l'échelle des zones de santé développé dans le cadre d'un
              post-doctorat au laboratoire SPELL (Belgique)
            </Notes>
          </section>
        </>
      )
      }
    </div >
  )
}