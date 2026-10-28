// French-formatted relative influence, e.g. 26.35 -> "26,4 %". Values under
// 0.1 % keep two decimals so the smallest influences don't all read "0,0 %".
export const formatRi = (v: number): string =>
  `${v.toLocaleString('fr-FR', { maximumFractionDigits: v < 0.1 ? 2 : 1, minimumFractionDigits: v < 0.1 ? 2 : 1 })} %`
