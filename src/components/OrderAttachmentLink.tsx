import { attachmentKind, openAttachment } from '../lib/attachment'
import { Button } from './ui'

export function OrderAttachmentLink({
  name,
  dataUrl,
  label,
}: {
  name?: string
  dataUrl?: string
  label?: string
}) {
  if (!dataUrl) return null
  const kind = attachmentKind(name ?? '', dataUrl)
  const text = label ?? (kind === 'word' ? 'Descargar' : 'Ver adjunto')
  const title = name ? `${text} ${name}` : text
  if (label) {
    return (
      <Button
        variant="secondary"
        size="lg"
        className="min-h-11 self-start"
        title={title}
        onClick={() => openAttachment(name || 'adjunto', dataUrl)}
      >
        {text}
      </Button>
    )
  }
  return (
    <button
      type="button"
      className="self-start text-left text-sm font-medium text-text hover:underline"
      title={title}
      onClick={() => openAttachment(name || 'adjunto', dataUrl)}
    >
      {text}
    </button>
  )
}
