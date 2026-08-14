import { checkExternalAdapter } from '../adapter/externalAdapter'
import { EngineError, isEngineError } from '../contracts/errors'
import type { EngineInput } from '../contracts/types'
import { findScenario } from '../fixtures/catalog'
import { RULES_VERSION } from '../fixtures/types'
import { validateEnginePayload } from './enginePayload'
import { makeFinding, RULE_IDS } from './findings'
import { parseMigration } from './parser'
import { buildPhases } from './phases'
import { buildRollbackSteps, buildVerificationSteps } from './rollback'
import { evaluateStatements } from './rules'
import { diffSchemas } from './schemaDiff'
import type { MigrationAnalysis, MigrationStatement, RiskFinding } from './types'
import { countBySeverity } from './types'

const SCHEMA_VERSION = '1.0.0' as const

function assertNotCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new EngineError('RUN_CANCELLED', 'La ejecución fue cancelada.')
  }
}

/** Pausa cancelable usada solo por el Worker para dar tiempo visible al
 * estado "procesando" de la UI; `runEngine` en sí es instantánea y
 * determinista (útil para pruebas unitarias rápidas). */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

function generateRunId(scenarioId: string): string {
  const random =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `run_${scenarioId}_${random}`
}

function resolveRequiresAdapter(scenarioId: string): boolean {
  return findScenario(scenarioId)?.requiresAdapter ?? false
}

function buildSummary(
  findings: readonly RiskFinding[],
  statementCount: number,
  requiresAdapter: boolean,
): string {
  const counts = countBySeverity(findings)
  const prefix = requiresAdapter
    ? 'El adaptador a un motor externo real está desactivado; se completó el análisis con el motor de reglas determinista. '
    : ''
  const disclaimer =
    'Este análisis es estático: no ejecuta SQL ni consulta el tamaño real de tus tablas. Verifica siempre en un entorno de prueba antes de aplicar en producción.'

  if (statementCount === 0) {
    return `${prefix}No se reconoció ninguna sentencia analizable. ${disclaimer}`
  }
  if (counts.critical > 0) {
    return `${prefix}Se analizaron ${statementCount} sentencia(s): ${counts.critical} hallazgo(s) crítico(s) y ${counts.error} de riesgo alto. ${disclaimer}`
  }
  if (counts.error > 0) {
    return `${prefix}Se analizaron ${statementCount} sentencia(s): ${counts.error} hallazgo(s) de riesgo alto que probablemente bloqueen escrituras. ${disclaimer}`
  }
  if (counts.warning > 0) {
    return `${prefix}Se analizaron ${statementCount} sentencia(s) sin errores críticos, pero con ${counts.warning} advertencia(s) que conviene revisar. ${disclaimer}`
  }
  return `${prefix}Se analizaron ${statementCount} sentencia(s) sin hallazgos de riesgo: la migración es mayormente aditiva. ${disclaimer}`
}

function buildAnalysis(
  runId: string,
  scenarioId: string,
  source: 'migration' | 'compare',
  statements: readonly MigrationStatement[],
  requiresAdapter: boolean,
): MigrationAnalysis {
  const findings: RiskFinding[] = []

  if (requiresAdapter) {
    const adapterResult = checkExternalAdapter()
    findings.push(
      makeFinding(RULE_IDS.ADAPTER_DISABLED, 'info', adapterResult.reason, {
        suggestion:
          'Este es el comportamiento esperado (kill switch apagado): la demo continúa con el motor de reglas determinista sobre el mismo fixture.',
      }),
    )
  }

  findings.push(...evaluateStatements(statements))

  const statementsById = new Map(statements.map((statement) => [statement.id, statement]))
  const phases = buildPhases(statements, findings)
  const rollbackSteps = buildRollbackSteps(phases, statementsById)
  const verificationSteps = buildVerificationSteps(phases, statementsById)

  return {
    schemaVersion: SCHEMA_VERSION,
    runId,
    scenarioId,
    status: requiresAdapter ? 'partial' : 'completed',
    summary: buildSummary(findings, statements.length, requiresAdapter),
    rulesVersion: RULES_VERSION,
    snapshot: {
      id: runId,
      source,
      createdAt: new Date().toISOString(),
      statementCount: statements.length,
    },
    statements,
    findings,
    phases,
    rollbackSteps,
    verificationSteps,
    truncated: findings.length > 1000 || statements.length > 1000,
  }
}

/**
 * Orquesta `parseMigration`/`diffSchemas`, `evaluateStatements`,
 * `buildPhases` y `buildRollbackSteps`/`buildVerificationSteps` para
 * producir un `MigrationAnalysis` (07-contratos-interfaces.md:
 * `reviewMigration(sql)` / `compareSchemas(before, after)`). Es la única
 * función que las capas de UI/Worker deben llamar; nunca lanza excepciones
 * no tipadas hacia arriba.
 */
export async function runEngine(
  input: EngineInput,
  signal?: AbortSignal,
  options?: { readonly simulateLatencyMs?: number },
): Promise<MigrationAnalysis> {
  const runId = generateRunId(input.scenarioId)

  try {
    assertNotCancelled(signal)
    if (options?.simulateLatencyMs) {
      await delay(options.simulateLatencyMs, signal)
      assertNotCancelled(signal)
    }

    const payload = validateEnginePayload(input.payload)
    const requiresAdapter = resolveRequiresAdapter(input.scenarioId)

    assertNotCancelled(signal)
    const statements =
      payload.mode === 'migration'
        ? parseMigration(payload.sql)
        : diffSchemas(payload.before, payload.after)
    assertNotCancelled(signal)

    return buildAnalysis(
      runId,
      input.scenarioId,
      payload.mode === 'migration' ? 'migration' : 'compare',
      statements,
      requiresAdapter,
    )
  } catch (error) {
    return buildErrorAnalysis(runId, input.scenarioId, error)
  }
}

function buildErrorAnalysis(runId: string, scenarioId: string, error: unknown): MigrationAnalysis {
  const engineError = isEngineError(error)
    ? error
    : new EngineError('INTERNAL_ERROR', 'Ocurrió un error interno no clasificado.')

  const status: MigrationAnalysis['status'] =
    engineError.code === 'RUN_CANCELLED' ? 'cancelled' : 'failed'
  const severity =
    engineError.code === 'RUN_CANCELLED' ? ('warning' as const) : ('critical' as const)

  const finding = makeFinding(
    ruleIdForError(engineError.code),
    severity,
    engineError.message,
    engineError.paths && engineError.paths.length > 0
      ? { evidencePath: engineError.paths[0] }
      : undefined,
  )

  return {
    schemaVersion: SCHEMA_VERSION,
    runId,
    scenarioId,
    status,
    summary: summaryForError(engineError.code),
    rulesVersion: RULES_VERSION,
    snapshot: {
      id: runId,
      source: 'migration',
      createdAt: new Date().toISOString(),
      statementCount: 0,
    },
    statements: [],
    findings: [finding],
    phases: [],
    rollbackSteps: [],
    verificationSteps: [],
    truncated: false,
  }
}

function ruleIdForError(code: EngineError['code']): string {
  switch (code) {
    case 'INPUT_INVALID':
      return RULE_IDS.ERROR_INPUT_INVALID
    case 'LIMIT_EXCEEDED':
      return RULE_IDS.ERROR_LIMIT_EXCEEDED
    case 'RUN_CANCELLED':
      return RULE_IDS.ERROR_RUN_CANCELLED
    case 'DEPENDENCY_UNAVAILABLE':
      return RULE_IDS.ERROR_DEPENDENCY_UNAVAILABLE
    case 'INTERNAL_ERROR':
    default:
      return RULE_IDS.ERROR_INTERNAL
  }
}

function summaryForError(code: EngineError['code']): string {
  switch (code) {
    case 'INPUT_INVALID':
      return 'No pudimos procesar esta entrada. Tus datos no se enviaron a ningún servidor; corrige los campos señalados.'
    case 'LIMIT_EXCEEDED':
      return 'La entrada excede los límites de tamaño/cantidad de esta demo. Reduce el contenido e inténtalo de nuevo.'
    case 'RUN_CANCELLED':
      return 'La ejecución fue cancelada. Puedes volver a ejecutar el escenario cuando quieras.'
    case 'DEPENDENCY_UNAVAILABLE':
      return 'El adaptador real no está disponible. Se ofrece el motor de reglas determinista como alternativa.'
    case 'INTERNAL_ERROR':
    default:
      return 'Ocurrió un error interno no clasificado. No se registró el contenido de tu entrada.'
  }
}
