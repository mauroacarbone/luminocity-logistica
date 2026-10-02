import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser'

let cameraTurn: Promise<void> = Promise.resolve()

function afterCameraTurn(task: () => Promise<void>) {
  const turn = cameraTurn.then(task)
  cameraTurn = turn.then(
    () => undefined,
    () => undefined,
  )
  return turn
}

function errorName(error: unknown) {
  if (typeof error === 'object' && error !== null && 'name' in error) return String(error.name)
  return ''
}

function cameraFailureMessage(error: unknown) {
  const name = errorName(error)
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'El navegador negó el acceso a la cámara. Pegá el código a mano.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No hay una cámara disponible. Pegá el código a mano.'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'La cámara está en uso o no se pudo abrir. Pegá el código a mano.'
  }
  return 'No se pudo abrir la cámara. Pegá el código a mano.'
}

function canRetryWithAnyCamera(error: unknown) {
  return errorName(error) === 'OverconstrainedError'
}

function stopStream(video: HTMLVideoElement) {
  const stream = video.srcObject
  if (stream instanceof MediaStream) {
    for (const track of stream.getTracks()) track.stop()
  }
}

export function QrScanDialog({
  title,
  hint,
  confirmLabel,
  error,
  pending = false,
  onClose,
  onSubmit,
}: {
  title: string
  hint: string
  confirmLabel: string
  error: string
  pending?: boolean
  onClose: () => void
  onSubmit: (code: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const onSubmitRef = useRef(onSubmit)
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState<'starting' | 'live' | 'error'>('starting')
  const [cameraNote, setCameraNote] = useState('Abriendo cámara…')

  useEffect(() => {
    onSubmitRef.current = onSubmit
  }, [onSubmit])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (phase === 'error') inputRef.current?.focus()
  }, [phase])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let active = true
    let controls: IScannerControls | undefined
    let lastText = ''
    let lastAt = 0
    let releaseTurn = () => {}
    const turnDone = new Promise<void>((resolve) => {
      releaseTurn = resolve
    })
    const reader = new BrowserQRCodeReader(undefined, {
      delayBetweenScanAttempts: 300,
      delayBetweenScanSuccess: 800,
    })

    function onResult(result: { getText: () => string } | undefined) {
      if (!active || !result) return
      const text = result.getText().trim()
      if (!text) return
      const now = Date.now()
      if (text === lastText && now - lastAt < 1200) return
      lastText = text
      lastAt = now
      onSubmitRef.current(text)
    }

    async function start(constraints: MediaStreamConstraints) {
      const next = await reader.decodeFromConstraints(constraints, video ?? undefined, (result) => {
        onResult(result)
      })
      controls = next
      if (!active) return
      setPhase('live')
      setCameraNote('')
    }

    void afterCameraTurn(async () => {
      if (!active || !video.isConnected) return
      const preferred: MediaStreamConstraints = {
        video: { facingMode: { ideal: 'environment' } },
      }
      try {
        await start(preferred)
      } catch (firstError) {
        if (!active) return
        if (!canRetryWithAnyCamera(firstError)) {
          setPhase('error')
          setCameraNote(cameraFailureMessage(firstError))
        } else {
          try {
            await start({ video: true })
          } catch (cameraError) {
            if (!active) return
            setPhase('error')
            setCameraNote(cameraFailureMessage(cameraError))
          }
        }
      }
      await turnDone
      controls?.stop()
      stopStream(video)
    })

    return () => {
      active = false
      releaseTurn()
    }
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-title"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-lg"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(code)
        }}
      >
        <h2 id="scan-title" className="text-xl font-semibold">
          {title}
        </h2>
        <p className="mt-1 text-sm text-lumi-muted">{hint}</p>
        <div className="relative mt-4 overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            muted
            autoPlay
            playsInline
            aria-label="Vista de la cámara"
            className={`w-full object-contain ${phase === 'error' ? 'hidden' : 'aspect-[4/3]'}`}
          />
          {phase === 'starting' && (
            <p className="absolute inset-0 grid place-items-center px-3 text-center text-sm text-white">
              Abriendo cámara…
            </p>
          )}
          {phase === 'error' && (
            <p role="status" className="bg-white px-3 py-8 text-center text-sm text-lumi-danger">
              {cameraNote}
            </p>
          )}
        </div>
        <label className="mt-4 block text-sm font-medium">
          N° de pedido o factura
          <input
            ref={inputRef}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="P-1234567"
            className="mt-1 w-full rounded-xl border border-lumi-line px-3 py-2"
          />
        </label>
        {error && <p className="mt-2 text-sm text-lumi-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-xl px-3 py-2 text-sm text-lumi-muted hover:bg-[#f7f4ea] disabled:opacity-50"
            disabled={pending}
            onClick={onClose}
          >
            Cerrar
          </button>
          <button
            type="submit"
            className="rounded-xl bg-lumi-yellow px-4 py-2 text-sm font-semibold text-lumi-yellow-ink disabled:opacity-50"
            disabled={pending}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
