import { useDashboardStore } from '@/store/dashboardStore'
import { useData } from '@/context/DataContext'
import { useProvinceData, useZoneData } from '@/hooks'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { DashboardSection, Year } from '@/types'

const SECTIONS: { value: DashboardSection; label: string }[] = [
    { value: 'ecv', label: 'Données brutes ECV' },
    { value: 'zerodose', label: 'Modèle Zéro dose' },
    { value: 'determinants', label: 'Déterminants ménages' },
    { value: 'actions', label: 'Actions / interventions' },
]

const selectClass =
    'rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 ' +
    'focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 ' +
    'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

export function Ribbon() {
    const activeSection = useDashboardStore(s => s.activeSection)
    const setActiveSection = useDashboardStore(s => s.setActiveSection)

    const selectedYear = useDashboardStore(s => s.selectedYear)
    const setSelectedYear = useDashboardStore(s => s.setSelectedYear)

    const selectedProvince = useDashboardStore(s => s.selectedProvince)
    const setProvince = useDashboardStore(s => s.setProvince)

    const selectedZoneId = useDashboardStore(s => s.selectedZoneId)
    const setSelectedZone = useDashboardStore(s => s.setSelectedZone)

    const { profile } = useData()
    const years: Year[] = profile?.years ?? [2022, 2023]

    const provinces = useProvinceData()
    const zones = useZoneData(selectedProvince)

    return (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            {/* Tabs */}
            <Tabs
                value={activeSection}
                onValueChange={v => setActiveSection(v as DashboardSection)}
            >
                <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-t-lg rounded-b-none bg-slate-50 p-1.5">
                    {SECTIONS.map(section => (
                        <TabsTrigger key={section.value} value={section.value} className="px-4 py-2 text-sm">
                            {section.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-5 border-t border-slate-100 px-4 py-3">
                {/* Year */}
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">Année</span>
                    <div className="inline-flex rounded-md bg-slate-100 p-1">
                        {years.map(y => (
                            <button
                                key={y}
                                type="button"
                                onClick={() => setSelectedYear(y)}
                                className={`rounded-sm px-3 py-1 text-xs font-medium transition-colors ${selectedYear === y
                                    ? 'bg-white text-teal-700 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                                    }`}
                            >
                                {y}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Province */}
                <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    Province
                    <select
                        value={selectedProvince ?? ''}
                        onChange={e => setProvince(e.target.value === '' ? null : e.target.value)}
                        className={selectClass}
                    >
                        <option value="">Toutes</option>
                        {provinces.map(p => (
                            <option key={p.id} value={p.displayName}>
                                {p.displayName}
                            </option>
                        ))}
                    </select>
                </label>

                {/* Zone */}
                <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    Zone de santé
                    <select
                        value={selectedZoneId ?? ''}
                        onChange={e => setSelectedZone(e.target.value === '' ? null : e.target.value)}
                        disabled={!selectedProvince}
                        className={selectClass}
                    >
                        <option value="">{selectedProvince ? 'Toutes' : 'Sélectionnez une province'}</option>
                        {zones.map(z => (
                            <option key={z.id} value={z.id}>
                                {z.displayName}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
        </div>
    )
}