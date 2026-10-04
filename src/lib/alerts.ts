import Swal, { type SweetAlertOptions } from 'sweetalert2'

type ConfirmOptions = {
  peligro?: boolean
  preConfirm?: SweetAlertOptions['preConfirm']
  didOpen?: SweetAlertOptions['didOpen']
}

/** Confirmación en español, con el amarillo de la app o rojo si es destructiva. */
export async function confirm(titulo: string, texto: string, options?: ConfirmOptions) {
  const peligro = options?.peligro === true
  const result = await Swal.fire({
    title: titulo,
    text: texto,
    showCancelButton: true,
    confirmButtonText: peligro ? 'Sí, continuar' : 'Confirmar',
    cancelButtonText: 'Cancelar',
    focusCancel: peligro,
    reverseButtons: true,
    buttonsStyling: false,
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
  return result.isConfirmed
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

/** Muestra el mensaje que devolvió el server. */
export function error(texto: string) {
  return Swal.fire({
    icon: 'error',
    title: texto,
    confirmButtonText: 'Entendido',
    buttonsStyling: false,
    iconColor: '#e25b57',
    customClass: {
      popup: 'lumi-swal',
      title: 'lumi-swal-title',
      confirmButton: 'lumi-swal-danger',
      actions: 'lumi-swal-actions',
    },
  })
}
