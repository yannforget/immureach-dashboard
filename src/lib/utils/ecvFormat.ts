// Display helpers shared by the ECV card grids.

export const formatPercent = (v: number | null): string => (v == null ? '—' : `${Math.round(v)}%`)

// A value with no interval is an observed 0% / 100%, where no CI is computed.
export const formatCi = (value: number | null, low: number | null, high: number | null): string | undefined =>
    low != null && high != null
        ? `IC 95 % : ${low.toFixed(1)} % – ${high.toFixed(1)} %`
        : value != null
            ? 'IC 95 % : NA'
            : undefined
