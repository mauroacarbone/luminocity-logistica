import Swal from 'sweetalert2'

type ConfirmOptions = {
  peligro?: boolean
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
  })
  return result.isConfirmed
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
