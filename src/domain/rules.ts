import { makeFinding, RULE_IDS } from './findings'
import type { MigrationStatement, RiskFinding } from './types'

/**
 * Clasificación de locks y reescrituras (P15-R2): cada sentencia reconocida
 * produce uno o más `RiskFinding` con severidad, causa y sugerencia. Las
 * fuentes de la clasificación son la documentación oficial de PostgreSQL
 * (CREATE INDEX, ALTER TABLE, explicit locking) enlazada en
 * 05-arquitectura-tecnica.md. Esta demo no ejecuta `EXPLAIN` real: son
 * reglas estáticas y deterministas, documentadas como tales en la UI.
 */
export function evaluateStatement(statement: MigrationStatement): RiskFinding[] {
  const findings: RiskFinding[] = []
  const evidencePath = `$.statements[${statement.index}]`
  const table = statement.table ? `"${statement.table}"` : 'la tabla afectada'

  if (statement.flags.hasMultipleActions) {
    findings.push(
      makeFinding(
        RULE_IDS.MULTI_ACTION_PARTIAL,
        'warning',
        `Esta sentencia ALTER TABLE combina varias acciones separadas por coma; el análisis solo clasificó la primera. Revisa manualmente las acciones restantes o divide la sentencia en varios ALTER TABLE.`,
        { statementId: statement.id, evidencePath },
      ),
    )
  }

  switch (statement.kind) {
    case 'create-table':
      findings.push(
        makeFinding(
          RULE_IDS.CREATE_TABLE_OK,
          'info',
          `Crea una tabla nueva: no afecta a tablas existentes ni requiere lock sobre datos ya presentes.`,
          {
            statementId: statement.id,
            evidencePath,
            lockLevel: statement.lockLevel,
          },
        ),
      )
      break

    case 'create-type':
      findings.push(
        makeFinding(
          RULE_IDS.CREATE_TYPE_OK,
          'info',
          `Crea un tipo nuevo: no bloquea tablas existentes.`,
          {
            statementId: statement.id,
            evidencePath,
            lockLevel: statement.lockLevel,
          },
        ),
      )
      break

    case 'alter-type-add-value':
      findings.push(
        makeFinding(
          RULE_IDS.ALTER_TYPE_ADD_VALUE_RISK,
          'warning',
          `ALTER TYPE ... ADD VALUE no puede usarse en la misma transacción en la que se declaró, y no es reversible: eliminar un valor de un enum requiere recrear el tipo.`,
          {
            statementId: statement.id,
            evidencePath,
            lockLevel: statement.lockLevel,
            suggestion:
              'Despliega este cambio en su propia migración, antes de que el código dependa del nuevo valor. No planees revertirlo sin recrear el tipo.',
          },
        ),
      )
      break

    case 'alter-type-other':
      findings.push(
        makeFinding(
          RULE_IDS.ALTER_TYPE_OTHER_RISK,
          'warning',
          `Este cambio de tipo (renombrar valor/tipo u otra variante de ALTER TYPE) puede requerir recrear el tipo y afecta a todas las columnas que lo usan.`,
          {
            statementId: statement.id,
            evidencePath,
            lockLevel: statement.lockLevel,
            suggestion: 'Revisa manualmente qué columnas dependen de este tipo antes de aplicarlo.',
          },
        ),
      )
      break

    case 'create-index':
      // El parser ya separó esta variante de `create-index-concurrently`
      // según la palabra clave CONCURRENTLY (ver parser.ts).
      findings.push(
        makeFinding(
          RULE_IDS.CREATE_INDEX_BLOCKING,
          'error',
          `CREATE INDEX sin CONCURRENTLY toma un lock SHARE sobre ${table} que bloquea INSERT/UPDATE/DELETE durante toda la construcción del índice.`,
          {
            statementId: statement.id,
            evidencePath,
            lockLevel: statement.lockLevel,
            suggestion:
              'Usa CREATE INDEX CONCURRENTLY (fuera de un bloque de transacción) para no bloquear escrituras; comprueba después pg_index.indisvalid.',
          },
        ),
      )
      break

    case 'create-index-concurrently':
      findings.push(
        makeFinding(
          RULE_IDS.CREATE_INDEX_CONCURRENTLY_OK,
          'info',
          `CREATE INDEX CONCURRENTLY no bloquea escrituras, pero no puede ejecutarse dentro de un bloque de transacción y puede dejar un índice INVALID si falla a mitad de camino.`,
          {
            statementId: statement.id,
            evidencePath,
            lockLevel: statement.lockLevel,
            suggestion:
              'Verifica pg_index.indisvalid tras la ejecución; si es inválido, haz DROP INDEX y reintenta.',
          },
        ),
      )
      break

    case 'drop-index':
      findings.push(
        makeFinding(
          RULE_IDS.DROP_INDEX_BLOCKING,
          'warning',
          `DROP INDEX sin CONCURRENTLY toma un lock ACCESS EXCLUSIVE breve, pero puede quedar en cola detrás de consultas largas y bloquear a su vez nuevas consultas sobre ${table}.`,
          {
            statementId: statement.id,
            evidencePath,
            lockLevel: statement.lockLevel,
            suggestion: 'Usa DROP INDEX CONCURRENTLY si la tabla tiene tráfico concurrente.',
          },
        ),
      )
      break

    case 'drop-index-concurrently':
      findings.push(
        makeFinding(
          RULE_IDS.DROP_INDEX_CONCURRENTLY_OK,
          'info',
          `DROP INDEX CONCURRENTLY evita bloquear consultas concurrentes.`,
          {
            statementId: statement.id,
            evidencePath,
            lockLevel: statement.lockLevel,
          },
        ),
      )
      break

    case 'alter-table-add-column': {
      const raw = statement.raw
      const hasNotNull = /NOT\s+NULL/i.test(raw)
      const hasDefault = /\bDEFAULT\b/i.test(raw)
      if (statement.flags.hasVolatileDefault) {
        findings.push(
          makeFinding(
            RULE_IDS.ADD_COLUMN_VOLATILE_DEFAULT,
            'critical',
            `ADD COLUMN con un DEFAULT volátil (now(), random(), nextval(), gen_random_uuid()...) obliga a reescribir toda ${table} porque el valor no es constante para todas las filas.`,
            {
              statementId: statement.id,
              evidencePath,
              lockLevel: statement.lockLevel,
              rewritesTable: true,
              suggestion:
                'Añade la columna sin DEFAULT (o con un DEFAULT constante), rellena los valores con UPDATE por lotes y aplica el valor definitivo después.',
            },
          ),
        )
      } else if (hasNotNull && !hasDefault) {
        findings.push(
          makeFinding(
            RULE_IDS.ADD_COLUMN_NOT_NULL_NO_DEFAULT,
            'critical',
            `ADD COLUMN ... NOT NULL sin DEFAULT falla en cuanto ${table} tenga alguna fila, porque esa fila violaría la restricción NOT NULL.`,
            {
              statementId: statement.id,
              evidencePath,
              lockLevel: statement.lockLevel,
              suggestion:
                'Divide en expand-contract: añade la columna nullable (fase expand), rellénala con un backfill por lotes, y aplica SET NOT NULL validado en una fase de contract posterior.',
            },
          ),
        )
      } else {
        findings.push(
          makeFinding(
            RULE_IDS.ADD_COLUMN_OK,
            'info',
            `Columna añadida de forma aditiva. En PostgreSQL 11+, un DEFAULT constante no reescribe la tabla (solo actualiza el catálogo).`,
            { statementId: statement.id, evidencePath, lockLevel: statement.lockLevel },
          ),
        )
      }
      break
    }

    case 'alter-table-drop-column':
      findings.push(
        makeFinding(
          RULE_IDS.DROP_COLUMN_BREAKS_COMPAT,
          'warning',
          `DROP COLUMN es una operación de catálogo rápida en PostgreSQL, pero rompe de inmediato cualquier código en despliegue que siga leyendo o escribiendo esa columna, y no es reversible sin restaurar desde backup.`,
          {
            statementId: statement.id,
            evidencePath,
            lockLevel: statement.lockLevel,
            suggestion:
              'Dentro de expand-contract: deja de leer/escribir la columna desde la aplicación, despliega ese cambio, y solo entonces ejecuta el DROP COLUMN en una fase de contract separada.',
          },
        ),
      )
      break

    case 'alter-table-alter-type':
      findings.push(
        makeFinding(
          RULE_IDS.ALTER_COLUMN_TYPE_REWRITE,
          'critical',
          `ALTER COLUMN ... TYPE normalmente reescribe ${table} completa bajo un lock ACCESS EXCLUSIVE, salvo que el nuevo tipo sea binariamente compatible con el original.`,
          {
            statementId: statement.id,
            evidencePath,
            lockLevel: statement.lockLevel,
            rewritesTable: true,
            suggestion:
              'Verifica la compatibilidad binaria del cambio. Si reescribe, prefiere expand-contract: columna nueva del tipo destino + backfill + swap de nombres, en vez de un ALTER TYPE directo.',
          },
        ),
      )
      break

    case 'alter-table-set-not-null':
      findings.push(
        makeFinding(
          RULE_IDS.SET_NOT_NULL_FULL_SCAN,
          'error',
          `SET NOT NULL escanea ${table} completa bajo un lock ACCESS EXCLUSIVE para comprobar que ninguna fila sea NULL.`,
          {
            statementId: statement.id,
            evidencePath,
            lockLevel: statement.lockLevel,
            suggestion:
              'En PostgreSQL 12+: añade antes un CHECK (columna IS NOT NULL) NOT VALID, valida con VALIDATE CONSTRAINT (no bloqueante) y luego aplica SET NOT NULL; PostgreSQL reutiliza esa validación y evita el escaneo repetido.',
          },
        ),
      )
      break

    case 'alter-table-drop-not-null':
      findings.push(
        makeFinding(
          RULE_IDS.DROP_NOT_NULL_OK,
          'info',
          `DROP NOT NULL es un cambio de catálogo rápido; no escanea ni reescribe la tabla.`,
          {
            statementId: statement.id,
            evidencePath,
            lockLevel: statement.lockLevel,
          },
        ),
      )
      break

    case 'alter-table-set-default':
      findings.push(
        makeFinding(
          RULE_IDS.SET_DEFAULT_OK,
          'info',
          `SET DEFAULT solo afecta a filas futuras; es un cambio de catálogo rápido.`,
          {
            statementId: statement.id,
            evidencePath,
            lockLevel: statement.lockLevel,
          },
        ),
      )
      break

    case 'alter-table-drop-default':
      findings.push(
        makeFinding(
          RULE_IDS.DROP_DEFAULT_OK,
          'info',
          `DROP DEFAULT es un cambio de catálogo rápido.`,
          {
            statementId: statement.id,
            evidencePath,
            lockLevel: statement.lockLevel,
          },
        ),
      )
      break

    case 'alter-table-add-constraint':
      if (statement.flags.hasNotValid) {
        findings.push(
          makeFinding(
            RULE_IDS.ADD_CONSTRAINT_NOT_VALID_OK,
            'info',
            `La restricción se añade con NOT VALID: PostgreSQL no escanea las filas existentes ahora, así que el ALTER es rápido (solo un lock ACCESS EXCLUSIVE breve de catálogo).`,
            {
              statementId: statement.id,
              evidencePath,
              lockLevel: statement.lockLevel,
              suggestion:
                'Ejecuta VALIDATE CONSTRAINT en una fase posterior para exigirla también sobre los datos existentes.',
            },
          ),
        )
      } else {
        findings.push(
          makeFinding(
            RULE_IDS.ADD_CONSTRAINT_VALIDATION_LOCK,
            'error',
            `Añadir esta restricción sin NOT VALID escanea y bloquea ${table} (SHARE ROW EXCLUSIVE en ambas tablas para FOREIGN KEY, ACCESS EXCLUSIVE para CHECK) mientras valida todas las filas existentes.`,
            {
              statementId: statement.id,
              evidencePath,
              lockLevel: statement.lockLevel,
              suggestion:
                'Añade la restricción con NOT VALID y valídala después con VALIDATE CONSTRAINT, que usa un lock más permisivo.',
            },
          ),
        )
      }
      break

    case 'alter-table-validate-constraint':
      findings.push(
        makeFinding(
          RULE_IDS.VALIDATE_CONSTRAINT_OK,
          'info',
          `VALIDATE CONSTRAINT usa un lock SHARE UPDATE EXCLUSIVE: no bloquea lecturas ni escrituras concurrentes mientras revisa las filas existentes.`,
          { statementId: statement.id, evidencePath, lockLevel: statement.lockLevel },
        ),
      )
      break

    case 'alter-table-rename-column':
    case 'alter-table-rename-table':
      findings.push(
        makeFinding(
          RULE_IDS.RENAME_BREAKS_COMPAT,
          'warning',
          `El rename es un cambio de catálogo instantáneo, pero rompe de inmediato cualquier código en despliegue que siga usando el nombre anterior.`,
          {
            statementId: statement.id,
            evidencePath,
            lockLevel: statement.lockLevel,
            suggestion:
              'Coordina el rename con el despliegue de la aplicación, o expón el nombre anterior temporalmente con una vista/alias.',
          },
        ),
      )
      break

    case 'truncate':
      findings.push(
        makeFinding(
          RULE_IDS.TRUNCATE_DATA_LOSS,
          'critical',
          `TRUNCATE elimina todas las filas de ${table} de forma irreversible fuera de una transacción activa, y toma un lock ACCESS EXCLUSIVE.`,
          {
            statementId: statement.id,
            evidencePath,
            lockLevel: statement.lockLevel,
            suggestion:
              'Confirma que no sea el resultado de una condición accidental; documenta el backup previo si es intencional.',
          },
        ),
      )
      break

    case 'drop-table':
      findings.push(
        makeFinding(
          RULE_IDS.DROP_TABLE_DATA_LOSS,
          'critical',
          `DROP TABLE elimina ${table} y todos sus datos de forma irreversible.`,
          {
            statementId: statement.id,
            evidencePath,
            lockLevel: statement.lockLevel,
            suggestion:
              'Verifica que existan backups recientes antes de aplicar este cambio en producción.',
          },
        ),
      )
      break

    case 'alter-table-other':
      findings.push(
        makeFinding(
          RULE_IDS.ALTER_TABLE_OTHER_UNRECOGNIZED,
          'warning',
          `No reconocimos esta variante concreta de ALTER TABLE; el parser de esta demo no cubre el dialecto completo de PostgreSQL.`,
          {
            statementId: statement.id,
            evidencePath,
            lockLevel: statement.lockLevel,
            suggestion:
              'Revisa manualmente el lock y la reversibilidad de esta sentencia antes de aplicarla.',
          },
        ),
      )
      break

    case 'unknown':
    default:
      findings.push(
        makeFinding(
          RULE_IDS.UNKNOWN_STATEMENT,
          'warning',
          `No reconocimos el tipo de esta sentencia; revísala manualmente antes de aplicarla. Esta demo no ejecuta SQL, solo lo analiza con un parser propio de alcance acotado.`,
          { statementId: statement.id, evidencePath },
        ),
      )
      break
  }

  return findings
}

export function evaluateStatements(statements: readonly MigrationStatement[]): RiskFinding[] {
  return statements.flatMap((statement) => evaluateStatement(statement))
}
