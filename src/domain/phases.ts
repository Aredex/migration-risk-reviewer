import type { MigrationStatement, RiskFinding, RolloutPhase, StatementKind } from './types'
import { RULE_IDS } from './findings'

/**
 * Propuesta de fases expand-contract (P15-R3). Cada sentencia reconocida se
 * asigna a un bucket determinista según su tipo; las sentencias que
 * requieren backfill (NOT NULL sin default, validación de restricciones)
 * generan además una fase intermedia de backfill con guía (no es DDL: la
 * migración de datos ocurre en la aplicación, fuera de este análisis).
 */
const EXPAND_KINDS = new Set<StatementKind>([
  'create-table',
  'create-type',
  'create-index-concurrently',
  'alter-table-add-column',
  'alter-table-set-default',
  'alter-table-drop-not-null',
  'alter-type-add-value',
])

const CONTRACT_KINDS = new Set<StatementKind>([
  'alter-table-drop-column',
  'alter-table-set-not-null',
  'alter-table-validate-constraint',
  'alter-table-drop-default',
  'alter-table-rename-column',
  'alter-table-rename-table',
  'drop-index',
  'drop-index-concurrently',
  'drop-table',
  'truncate',
])

const BACKFILL_TRIGGER_RULES = new Set<string>([
  RULE_IDS.ADD_COLUMN_NOT_NULL_NO_DEFAULT,
  RULE_IDS.SET_NOT_NULL_FULL_SCAN,
  RULE_IDS.ADD_CONSTRAINT_NOT_VALID_OK,
  RULE_IDS.ALTER_COLUMN_TYPE_REWRITE,
])

function bucketOf(kind: StatementKind): 'expand' | 'contract' | 'review' {
  if (EXPAND_KINDS.has(kind)) return 'expand'
  if (CONTRACT_KINDS.has(kind)) return 'contract'
  // create-index (bloqueante), alter-table-alter-type, add-constraint sin
  // NOT VALID y alter-type-other quedan fuera de los dos buckets aditivos y
  // se agrupan para revisión manual explícita: no son "aditivos" seguros ni
  // encajan limpiamente como paso final de contract.
  return 'review'
}

export function buildPhases(
  statements: readonly MigrationStatement[],
  findings: readonly RiskFinding[],
): RolloutPhase[] {
  const expandIds: string[] = []
  const contractIds: string[] = []
  const reviewIds: string[] = []

  for (const statement of statements) {
    const bucket = bucketOf(statement.kind)
    if (bucket === 'expand') expandIds.push(statement.id)
    else if (bucket === 'contract') contractIds.push(statement.id)
    else reviewIds.push(statement.id)
  }

  const backfillIds = new Set(
    findings
      .filter((finding) => finding.statementId && BACKFILL_TRIGGER_RULES.has(finding.ruleId))
      .map((finding) => finding.statementId as string),
  )

  const phases: RolloutPhase[] = []
  let order = 1

  if (expandIds.length > 0) {
    phases.push({
      id: 'phase_expand',
      kind: 'expand',
      order: order++,
      name: 'Fase 1 — Expand (aditivo)',
      description:
        'Cambios aditivos que coexisten con la versión actual de la aplicación: nuevas tablas, columnas nullable, índices construidos con CONCURRENTLY, nuevos valores de enum.',
      rationale:
        'Estos cambios no eliminan ni renombran nada que el código en producción esté usando, así que pueden desplegarse antes de tocar la aplicación.',
      statementIds: expandIds,
    })
  }

  if (backfillIds.size > 0) {
    phases.push({
      id: 'phase_backfill',
      kind: 'backfill',
      order: order++,
      name: 'Fase 2 — Backfill (fuera de esta migración)',
      description:
        'Antes de continuar, rellena o valida los datos existentes para las columnas/restricciones señaladas con un job o UPDATE por lotes desde la aplicación (no es DDL, por eso no aparece como sentencia SQL en el plan).',
      rationale:
        'Aplicar NOT NULL o validar una restricción sobre filas que aún no cumplen la condición fallaría o forzaría un escaneo bloqueante; primero hay que garantizar que los datos ya cumplen la regla.',
      statementIds: [...backfillIds],
    })
  }

  if (reviewIds.length > 0) {
    phases.push({
      id: 'phase_review',
      kind: 'manual-review',
      order: order++,
      name: 'Revisión manual antes de programar',
      description:
        'Cambios que reescriben la tabla, bloquean escrituras durante su ejecución o no encajan de forma segura en un bucket aditivo/de limpieza automático (CREATE INDEX sin CONCURRENTLY, ALTER COLUMN TYPE, restricciones sin NOT VALID, ALTER TYPE distinto de ADD VALUE).',
      rationale:
        'Requieren decidir una ventana de mantenimiento, una reescritura por lotes o una validación manual antes de asignarlos a expand o contract.',
      statementIds: reviewIds,
    })
  }

  if (contractIds.length > 0) {
    phases.push({
      id: 'phase_contract',
      kind: 'contract',
      order: order++,
      name: 'Fase 3 — Contract (limpieza)',
      description:
        'Cambios que eliminan compatibilidad con la versión anterior: DROP COLUMN, SET NOT NULL, VALIDATE CONSTRAINT, renombrados, DROP INDEX/TABLE, TRUNCATE.',
      rationale:
        'Solo son seguros después de que todas las instancias de la aplicación desplegadas dejaron de depender del esquema anterior (y, si aplica, el backfill de la fase 2 terminó).',
      statementIds: contractIds,
    })
  }

  return phases
}
