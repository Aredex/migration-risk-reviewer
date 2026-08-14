/**
 * Descarga un Blob como archivo adjunto. Esta app es 100% estática (sin
 * servidor propio), así que no puede fijar la cabecera HTTP
 * `Content-Disposition: attachment`; el atributo `download` del elemento
 * `<a>` es el equivalente del lado del cliente y produce el mismo
 * comportamiento (el navegador ofrece guardar el archivo en vez de
 * navegarlo). Documentado también en el README como límite honesto.
 */
export function downloadBlob(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  } finally {
    // Revocar tras un tick: algunos navegadores necesitan que la URL siga
    // viva durante el propio evento de click.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
