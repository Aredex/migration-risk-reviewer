import type { FindingSeverity } from '../contracts/types'
import type { LockLevel, RiskFinding } from './types'

/** Identificadores de regla estables (07-contratos-interfaces.md: los
 * hallazgos exponen `ruleId`). Cubren las cuatro capacidades P0
 * (14-trazabilidad.md): analizar operaciones DDL, clasificar locks y
 * reescrituras, proponer expand-contract y generar rollback/verificación. */
export const RULE_IDS = {
  CREATE_TABLE_OK: 'create-table-ok',
  CREATE_TYPE_OK: 'create-type-ok',
  ALTER_TYPE_ADD_VALUE_RISK: 'alter-type-add-value-risk',
  ALTER_TYPE_OTHER_RISK: 'alter-type-other-risk',
  ADD_COLUMN_OK: 'add-column-ok',
  ADD_COLUMN_NOT_NULL_NO_DEFAULT: 'add-column-not-null-no-default',
  ADD_COLUMN_VOLATILE_DEFAULT: 'add-column-volatile-default',
  DROP_COLUMN_BREAKS_COMPAT: 'drop-column-breaks-compat',
  ALTER_COLUMN_TYPE_REWRITE: 'alter-column-type-rewrite',
  SET_NOT_NULL_FULL_SCAN: 'set-not-null-full-scan',
  DROP_NOT_NULL_OK: 'drop-not-null-ok',
  SET_DEFAULT_OK: 'set-default-ok',
  DROP_DEFAULT_OK: 'drop-default-ok',
  ADD_CONSTRAINT_VALIDATION_LOCK: 'add-constraint-validation-lock',
  ADD_CONSTRAINT_NOT_VALID_OK: 'add-constraint-not-valid-ok',
  VALIDATE_CONSTRAINT_OK: 'validate-constraint-ok',
  RENAME_BREAKS_COMPAT: 'rename-breaks-compat',
  CREATE_INDEX_BLOCKING: 'create-index-blocking',
  CREATE_INDEX_CONCURRENTLY_OK: 'create-index-concurrently-ok',
  DROP_INDEX_BLOCKING: 'drop-index-blocking',
  DROP_INDEX_CONCURRENTLY_OK: 'drop-index-concurrently-ok',
  TRUNCATE_DATA_LOSS: 'truncate-data-loss',
  DROP_TABLE_DATA_LOSS: 'drop-table-data-loss',
  ALTER_TABLE_OTHER_UNRECOGNIZED: 'alter-table-other-unrecognized',
  MULTI_ACTION_PARTIAL: 'multi-action-partial-analysis',
  UNKNOWN_STATEMENT: 'unknown-statement',
  ADAPTER_DISABLED: 'adapter-disabled',
  ERROR_INPUT_INVALID: 'error-input-invalid',
  ERROR_LIMIT_EXCEEDED: 'error-limit-exceeded',
  ERROR_RUN_CANCELLED: 'error-run-cancelled',
  ERROR_DEPENDENCY_UNAVAILABLE: 'error-dependency-unavailable',
  ERROR_INTERNAL: 'error-internal',
} as const

export function makeFinding(
  ruleId: string,
  severity: FindingSeverity,
  message: string,
  options?: {
    readonly statementId?: string | null
    readonly evidencePath?: string
    readonly suggestion?: string
    readonly lockLevel?: LockLevel | null
    readonly rewritesTable?: boolean
  },
): RiskFinding {
  return {
    ruleId,
    severity,
    message,
    ...(options?.evidencePath !== undefined ? { evidencePath: options.evidencePath } : {}),
    ...(options?.suggestion !== undefined ? { suggestion: options.suggestion } : {}),
    statementId: options?.statementId ?? null,
    lockLevel: options?.lockLevel ?? null,
    rewritesTable: options?.rewritesTable ?? false,
  }
}
