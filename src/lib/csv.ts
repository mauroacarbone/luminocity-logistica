/** CSV listo para Excel en español: BOM, `;` y CRLF. */

const FORMULA_PREFIX = new Set(['=', '+', '-', '@', '\t', '\r'])

function isPureNumber(value: string) {
  return /^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value)
}

/** Evita que Excel ejecute fórmulas; los números puros quedan igual. */
export function guardCsvFormula(value: string) {
  if (!value) return value
  if (!FORMULA_PREFIX.has(value[0])) return value
  if (isPureNumber(value)) return value
  return `'${value}`
}

/** Envuelve en comillas si hace falta; duplica las comillas internas. */
export function escapeCsvCell(value: string) {
  const text = guardCsvFormula(String(value ?? ''))
  if (/[;"\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

/** Arma el archivo con BOM UTF-8, separador `;` y saltos `\r\n`. */
export function buildCsv(rows: Array<Array<string | number | boolean>>) {
  const lines = rows.map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(';'))
  return `\uFEFF${lines.join('\r\n')}`
}

/** CSV con todos los campos entre comillas, `;` y CRLF (Excel ES). */
export function toCsv(rows: Array<Array<string | number | boolean>>) {
  const lines = rows.map((row) =>
    row
      .map((cell) => {
        const text = guardCsvFormula(String(cell ?? ''))
        return `"${text.replace(/"/g, '""')}"`
      })
      .join(';'),
  )
  return `\uFEFF${lines.join('\r\n')}`
}

/** Descarga el CSV y libera el Object URL después del click. */
export function downloadCsvFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}
