/**
 * Clean display name: remove prefix, " Province" and " Zone de Santé" suffixes
 * e.g., "kl Kwilu Province" -> "Kwilu"
 * e.g., "some Zone de Santé Name" -> "Name"
 */
export function cleanName(name: string): string {
  // Remove 2-letter prefix
  let cleaned = name.replace(/^[a-z]{2}\s/, '');
  // Remove " Province" suffix
  cleaned = cleaned.replace(/ Province$/, '');
  // Remove " Zone de Santé" suffix
  cleaned = cleaned.replace(/ Zone de Santé$/, '');
  return cleaned;
}

/**
 * Get display name for province buttons (drop " Province" suffix)
 */
export function getDisplayName(fullName: string): string {
  return fullName.replace(/ Province$/, '');
}

/**
 * Compute colorscale bounds as multiples of 10
 */
export function getColorScaleBounds(values: number[]): { min: number; max: number } {
  const validValues = values.filter(v => !isNaN(v) && v >= 0);
  if (validValues.length === 0) return { min: 0, max: 100 };

  const min = Math.floor(Math.min(...validValues) / 10) * 10;
  const max = Math.ceil(Math.max(...validValues) / 10) * 10;

  return { min: Math.max(0, min), max: Math.max(100, max) };
}
