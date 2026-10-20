export const PDF_DATA_PREFIX = 'data:application/pdf;base64,'
export const PDF_MAX_BYTES = 2 * 1024 * 1024

export function pdfByteLength(dataUrl) {
  const payload = dataUrl.slice(PDF_DATA_PREFIX.length).replace(/\s/g, '')
  if (!payload || /[^A-Za-z0-9+/=]/.test(payload)) return null
  const pad = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.floor((payload.length * 3) / 4) - pad
}
