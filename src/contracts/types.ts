/**
 * Tipos TypeScript que reflejan exactamente contracts/input.schema.json y
 * contracts/output.schema.json (fuente de verdad). Ver ./validateInput.ts y
 * ./validateOutput.ts para los validadores manuales equivalentes.
 */

export type SchemaVersion = '1.0.0'

export interface EngineInput {
  readonly schemaVersion: SchemaVersion
  readonly scenarioId: string
  readonly payload: Record<string, unknown>
  readonly options: {
    readonly deterministic: boolean
  }
}

export type RunStatus = 'completed' | 'partial' | 'failed' | 'cancelled'

export type FindingSeverity = 'info' | 'warning' | 'error' | 'critical'

export interface Finding {
  readonly ruleId: string
  readonly severity: FindingSeverity
  readonly message: string
  readonly evidencePath?: string
  readonly suggestion?: string
}

export interface EngineOutput {
  readonly schemaVersion: SchemaVersion
  readonly runId: string
  readonly status: RunStatus
  readonly summary: string
  readonly findings: readonly Finding[]
  readonly evidence: {
    readonly rulesVersion: string
    readonly scenarioId: string
  }
}

/** Códigos de error tipados definidos en 07-contratos-interfaces.md */
export type ErrorCode =
  'INPUT_INVALID' | 'LIMIT_EXCEEDED' | 'RUN_CANCELLED' | 'DEPENDENCY_UNAVAILABLE' | 'INTERNAL_ERROR'

export interface TypedError {
  readonly code: ErrorCode
  readonly message: string
  /** Rutas JSON afectadas, cuando aplica (p. ej. errores de validación de entrada). */
  readonly paths?: readonly string[]
}
