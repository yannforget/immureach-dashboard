interface PlaceholderPanelProps { title: string }

export function PlaceholderPanel({ title }: PlaceholderPanelProps) {
    return (
        <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white text-center">
            <p className="font-medium text-slate-500">{title}</p>
            <p className="text-sm text-slate-400">Contenu à venir</p>
        </div>
    )
}