import type { MigrationStatement, RollbackStep, RolloutPhase, VerificationStep } from './types'

/**
 * Generación de rollback y verificación (P15-R4). Nunca ejecuta SQL: solo
 * produce texto SQL/consultas de referencia para que el equipo las revise y
 * ejecute manualmente. Cuando una operación no es reversible sin pérdida de
 * datos (DROP TABLE, TRUNCATE, DROP COLUMN...) el paso lo indica de forma
 * explícita en vez de inventar una reversión falsa (08-seguridad-privacidad.md:
 * "rollback imposible" está en el threat model).
 */

function quoted(name: string | null): string {
  return name ? `"${name}"` : '"?"'
}

function rollbackForStatement(statement: MigrationStatement): { sql: string; reversible: boolean } {
  switch (statement.kind) {
    case 'create-table':
      return {
        sql: `DROP TABLE IF EXISTS ${quoted(statement.table)};`,
        reversible: true,
      }
    case 'create-type':
      return { sql: `DROP TYPE IF EXISTS ${quoted(statement.table)};`, reversible: true }
    case 'create-index':
    case 'create-index-concurrently':
      return {
        sql: `DROP INDEX ${statement.flags.hasConcurrently ? 'CONCURRENTLY ' : ''}IF EXISTS ${quoted(statement.indexName)};`,
        reversible: true,
      }
    case 'alter-table-add-column':
      return {
        sql: `ALTER TABLE ${quoted(statement.table)} DROP COLUMN IF EXISTS ${quoted(statement.column)}; -- Elimina cualquier dato ya escrito en esta columna.`,
        reversible: true,
      }
    case 'alter-table-set-default':
      return {
        sql: `ALTER TABLE ${quoted(statement.table)} ALTER COLUMN ${quoted(statement.column)} DROP DEFAULT;`,
        reversible: true,
      }
    case 'alter-table-drop-not-null':
      return {
        sql: `ALTER TABLE ${quoted(statement.table)} ALTER COLUMN ${quoted(statement.column)} SET NOT NULL; -- Solo funciona si no se insertaron NULLs mientras la restricción estuvo relajada.`,
        reversible: true,
      }
    case 'alter-type-add-value':
      return {
        sql: `-- No reversible: PostgreSQL no permite eliminar un valor de un enum sin recrear el tipo completo.`,
        reversible: false,
      }
    case 'alter-table-drop-column':
      return {
        sql: `-- No reversible sin restaurar desde backup: DROP COLUMN elimina los datos de la columna de forma permanente.`,
        reversible: false,
      }
    case 'alter-table-set-not-null':
      return {
        sql: `ALTER TABLE ${quoted(statement.table)} ALTER COLUMN ${quoted(statement.column)} DROP NOT NULL;`,
        reversible: true,
      }
    case 'alter-table-validate-constraint':
      return {
        sql: `-- VALIDATE CONSTRAINT no cambia comportamiento, solo confirma los datos existentes. Para deshacer la restricción en sí, usa el rollback de la sentencia ADD CONSTRAINT correspondiente.`,
        reversible: true,
      }
    case 'alter-table-drop-default':
      return {
        sql: `-- Requiere conocer el DEFAULT original (no capturado por este análisis) para restaurarlo con ALTER TABLE ${quoted(statement.table)} ALTER COLUMN ${quoted(statement.column)} SET DEFAULT <valor original>.`,
        reversible: false,
      }
    case 'alter-table-rename-column':
      return {
        sql: `ALTER TABLE ${quoted(statement.table)} RENAME COLUMN ${quoted(statement.newName)} TO ${quoted(statement.column)};`,
        reversible: true,
      }
    case 'alter-table-rename-table':
      return {
        sql: `ALTER TABLE ${quoted(statement.newName)} RENAME TO ${quoted(statement.table)};`,
        reversible: true,
      }
    case 'drop-index':
    case 'drop-index-concurrently':
      return {
        sql: `-- Requiere la definición original del índice ${quoted(statement.indexName)} (columnas, tipo, condición WHERE) para recrearlo; no capturada por este análisis.`,
        reversible: false,
      }
    case 'drop-table':
      return {
        sql: `-- No reversible sin restaurar ${quoted(statement.table)} desde un backup: DROP TABLE elimina la tabla y todos sus datos.`,
        reversible: false,
      }
    case 'truncate':
      return {
        sql: `-- No reversible sin restaurar ${quoted(statement.table)} desde un backup: TRUNCATE elimina todas las filas de forma permanente.`,
        reversible: false,
      }
    case 'alter-table-add-constraint':
      return statement.constraintName
        ? {
            sql: `ALTER TABLE ${quoted(statement.table)} DROP CONSTRAINT IF EXISTS ${quoted(statement.constraintName)};`,
            reversible: true,
          }
        : {
            sql: `-- La restricción no tiene nombre explícito (CONSTRAINT); PostgreSQL le asigna uno automático. Consulta pg_constraint sobre ${quoted(statement.table)} para identificarla antes de hacer DROP CONSTRAINT.`,
            reversible: false,
          }
    case 'alter-table-alter-type':
      return {
        sql: `-- Requiere conocer el tipo original de la columna ${quoted(statement.column)} (no capturado por este análisis) para revertir sin pérdida de precisión/datos.`,
        reversible: false,
      }
    case 'alter-table-other':
    case 'unknown':
    case 'alter-type-other':
    default:
      return {
        sql: `-- Sentencia no reconocida por el parser: define manualmente el paso de rollback antes de aplicarla.`,
        reversible: false,
      }
  }
}

export function buildRollbackSteps(
  phases: readonly RolloutPhase[],
  statementsById: ReadonlyMap<string, MigrationStatement>,
): RollbackStep[] {
  const steps: RollbackStep[] = []
  let order = 1
  // El rollback se ejecuta en orden inverso a las fases (deshacer contract
  // antes que expand no aplicaría aquí porque contract normalmente no es
  // reversible; se documenta igualmente para que el equipo decida).
  for (const phase of phases) {
    for (const statementId of phase.statementIds) {
      const statement = statementsById.get(statementId)
      if (!statement) continue
      const { sql, reversible } = rollbackForStatement(statement)
      steps.push({
        id: `rollback_${statement.id}`,
        phaseId: phase.id,
        order: order++,
        description: `Revertir: ${statement.raw.slice(0, 120)}${statement.raw.length > 120 ? '…' : ''}`,
        sql,
        reversible,
      })
    }
  }
  return steps
}

function verificationForPhase(
  phase: RolloutPhase,
  statementsById: ReadonlyMap<string, MigrationStatement>,
): VerificationStep[] {
  const steps: VerificationStep[] = []
  const statements = phase.statementIds
    .map((id) => statementsById.get(id))
    .filter((statement): statement is MigrationStatement => statement !== undefined)

  for (const statement of statements) {
    if (statement.kind === 'create-index-concurrently' && statement.indexName) {
      steps.push({
        id: `verify_${statement.id}`,
        phaseId: phase.id,
        description: `Confirmar que el índice ${quoted(statement.indexName)} terminó de construirse como válido (CREATE INDEX CONCURRENTLY puede dejarlo INVALID si falla).`,
        query: `SELECT indexrelid::regclass AS index_name, indisvalid FROM pg_index WHERE indexrelid = '${statement.indexName}'::regclass;`,
      })
    } else if (
      (statement.kind === 'alter-table-add-column' ||
        statement.kind === 'alter-table-alter-type') &&
      statement.table &&
      statement.column
    ) {
      steps.push({
        id: `verify_${statement.id}`,
        phaseId: phase.id,
        description: `Comprobar cuántas filas de ${quoted(statement.table)} aún tienen ${quoted(statement.column)} sin rellenar antes de continuar a la siguiente fase.`,
        query: `SELECT count(*) AS pendientes FROM ${quoted(statement.table)} WHERE ${quoted(statement.column)} IS NULL;`,
      })
    } else if (
      statement.kind === 'alter-table-add-constraint' &&
      statement.constraintName &&
      statement.table
    ) {
      steps.push({
        id: `verify_${statement.id}`,
        phaseId: phase.id,
        description: `Comprobar el estado de validación de la restricción ${quoted(statement.constraintName)} (NOT VALID hasta que se ejecute VALIDATE CONSTRAINT).`,
        query: `SELECT conname, convalidated FROM pg_constraint WHERE conrelid = '${statement.table}'::regclass AND conname = '${statement.constraintName}';`,
      })
    } else if (statement.kind === 'alter-table-validate-constraint' && statement.table) {
      steps.push({
        id: `verify_${statement.id}`,
        phaseId: phase.id,
        description: `Confirmar que la restricción quedó validada sobre los datos existentes.`,
        query: `SELECT conname, convalidated FROM pg_constraint WHERE conrelid = '${statement.table}'::regclass;`,
      })
    } else if (
      statement.kind === 'alter-table-set-not-null' &&
      statement.table &&
      statement.column
    ) {
      steps.push({
        id: `verify_${statement.id}`,
        phaseId: phase.id,
        description: `Confirmar que ninguna fila de ${quoted(statement.table)} tiene ${quoted(statement.column)} en NULL antes de aplicar SET NOT NULL.`,
        query: `SELECT count(*) AS filas_nulas FROM ${quoted(statement.table)} WHERE ${quoted(statement.column)} IS NULL;`,
      })
    } else if (
      (statement.kind === 'alter-table-rename-column' ||
        statement.kind === 'alter-table-rename-table') &&
      statement.table
    ) {
      steps.push({
        id: `verify_${statement.id}`,
        phaseId: phase.id,
        description: `Confirmar que el nuevo nombre existe y ningún objeto sigue referenciando el nombre anterior.`,
        query: `SELECT table_name, column_name FROM information_schema.columns WHERE table_name = '${statement.newName ?? statement.table}';`,
      })
    }
  }

  if (steps.length === 0) {
    const tables = [
      ...new Set(statements.map((statement) => statement.table).filter((t): t is string => !!t)),
    ]
    if (tables.length > 0) {
      steps.push({
        id: `verify_${phase.id}_rowcount`,
        phaseId: phase.id,
        description: `Comprobación de referencia: registrar el recuento de filas antes/después de aplicar esta fase sobre ${tables.map((t) => `"${t}"`).join(', ')}.`,
        query: tables.map((t) => `SELECT count(*) AS total_rows FROM "${t}";`).join('\n'),
      })
    } else {
      steps.push({
        id: `verify_${phase.id}_manual`,
        phaseId: phase.id,
        description: `Sin verificación automática sugerida para esta fase; revisa manualmente el plan de ejecución (EXPLAIN) en un entorno de prueba antes de aplicarla en producción.`,
        query: `-- Ejecuta EXPLAIN (ANALYZE, BUFFERS) manualmente sobre cada sentencia de esta fase en un entorno de prueba.`,
      })
    }
  }

  return steps
}

export function buildVerificationSteps(
  phases: readonly RolloutPhase[],
  statementsById: ReadonlyMap<string, MigrationStatement>,
): VerificationStep[] {
  return phases.flatMap((phase) => verificationForPhase(phase, statementsById))
}
