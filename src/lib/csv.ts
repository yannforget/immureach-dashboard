// Minimal CSV parser: handles quoted fields (with escaped "" and embedded
// commas), no external dependency needed for our simple tabular data files.
// Not built to handle multi-line quoted fields.
function parseCsvLine(line: string): string[] {
    const cells: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
        const char = line[i]

        if (inQuotes) {
            if (char === '"') {
                if (line[i + 1] === '"') {
                    current += '"'
                    i++
                } else {
                    inQuotes = false
                }
            } else {
                current += char
            }
        } else if (char === '"') {
            inQuotes = true
        } else if (char === ',') {
            cells.push(current)
            current = ''
        } else {
            current += char
        }
    }

    cells.push(current)
    return cells
}

export function parseCsv(text: string): Record<string, string>[] {
    const lines = text.replace(/\r\n/g, '\n').split('\n').filter(line => line.trim().length > 0)
    if (lines.length === 0) return []

    const header = parseCsvLine(lines[0]).map(h => h.trim())

    return lines.slice(1).map(line => {
        const cells = parseCsvLine(line)
        const row: Record<string, string> = {}
        header.forEach((key, i) => {
            row[key] = (cells[i] ?? '').trim()
        })
        return row
    })
}