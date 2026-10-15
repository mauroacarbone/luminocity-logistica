export function Spinner({ label = 'Cargando…', compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div
      className={`grid place-items-center text-sm text-muted ${compact ? 'gap-2 py-6' : 'gap-3 py-16'}`}
      role="status"
    >
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  )
}

export function ServerDown({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="server-down" role="alert">
      <p>{message}</p>
      <button type="button" className="btn-primary" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  )
}
