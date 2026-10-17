const WORD_DOC = 'application/msword'
const WORD_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const EXCEL_XLS = 'application/vnd.ms-excel'
const EXCEL_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024

const IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.avif',
  '.heic',
  '.heif',
  '.svg',
  '.tif',
  '.tiff',
  '.jfif',
]

export const ATTACHMENT_ACCEPT = `image/*,.pdf,.doc,.docx,application/pdf,${WORD_DOC},${WORD_DOCX}`

export const ATTACHMENT_SAVE_ERROR =
  'No se pudo guardar el adjunto; probá un archivo más chico.'

export type AttachmentKind = 'image' | 'pdf' | 'word' | 'other'

function extensionOf(name: string) {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  return dot >= 0 ? lower.slice(dot) : ''
}

function isGenericType(type: string) {
  return type === '' || type === 'application/octet-stream' || type === 'application/binary'
}

function isAllowedAttachment(file: File) {
  const type = file.type.toLowerCase()
  if (type.startsWith('image/')) return true
  if (type === 'application/pdf' || type === WORD_DOC || type === WORD_DOCX) return true
  if (!isGenericType(type)) return false
  const ext = extensionOf(file.name)
  return ext === '.pdf' || ext === '.doc' || ext === '.docx' || IMAGE_EXTENSIONS.includes(ext)
}

function isSpreadsheet(file: File) {
  const type = file.type.toLowerCase()
  if (type === EXCEL_XLS || type === EXCEL_XLSX) return true
  if (!isGenericType(type)) return false
  const ext = extensionOf(file.name)
  return ext === '.xls' || ext === '.xlsx'
}

function isImageFile(file: File) {
  const type = file.type.toLowerCase()
  if (type.startsWith('image/')) return true
  if (!isGenericType(type)) return false
  return IMAGE_EXTENSIONS.includes(extensionOf(file.name))
}

export function pdfAttachmentRejection(file: File) {
  const type = file.type.toLowerCase()
  const pdf = type === 'application/pdf' || (isGenericType(type) && extensionOf(file.name) === '.pdf')
  if (!pdf) return 'Para retiros adjuntá la FC o nota de pedido en PDF.'
  if (file.size > MAX_ATTACHMENT_BYTES) return 'El archivo supera los 2 MB.'
  return null
}

export function attachmentRejection(file: File) {
  if (!isAllowedAttachment(file)) {
    return 'Tipo de archivo no permitido. Usá una imagen, un PDF o un Word (.doc o .docx).'
  }
  if (file.size > MAX_ATTACHMENT_BYTES) return 'El archivo supera los 2 MB.'
  return null
}

export function imageFileRejection(file: File) {
  if (!isImageFile(file)) return 'La foto tiene que ser una imagen.'
  if (file.size > MAX_ATTACHMENT_BYTES) return 'El archivo supera los 2 MB.'
  return null
}

export function claimAttachmentRejection(file: File) {
  if (isSpreadsheet(file)) {
    if (file.size > MAX_ATTACHMENT_BYTES) return 'El archivo supera los 2 MB.'
    return null
  }
  return attachmentRejection(file)
}

export function attachmentKind(name: string, dataUrl?: string): AttachmentKind {
  const mime = /^data:([^;,]+)/i.exec(dataUrl ?? '')?.[1]?.toLowerCase() ?? ''
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime === WORD_DOC || mime === WORD_DOCX) return 'word'
  const ext = extensionOf(name)
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image'
  if (ext === '.pdf') return 'pdf'
  if (ext === '.doc' || ext === '.docx') return 'word'
  return 'other'
}

function mimeFromName(name: string) {
  const ext = extensionOf(name)
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.jfif') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.bmp') return 'image/bmp'
  if (ext === '.avif') return 'image/avif'
  if (ext === '.heic') return 'image/heic'
  if (ext === '.heif') return 'image/heif'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.tif' || ext === '.tiff') return 'image/tiff'
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.doc') return WORD_DOC
  if (ext === '.docx') return WORD_DOCX
  if (ext === '.xls') return EXCEL_XLS
  if (ext === '.xlsx') return EXCEL_XLSX
  return null
}

function normalizeAttachmentDataUrl(file: File, dataUrl: string) {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return dataUrl
  const current = /^data:([^;,]*)/i.exec(dataUrl.slice(0, comma))?.[1]?.toLowerCase() ?? ''
  if (current && !isGenericType(current)) return dataUrl
  const fromFile = file.type.toLowerCase()
  const mime = fromFile && !isGenericType(fromFile) ? fromFile : mimeFromName(file.name)
  if (!mime) return dataUrl
  return `data:${mime};base64,${dataUrl.slice(comma + 1)}`
}

export function readAttachmentFile(file: File) {
  const reader = new FileReader()
  const promise = new Promise<string>((resolve, reject) => {
    reader.onabort = () => reject(new DOMException('Lectura cancelada', 'AbortError'))
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo.'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('No se pudo leer el archivo.'))
        return
      }
      resolve(normalizeAttachmentDataUrl(file, reader.result))
    }
  })
  reader.readAsDataURL(file)
  return {
    promise,
    abort() {
      reader.abort()
    },
  }
}

function dataUrlToBlob(dataUrl: string) {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('Adjunto inválido')
  const header = dataUrl.slice(0, comma)
  const payload = dataUrl.slice(comma + 1)
  const mime = /^data:([^;,]+)/i.exec(header)?.[1] || 'application/octet-stream'
  const binary = /;base64/i.test(header) ? atob(payload) : decodeURIComponent(payload)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mime })
}

export function openAttachment(name: string, dataUrl: string) {
  let blob: Blob
  try {
    blob = dataUrlToBlob(dataUrl)
  } catch {
    return
  }
  const url = URL.createObjectURL(blob)
  const kind = attachmentKind(name, dataUrl)
  if (kind === 'word' || kind === 'other') {
    const link = document.createElement('a')
    link.href = url
    link.download = name || 'adjunto'
    document.body.appendChild(link)
    link.click()
    link.remove()
  } else {
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) {
      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      link.remove()
    }
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
