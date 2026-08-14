import type { EngineOutput, Finding, FindingSeverity, RunStatus } from '../contracts/types'

/**
 * Modelo de dominio (06-modelo-datos.md): SchemaSnapshot, MigrationStatement,
 * RiskFinding, RolloutPhase, RollbackStep. Estos tipos son más ricos que el
 * `EngineOutput` genérico compartido por los 29 proyectos del portafolio
 * (contracts/output.schema.json): la interfaz que consume la UI es
 * `MigrationAnalysis`; `domain/toEngineOutput.ts` proyecta el subconjunto
 * compatible con el contrato genérico para exportación y pruebas de
 * contrato (07-contratos-interfaces.md: "Interfaces de dominio").
 */

export type StatementKind =
  | 'create-table'
  | 'alter-table-add-column'
  | 'alter-table-drop-column'
  | 'alter-table-alter-type'
  | 'alter-table-set-not-null'
  | 'alter-table-drop-not-null'
  | 'alter-table-set-default'
  | 'alter-table-drop-default'
  | 'alter-table-add-constraint'
  | 'alter-table-validate-constraint'
  | 'alter-table-rename-column'
  | 'alter-table-rename-table'
  | 'alter-table-other'
  | 'create-index'
  | 'create-index-concurrently'
  | 'drop-index'
  | 'drop-index-concurrently'
  | 'create-type'
  | 'alter-type-add-value'
  | 'alter-type-other'
  | 'drop-table'
  | 'truncate'
  | 'unknown'

/** Nivel de lock PostgreSQL aproximado que adquiere la sentencia sobre la
 * tabla afectada (de menor a mayor exclusividad). Ver
 * https://www.postgresql.org/docs/current/explicit-locking.html */
export type LockLevel =
  | 'none'
  | 'row-exclusive'
  | 'share-update-exclusive'
  | 'share'
  | 'share-row-exclusive'
  | 'access-exclusive'

export interface StatementFlags {
  readonly hasConcurrently: boolean
  readonly hasNotValid: boolean
  readonly hasIfExists: boolean
  readonly hasIfNotExists: boolean
  readonly hasVolatileDefault: boolean
  /** El ALTER TABLE original combina varias acciones separadas por coma; solo
   * se clasificó la primera. Ver `parser.ts` y el hallazgo `MULTI_ACTION_PARTIAL`. */
  readonly hasMultipleActions: boolean
}

export interface MigrationStatement {
  readonly id: string
  readonly index: number
  readonly raw: string
  readonly kind: StatementKind
  readonly table: string | null
  readonly column: string | null
  readonly indexName: string | null
  readonly constraintName: string | null
  readonly newName: string | null
  readonly flags: StatementFlags
  readonly lockLevel: LockLevel
  readonly rewritesTable: boolean
  readonly blocksWrites: boolean
}

export interface RiskFinding extends Finding {
  readonly statementId: string | null
  readonly lockLevel: LockLevel | null
  readonly rewritesTable: boolean
}

export type RolloutPhaseKind = 'expand' | 'backfill' | 'contract' | 'manual-review'

export interface RolloutPhase {
  readonly id: string
  readonly kind: RolloutPhaseKind
  readonly order: number
  readonly name: string
  readonly description: string
  readonly rationale: string
  readonly statementIds: readonly string[]
}

export interface RollbackStep {
  readonly id: string
  readonly phaseId: string
  readonly order: number
  readonly description: string
  readonly sql: string
  readonly reversible: boolean
}

export interface VerificationStep {
  readonly id: string
  readonly phaseId: string
  readonly description: string
  readonly query: string
}

export interface SchemaSnapshot {
  readonly id: string
  readonly source: 'migration' | 'compare'
  readonly createdAt: string
  readonly statementCount: number
}

export interface MigrationAnalysis {
  readonly schemaVersion: '1.0.0'
  readonly runId: string
  readonly scenarioId: string
  readonly status: RunStatus
  readonly summary: string
  readonly rulesVersion: string
  readonly snapshot: SchemaSnapshot
  readonly statements: readonly MigrationStatement[]
  readonly findings: readonly RiskFinding[]
  readonly phases: readonly RolloutPhase[]
  readonly rollbackSteps: readonly RollbackStep[]
  readonly verificationSteps: readonly VerificationStep[]
  readonly truncated: boolean
}

export function countBySeverity(
  findings: readonly { readonly severity: FindingSeverity }[],
): Record<FindingSeverity, number> {
  const counts: Record<FindingSeverity, number> = { info: 0, warning: 0, error: 0, critical: 0 }
  for (const finding of findings) counts[finding.severity] += 1
  return counts
}

export type { EngineOutput }
