import Swal, { type SweetAlertOptions } from 'sweetalert2'

type ConfirmOptions = {
  peligro?: boolean
  confirmText?: string
  cancelText?: string
  allowOutsideClick?: boolean
  allowEscapeKey?: boolean
  /** Si es true, solo el botón cancel cuenta como no confirmado; Escape/afuera = null. */
  cancelOnly?: boolean
  preConfirm?: SweetAlertOptions['preConfirm']
  didOpen?: SweetAlertOptions['didOpen']
}

/** Confirmación en español, con el amarillo de la app o rojo si es destructiva. */
export async function confirm(
  titulo: string,
  texto: string,
  options?: ConfirmOptions,
): Promise<boolean | null> {
  const peligro = options?.peligro === true
  const result = await Swal.fire({
    title: titulo,
    text: texto,
    showCancelButton: true,
    confirmButtonText: options?.confirmText ?? (peligro ? 'Sí, continuar' : 'Confirmar'),
    cancelButtonText: options?.cancelText ?? 'Cancelar',
    focusCancel: peligro,
    reverseButtons: true,
    buttonsStyling: false,
    ...(options?.allowOutsideClick !== undefined && {
      allowOutsideClick: options.allowOutsideClick,
    }),
    ...(options?.allowEscapeKey !== undefined && {
      allowEscapeKey: options.allowEscapeKey,
    }),
    customClass: {
      popup: 'lumi-swal',
      title: 'lumi-swal-title',
      htmlContainer: 'lumi-swal-text',
      confirmButton: peligro ? 'lumi-swal-danger' : 'lumi-swal-confirm',
      cancelButton: 'lumi-swal-cancel',
      actions: 'lumi-swal-actions',
    },
    preConfirm: options?.preConfirm,
    didOpen: options?.didOpen,
  })
  if (result.isConfirmed) return true
  if (options?.cancelOnly) {
    return result.dismiss === Swal.DismissReason.cancel ? false : null
  }
  return false
}

/** Motivo obligatorio (mínimo 5 caracteres) para volver un estado atrás. */
export async function askReason(titulo: string, texto: string): Promise<string | null> {
  const result = await Swal.fire({
    title: titulo,
    text: texto,
    input: 'textarea',
    inputPlaceholder: 'Motivo (mínimo 5 caracteres)',
    showCancelButton: true,
    confirmButtonText: 'Confirmar',
    cancelButtonText: 'Cancelar',
    reverseButtons: true,
    buttonsStyling: false,
    customClass: {
      popup: 'lumi-swal',
      title: 'lumi-swal-title',
      htmlContainer: 'lumi-swal-text',
      confirmButton: 'lumi-swal-confirm',
      cancelButton: 'lumi-swal-cancel',
      actions: 'lumi-swal-actions',
    },
    inputValidator: (value) => {
      if (!value || value.trim().length < 5) return 'Ingresá un motivo de al menos 5 caracteres.'
      return null
    },
  })
  if (!result.isConfirmed || typeof result.value !== 'string') return null
  return result.value.trim()
}

/** Cantidad de bultos (entero ≥ 1). */
export async function askPackages(titulo: string, texto: string): Promise<number | null> {
  const result = await Swal.fire({
    title: titulo,
    text: texto,
    input: 'number',
    inputAttributes: { min: '1', step: '1' },
    inputPlaceholder: 'Bultos',
    showCancelButton: true,
    confirmButtonText: 'Confirmar',
    cancelButtonText: 'Cancelar',
    reverseButtons: true,
    buttonsStyling: false,
    customClass: {
      popup: 'lumi-swal',
      title: 'lumi-swal-title',
      htmlContainer: 'lumi-swal-text',
      confirmButton: 'lumi-swal-confirm',
      cancelButton: 'lumi-swal-cancel',
      actions: 'lumi-swal-actions',
    },
    inputValidator: (value) => {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1) return 'Ingresá una cantidad entera de bultos (1 o más).'
      return null
    },
  })
  if (!result.isConfirmed) return null
  const n = Number(result.value)
  return Number.isInteger(n) && n >= 1 ? n : null
}

export type AssignDriverChoice = {
  driverId: string
  timeWindow: string
  override: boolean
}

/** Chofer, franja y override de cupo para asignar desde el detalle. */
export async function askAssignDriver(options: {
  drivers: { id: string; name: string }[]
  timeWindows: string[]
  currentDriverId?: string
  currentTimeWindow?: string
  allowOverride: boolean
}): Promise<AssignDriverChoice | null> {
  const drivers = options.drivers
  const windows = options.timeWindows
  if (drivers.length === 0) {
    await error('No hay choferes activos para asignar.')
    return null
  }
  if (windows.length === 0) {
    await error('No hay franjas horarias configuradas.')
    return null
  }
  const driverOptions = drivers
    .map((driver) => {
      const selected = driver.id === options.currentDriverId ? ' selected' : ''
      return `<option value="${escapeHtml(driver.id)}"${selected}>${escapeHtml(driver.name)}</option>`
    })
    .join('')
  const windowOptions = windows
    .map((window) => {
      const selected = window === options.currentTimeWindow ? ' selected' : ''
      return `<option value="${escapeHtml(window)}"${selected}>${escapeHtml(window)}</option>`
    })
    .join('')
  const overrideBlock = options.allowOverride
    ? `<label class="lumi-swal-check">
        <input type="checkbox" id="lumi-assign-override" />
        Autorizar si la franja está llena
      </label>`
    : ''
  const result = await Swal.fire({
    title: 'Asignar chofer',
    html: `<div class="lumi-swal-form">
      <label class="lumi-swal-field">
        <span>Chofer</span>
        <select id="lumi-assign-driver" class="lumi-swal-select">
          <option value="">Elegí un chofer</option>
          ${driverOptions}
        </select>
      </label>
      <label class="lumi-swal-field">
        <span>Franja</span>
        <select id="lumi-assign-window" class="lumi-swal-select">
          <option value="">Elegí una franja</option>
          ${windowOptions}
        </select>
      </label>
      ${overrideBlock}
    </div>`,
    showCancelButton: true,
    confirmButtonText: 'Confirmar',
    cancelButtonText: 'Cancelar',
    reverseButtons: true,
    buttonsStyling: false,
    focusConfirm: false,
    customClass: {
      popup: 'lumi-swal',
      title: 'lumi-swal-title',
      htmlContainer: 'lumi-swal-text',
      confirmButton: 'lumi-swal-confirm',
      cancelButton: 'lumi-swal-cancel',
      actions: 'lumi-swal-actions',
    },
    preConfirm: () => {
      const driver = document.getElementById('lumi-assign-driver')
      const window = document.getElementById('lumi-assign-window')
      const override = document.getElementById('lumi-assign-override')
      const driverId = driver instanceof HTMLSelectElement ? driver.value.trim() : ''
      const timeWindow = window instanceof HTMLSelectElement ? window.value.trim() : ''
      if (!driverId) {
        Swal.showValidationMessage('Elegí un chofer.')
        return false
      }
      if (!timeWindow) {
        Swal.showValidationMessage('Elegí una franja.')
        return false
      }
      return {
        driverId,
        timeWindow,
        override: override instanceof HTMLInputElement ? override.checked : false,
      }
    },
  })
  if (!result.isConfirmed || !result.value || typeof result.value !== 'object') return null
  const value = result.value as AssignDriverChoice
  if (typeof value.driverId !== 'string' || typeof value.timeWindow !== 'string') return null
  return {
    driverId: value.driverId,
    timeWindow: value.timeWindow,
    override: value.override === true,
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type PickupReceiver = {
  name: string
  dni?: string
}

/** Nombre obligatorio y DNI opcional al marcar un retiro. */
export async function askPickupReceiver(titulo: string, texto: string): Promise<PickupReceiver | null> {
  const result = await Swal.fire({
    title: titulo,
    html: `<p class="lumi-swal-text">${escapeHtml(texto)}</p>
      <div class="lumi-swal-form">
        <label class="lumi-swal-field">
          <span>Retirado por *</span>
          <input id="lumi-pickup-name" class="lumi-swal-input" type="text" autocomplete="name" />
        </label>
        <label class="lumi-swal-field">
          <span>DNI (opcional)</span>
          <input id="lumi-pickup-dni" class="lumi-swal-input" type="text" autocomplete="off" />
        </label>
      </div>`,
    showCancelButton: true,
    confirmButtonText: 'Confirmar',
    cancelButtonText: 'Cancelar',
    reverseButtons: true,
    buttonsStyling: false,
    focusConfirm: false,
    customClass: {
      popup: 'lumi-swal',
      title: 'lumi-swal-title',
      htmlContainer: 'lumi-swal-text',
      confirmButton: 'lumi-swal-confirm',
      cancelButton: 'lumi-swal-cancel',
      actions: 'lumi-swal-actions',
    },
    didOpen: () => {
      const input = document.getElementById('lumi-pickup-name')
      if (input instanceof HTMLInputElement) input.focus()
    },
    preConfirm: () => {
      const nameInput = document.getElementById('lumi-pickup-name')
      const dniInput = document.getElementById('lumi-pickup-dni')
      const name = nameInput instanceof HTMLInputElement ? nameInput.value.trim() : ''
      const dni = dniInput instanceof HTMLInputElement ? dniInput.value.trim() : ''
      if (!name) {
        Swal.showValidationMessage('Falta quién retira')
        return false
      }
      if (name.length > 120) {
        Swal.showValidationMessage('El nombre de quien retira es demasiado largo.')
        return false
      }
      if (dni.length > 20) {
        Swal.showValidationMessage('El DNI es demasiado largo.')
        return false
      }
      return { name, dni: dni || undefined }
    },
  })
  if (!result.isConfirmed || !result.value || typeof result.value !== 'object') return null
  const value = result.value as PickupReceiver
  if (typeof value.name !== 'string' || !value.name.trim()) return null
  return {
    name: value.name.trim(),
    dni: typeof value.dni === 'string' && value.dni.trim() ? value.dni.trim() : undefined,
  }
}

/** Tracking opcional (hasta 80 caracteres). Cancelar aborta; vacío es válido. */
export async function askTracking(titulo: string, texto: string): Promise<string | null | undefined> {
  const result = await Swal.fire({
    title: titulo,
    text: texto,
    input: 'text',
    inputPlaceholder: 'Tracking (opcional)',
    showCancelButton: true,
    confirmButtonText: 'Confirmar',
    cancelButtonText: 'Cancelar',
    reverseButtons: true,
    buttonsStyling: false,
    customClass: {
      popup: 'lumi-swal',
      title: 'lumi-swal-title',
      htmlContainer: 'lumi-swal-text',
      confirmButton: 'lumi-swal-confirm',
      cancelButton: 'lumi-swal-cancel',
      actions: 'lumi-swal-actions',
    },
    inputValidator: (value) => {
      if (typeof value === 'string' && value.trim().length > 80) {
        return 'El tracking puede tener hasta 80 caracteres.'
      }
      return null
    },
  })
  if (!result.isConfirmed) return null
  if (typeof result.value !== 'string') return ''
  return result.value.trim()
}

/** Toast corto arriba a la derecha. */
export function success(texto: string) {
  return Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'success',
    title: texto,
    showConfirmButton: false,
    timer: 2000,
    timerProgressBar: true,
    iconColor: '#1d7a3a',
  })
}

/** Muestra un error. El segundo argumento es el detalle (lista o mensaje del server). */
export function error(titulo: string, detalle?: string) {
  const lines = detalle?.split('\n').map((line) => line.trim()).filter(Boolean) ?? []
  const listHtml =
    lines.length > 1
      ? `<ul class="lumi-swal-list">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
      : undefined
  return Swal.fire({
    icon: 'error',
    title: titulo,
    ...(listHtml ? { html: listHtml } : { text: detalle }),
    confirmButtonText: 'Entendido',
    buttonsStyling: false,
    iconColor: '#e25b57',
    customClass: {
      popup: 'lumi-swal',
      title: 'lumi-swal-title',
      htmlContainer: 'lumi-swal-text',
      confirmButton: 'lumi-swal-danger',
      actions: 'lumi-swal-actions',
    },
  })
}
