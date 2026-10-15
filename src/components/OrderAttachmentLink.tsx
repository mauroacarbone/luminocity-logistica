import { attachmentKind, openAttachment } from '../lib/attachment'

export function OrderAttachmentLink({ name, dataUrl }: { name?: string; dataUrl?: string }) {
  if (!dataUrl) return null
  const kind = attachmentKind(name ?? '', dataUrl)
  const label = kind === 'word' ? 'Descargar' : 'Ver adjunto'
  return (
    <button
      type="button"
      className="self-start text-left text-sm font-medium text-text hover:underline"
      title={name ? `${label} ${name}` : label}
      onClick={() => openAttachment(name || 'adjunto', dataUrl)}
    >
      {label}
    </button>
  )
}
