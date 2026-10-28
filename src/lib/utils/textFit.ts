// Text measurement helpers used to decide whether a chart label fits in a box.

let ctx: CanvasRenderingContext2D | null = null

export const measureText = (text: string, font: string): number => {
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return 0
  ctx.font = font
  return ctx.measureText(text).width
}

// Number of lines `text` takes once wrapped at word boundaries to `maxWidth`,
// or null when a single word is wider than the box (it would be cut mid-word).
export const wrappedLineCount = (text: string, maxWidth: number, font: string): number | null => {
  const space = measureText(' ', font)
  let lines = 1
  let lineWidth = 0
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = measureText(word, font)
    if (w > maxWidth) return null
    if (lineWidth === 0) lineWidth = w
    else if (lineWidth + space + w <= maxWidth) lineWidth += space + w
    else {
      lines += 1
      lineWidth = w
    }
  }
  return lines
}
