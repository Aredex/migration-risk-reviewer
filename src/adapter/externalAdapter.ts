/**
 * Adaptador opcional a un motor real de análisis (p. ej. un `EXPLAIN` contra
 * una base de datos real o un servicio de terceros). Queda **desactivado por
 * defecto** (kill switch), como exige el playbook de portafolio: "si tu
 * proyecto tiene un adaptador opcional a un servicio real, dicho adaptador
 * debe quedar desactivado por defecto". No hay configuración en tiempo de
 * ejecución para reactivarlo desde la interfaz: activarlo requeriría un
 * cambio de código y un despliegue explícito.
 */
export const ADAPTER_ENABLED = false as const

export interface AdapterResult {
  readonly available: false
  readonly reason: string
}

/** Siempre indica que el adaptador real no está disponible (kill switch
 * apagado). Nunca realiza solicitudes de red: el modo determinista con
 * reglas estáticas es el único camino que se demuestra en producción. */
export function checkExternalAdapter(): AdapterResult {
  return {
    available: false,
    reason:
      'El adaptador a un motor de análisis real (p. ej. EXPLAIN contra una base de datos) está desactivado por diseño en esta demo. Se usa el motor de reglas determinista.',
  }
}
