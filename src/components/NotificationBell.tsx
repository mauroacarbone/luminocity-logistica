import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ServerDown, Spinner } from './LoadState'
import { NotificationToast } from './NotificationToast'
import { confirm, error as showError, success } from '../lib/alerts'
import { namesMatch } from '../lib/access'
import { isSession, type Session } from '../lib/authStore'
import { loadSeenIds, rememberSeenIds } from '../lib/notifSeen'
import {
  isNotification,
  listNotifications,
  markNotificationRead,
  markNotificationSent,
  type AppNotification,
} from '../lib/notificationsApi'
import { listUsers } from '../lib/usersApi'
import { whatsappLink } from '../lib/whatsapp'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'

function formatWhen(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function sellerPhone(item: AppNotification, orders: { id: string; seller?: string }[], users: Session[]) {
  if (item.phone?.trim()) return item.phone.trim()
  const order = orders.find((entry) => entry.id === item.orderId)
  if (!order) return ''
  const seller = users.find((user) => user.role === 'vendedor' && namesMatch(user.sellerName, order.seller))
  const phone = (seller as { phone?: string } | undefined)?.phone
  return phone?.trim() ?? ''
}

export function NotificationBell() {
  const { user, logout } = useAuth()
  const { orders } = useOrders()
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState<AppNotification[]>([])
  const [users, setUsers] = useState<Session[]>([])
  const [open, setOpen] = useState(false)
  const [panelTop, setPanelTop] = useState<number | null>(null)
  const [narrow, setNarrow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [sending, setSending] = useState('')
  const [toastItems, setToastItems] = useState<AppNotification[] | null>(null)
  const canSend = user?.role === 'encargado_deposito' || user?.role === 'admin'
  const userId = user?.id

  useEffect(() => {
    let cancelled = false

    async function load() {
      const result = await listNotifications()
      if (cancelled) return
      setLoading(false)
      if (!result.ok) {
        if (result.status === 401) logout()
        else setError(result.status === 0 ? 'No se pudo conectar con el servidor' : result.message)
        return
      }
      if (!Array.isArray(result.data) || !result.data.every(isNotification)) {
        setError('No se pudieron leer los avisos.')
        return
      }
      setError('')
      setItems(result.data)
      if (!userId) return
      const seen = new Set(loadSeenIds(userId))
      const fresh = result.data.filter(
        (item) => item.channel === 'app' && !item.read && !seen.has(item.id),
      )
      if (fresh.length === 0) return
      rememberSeenIds(
        userId,
        fresh.map((item) => item.id),
      )
      setToastItems(fresh)
    }

    void load()
    const timer = window.setInterval(() => void load(), 30000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [logout, attempt, userId])

  useEffect(() => {
    if (!canSend) return
    let cancelled = false
    void listUsers().then((result) => {
      if (cancelled || !result.ok || !Array.isArray(result.data)) return
      setUsers(result.data.filter(isSession))
    })
    return () => {
      cancelled = true
    }
  }, [canSend])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1024px)')
    function syncNarrow() {
      setNarrow(media.matches)
    }
    syncNarrow()
    media.addEventListener('change', syncNarrow)
    return () => media.removeEventListener('change', syncNarrow)
  }, [])

  useEffect(() => {
    if (!open || !narrow) return
    function place() {
      const root = rootRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const topbar = document.querySelector('.topbar')
      const minTop = topbar instanceof HTMLElement ? topbar.getBoundingClientRect().bottom + 8 : 8
      setPanelTop(Math.max(Math.round(rect.bottom + 8), Math.round(minTop)))
    }
    const frame = window.requestAnimationFrame(place)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, narrow])

  const appItems = items.filter((item) => item.channel === 'app')
  const whatsappItems = canSend
    ? items.filter((item) => item.channel === 'whatsapp' && item.status === 'pendiente')
    : []
  const unread = appItems.filter((item) => !item.read).length
  const pendingWhatsapp = whatsappItems.length
  const hasPanelContent = appItems.length > 0 || pendingWhatsapp > 0

  async function markRead(id: string) {
    const current = items.find((item) => item.id === id)
    if (!current || current.read) return true
    setItems((list) => list.map((item) => (item.id === id ? { ...item, read: true } : item)))
    const result = await markNotificationRead(id)
    if (!result.ok) {
      setItems((list) => list.map((item) => (item.id === id ? { ...item, read: false } : item)))
      if (result.status === 401) logout()
      else await showError(result.message)
      return false
    }
    return true
  }

  async function markAllRead() {
    const unreadIds = appItems.filter((item) => !item.read).map((item) => item.id)
    if (unreadIds.length === 0) return
    setItems((current) =>
      current.map((item) =>
        item.channel === 'app' && !item.read ? { ...item, read: true } : item,
      ),
    )
    const results = await Promise.allSettled(unreadIds.map((id) => markNotificationRead(id)))
    const failedIds: string[] = []
    let unauthorized = false
    let failMessage = 'No se pudieron marcar todos como leídos.'
    results.forEach((result, index) => {
      const id = unreadIds[index]
      if (result.status === 'rejected') {
        failedIds.push(id)
        return
      }
      if (result.value.ok) return
      failedIds.push(id)
      if (result.value.status === 401) unauthorized = true
      else if (result.value.message) failMessage = result.value.message
    })
    if (failedIds.length === 0) return
    setItems((current) =>
      current.map((item) =>
        failedIds.includes(item.id) ? { ...item, read: false } : item,
      ),
    )
    if (unauthorized) logout()
    else await showError(failMessage)
  }

  async function openAppNotification(item: AppNotification) {
    setOpen(false)
    setToastItems(null)
    if (!item.read) void markRead(item.id)
    if (item.claimId) {
      navigate(`/post-venta?reclamo=${encodeURIComponent(item.claimId)}`)
      return
    }
    if (item.orderId) navigate(`/pedidos/${encodeURIComponent(item.orderId)}`)
  }

  const closeToast = useCallback(() => {
    setToastItems(null)
  }, [])

  function onToastAction() {
    if (!toastItems || toastItems.length === 0) return
    if (toastItems.length === 1) {
      void openAppNotification(toastItems[0])
      return
    }
    setToastItems(null)
    setOpen(true)
  }

  async function sendWhatsapp(item: AppNotification) {
    const phone = sellerPhone(item, orders, users)
    const url = whatsappLink(phone, item.text)
    if (!url || sending) return

    const holder: { popup: Window | null } = { popup: null }
    const openBlank = () => {
      if (holder.popup && !holder.popup.closed) return holder.popup
      holder.popup = window.open('about:blank')
      if (holder.popup) holder.popup.opener = null
      return holder.popup
    }
    const accepted = await confirm('Enviar por WhatsApp', 'El aviso queda marcado como enviado.', {
      didOpen: (element) => {
        element.querySelector('.swal2-confirm')?.addEventListener('click', () => openBlank(), true)
      },
      preConfirm: () => openBlank(),
    })
    if (!accepted) {
      if (holder.popup && !holder.popup.closed) holder.popup.close()
      return
    }

    const opened = holder.popup && !holder.popup.closed ? holder.popup : null
    setSending(item.id)
    const result = await markNotificationSent(item.id)
    setSending('')
    if (!result.ok) {
      if (opened && !opened.closed) opened.close()
      if (result.status === 401) logout()
      else if (result.status === 400) {
        setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status: 'enviado' } : entry)))
        await showError('Otro encargado ya lo envió')
      } else await showError(result.message)
      return
    }
    setItems((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, status: 'enviado' } : entry)),
    )
    setOpen(false)
    if (!opened || opened.closed) {
      window.location.assign(url)
      return
    }
    opened.location.assign(url)
    await success('Aviso enviado')
  }

  return (
    <div className="relative" ref={rootRef}>
      {toastItems && toastItems.length > 0 && (
        <NotificationToast
          key={toastItems.map((item) => item.id).join(',')}
          text={
            toastItems.length === 1
              ? toastItems[0].text
              : `Tenés ${toastItems.length} notificaciones nuevas`
          }
          actionLabel={toastItems.length === 1 ? 'Ver notificación' : 'Ver'}
          onAction={onToastAction}
          onClose={closeToast}
        />
      )}
      <button
        type="button"
        className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-surface"
        aria-label={
          unread > 0
            ? `Avisos, ${unread} sin leer`
            : pendingWhatsapp > 0
              ? `Avisos, ${pendingWhatsapp} por enviar por WhatsApp`
              : 'Avisos'
        }
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
          <path
            d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6zM10 18a2 2 0 0 0 4 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-lumi-danger px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
        {pendingWhatsapp > 0 && (
          <span
            className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full bg-lumi-muted"
            aria-hidden="true"
          />
        )}
      </button>
      {open && (
        <div
          className={
            narrow
              ? 'fixed inset-x-4 z-50 flex max-h-[70vh] w-auto flex-col rounded-2xl border border-lumi-line bg-surface p-3 shadow-md'
              : 'absolute right-0 top-full z-30 mt-2 flex w-80 flex-col rounded-2xl border border-lumi-line bg-surface p-3 shadow-md'
          }
          style={open && narrow && panelTop !== null ? { top: panelTop } : undefined}
        >
          <div className="flex shrink-0 items-center justify-between gap-2">
            <p className="text-sm font-semibold">Avisos</p>
            {unread > 0 && (
              <button
                type="button"
                className="text-xs text-lumi-muted underline hover:text-lumi-ink"
                onClick={() => void markAllRead()}
              >
                Marcar todos leídos
              </button>
            )}
          </div>
          {loading && items.length === 0 && <Spinner compact label="Cargando avisos…" />}
          {error && <ServerDown message={error} onRetry={() => {
            setError('')
            setLoading(true)
            setAttempt((current) => current + 1)
          }} />}
          {!loading && !error && !hasPanelContent ? (
            <p className="mt-3 text-sm text-lumi-muted">No hay avisos.</p>
          ) : hasPanelContent ? (
            <div className="mt-2 flex min-h-0 flex-1 flex-col gap-3 overflow-auto sm:max-h-80">
              {appItems.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {appItems.map((item) => (
                    <li key={item.id} className="rounded-xl bg-surface-muted px-3 py-2 text-sm">
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => void openAppNotification(item)}
                      >
                        <p className={item.read ? 'text-lumi-muted' : 'font-medium'}>{item.text}</p>
                        <p className="mt-1 text-xs text-lumi-muted">{formatWhen(item.createdAt)}</p>
                      </button>
                      {!item.read && (
                        <div className="mt-1 flex justify-end">
                          <button
                            type="button"
                            className="text-xs text-lumi-muted underline"
                            onClick={() => void markRead(item.id)}
                          >
                            Marcar leído
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {pendingWhatsapp > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-lumi-muted">
                    Por enviar por WhatsApp ({pendingWhatsapp})
                  </p>
                  <ul className="flex flex-col gap-2">
                    {whatsappItems.map((item) => {
                      const phone = sellerPhone(item, orders, users)
                      const canOpenWa = Boolean(phone && whatsappLink(phone, item.text))
                      return (
                        <li key={item.id} className="rounded-xl bg-surface-muted px-3 py-2 text-sm">
                          <p className="font-medium">{item.text}</p>
                          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-lumi-muted">
                            <span>{formatWhen(item.createdAt)}</span>
                          </div>
                          {canOpenWa ? (
                            <button
                              type="button"
                              className="mt-2 w-full rounded-lg bg-lumi-yellow px-3 py-2 text-sm font-semibold text-lumi-yellow-ink disabled:opacity-50"
                              disabled={sending === item.id}
                              onClick={() => void sendWhatsapp(item)}
                            >
                              Enviar por WhatsApp
                            </button>
                          ) : (
                            <p className="mt-2 text-xs text-lumi-muted">
                              <button
                                type="button"
                                className="w-full rounded-lg bg-lumi-line px-3 py-2 font-semibold"
                                disabled
                              >
                                Enviar por WhatsApp
                              </button>
                              Sin celular cargado
                            </p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
