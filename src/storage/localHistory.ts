import type { MigrationAnalysis } from '../domain/types'

/**
 * Historial local opt-in (06-modelo-datos.md: "la configuración puede
 * guardarse en IndexedDB bajo consentimiento; por defecto la sesión vive en
 * memoria"). Nunca sale del dispositivo: es la única forma de persistencia
 * de este proyecto y requiere consentimiento explícito antes de guardar
 * nada, incluso localmente, porque el análisis puede incluir SQL pegado por
 * el visitante (riesgo "SQL sensible pegado" de 08-seguridad-privacidad.md).
 */

const DB_NAME = 'migration-risk-reviewer'
const STORE_NAME = 'run-history'
const DB_VERSION = 1
const CONSENT_KEY = 'migration-risk-reviewer:history-consent'

export interface HistoryEntry {
  readonly id: string
  readonly savedAt: string
  readonly analysis: MigrationAnalysis
}

export function isHistoryConsentGiven(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === 'true'
  } catch {
    return false
  }
}

export function setHistoryConsent(consent: boolean): void {
  try {
    if (consent) window.localStorage.setItem(CONSENT_KEY, 'true')
    else window.localStorage.removeItem(CONSENT_KEY)
  } catch {
    // Almacenamiento no disponible (modo privado, cuota agotada): se ignora
    // en silencio, la app sigue funcionando solo en memoria.
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible en este entorno.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB.'))
  })
}

export async function saveRunToHistory(analysis: MigrationAnalysis): Promise<void> {
  if (!isHistoryConsentGiven()) return
  try {
    const db = await openDb()
    const entry: HistoryEntry = { id: analysis.runId, savedAt: new Date().toISOString(), analysis }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(entry)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('No se pudo guardar el historial.'))
    })
    db.close()
  } catch {
    // El historial es una comodidad opcional; un fallo aquí nunca debe
    // interrumpir el flujo principal de ejecución.
  }
}

export async function getHistory(): Promise<readonly HistoryEntry[]> {
  try {
    const db = await openDb()
    const entries = await new Promise<HistoryEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).getAll()
      request.onsuccess = () => resolve(request.result as HistoryEntry[])
      request.onerror = () => reject(request.error ?? new Error('No se pudo leer el historial.'))
    })
    db.close()
    return entries.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  } catch {
    return []
  }
}

/** Botón "Eliminar datos locales" (06-modelo-datos.md, 08-seguridad-
 * privacidad.md). Borra el historial de IndexedDB y retira el consentimiento. */
export async function clearLocalData(): Promise<void> {
  setHistoryConsent(false)
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('No se pudo borrar el historial.'))
    })
    db.close()
  } catch {
    // Si IndexedDB no está disponible no hay nada más que borrar.
  }
}
