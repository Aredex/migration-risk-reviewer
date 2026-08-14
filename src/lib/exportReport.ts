import type {
  MigrationAnalysis,
  RiskFinding,
  RollbackStep,
  RolloutPhase,
  VerificationStep,
} from '../domain/types'
import { redactDeep } from './redact'

/** Forma de exportación (06-modelo-datos.md: "export: runId, summary,
 * findings, assumptions; nunca secretos"; 07-contratos-interfaces.md:
 * `exportPlan()`). Máximo 5&nbsp;MB (06-modelo-datos.md: "Exportación
 * máxima 5 MB"), verificado en `tests/unit`. */
export interface ExportedStatement {
  readonly id: string
  readonly kind: string
  readonly table: string | null
  readonly raw: string
  readonly lockLevel: string
  readonly rewritesTable: boolean
}

export interface ExportPayload {
  readonly runId: string
  readonly scenarioId: string
  readonly rulesVersion: string
  readonly status: MigrationAnalysis['status']
  readonly summary: string
  readonly statements: readonly ExportedStatement[]
  readonly findings: readonly RiskFinding[]
  readonly phases: readonly RolloutPhase[]
  readonly rollbackSteps: readonly RollbackStep[]
  readonly verificationSteps: readonly VerificationStep[]
  readonly assumptions: readonly string[]
  readonly exportedAt: string
  readonly disclaimer: string
}

const DISCLAIMER =
  'Este informe proviene de un análisis estático local: no ejecuta SQL, no conecta con ninguna base de datos y no certifica que la migración sea segura. Verifica siempre en un entorno de prueba antes de aplicar en producción.'

export function buildExportPayload(analysis: MigrationAnalysis): ExportPayload {
  const assumptions = [
    'Los niveles de lock y las reescrituras de tabla se estiman con reglas estáticas basadas en la documentación de PostgreSQL, no con un EXPLAIN real contra tu base de datos.',
    'El parser reconoce un subconjunto de DDL de PostgreSQL (ALTER/CREATE/DROP TABLE, índices, tipos, restricciones); sentencias no reconocidas se marcan para revisión manual en vez de asumirse seguras.',
    'Los literales de texto largos dentro del SQL se redactan en esta exportación como defensa adicional; el resto de la estructura de la sentencia se conserva.',
    'Ningún dato de esta ejecución se envió a un servidor: el análisis completo ocurrió en tu navegador.',
  ]

  const statements: ExportedStatement[] = analysis.statements.map((statement) => ({
    id: statement.id,
    kind: statement.kind,
    table: statement.table,
    raw: statement.raw,
    lockLevel: statement.lockLevel,
    rewritesTable: statement.rewritesTable,
  }))

  const payload: ExportPayload = {
    runId: analysis.runId,
    scenarioId: analysis.scenarioId,
    rulesVersion: analysis.rulesVersion,
    status: analysis.status,
    summary: analysis.summary,
    statements,
    findings: analysis.findings,
    phases: analysis.phases,
    rollbackSteps: analysis.rollbackSteps,
    verificationSteps: analysis.verificationSteps,
    assumptions,
    exportedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
  }

  return redactDeep(payload)
}

export function exportPayloadToJson(payload: ExportPayload): string {
  return JSON.stringify(payload, null, 2)
}

export function exportPayloadToMarkdown(payload: ExportPayload): string {
  const lines: string[] = []
  lines.push(`# Informe de análisis de migración — ${payload.scenarioId}`)
  lines.push('')
  lines.push(`- **runId:** ${payload.runId}`)
  lines.push(`- **Estado:** ${payload.status}`)
  lines.push(`- **Versión de reglas:** ${payload.rulesVersion}`)
  lines.push(`- **Exportado:** ${payload.exportedAt}`)
  lines.push('')
  lines.push(`## Resumen`)
  lines.push('')
  lines.push(payload.summary)
  lines.push('')

  lines.push(`## Sentencias analizadas`)
  lines.push('')
  if (payload.statements.length === 0) {
    lines.push('_Ninguna sentencia reconocida._')
  } else {
    for (const statement of payload.statements) {
      lines.push(
        `- \`${statement.id}\` (${statement.kind}, lock: ${statement.lockLevel}${statement.rewritesTable ? ', reescribe tabla' : ''})`,
      )
    }
  }
  lines.push('')

  lines.push(`## Hallazgos`)
  lines.push('')
  if (payload.findings.length === 0) {
    lines.push('_Sin hallazgos._')
  } else {
    for (const finding of payload.findings) {
      lines.push(`### [${finding.severity.toUpperCase()}] ${finding.ruleId}`)
      lines.push('')
      lines.push(finding.message)
      if (finding.evidencePath) lines.push(`- Evidencia: \`${finding.evidencePath}\``)
      if (finding.suggestion) lines.push(`- Sugerencia: ${finding.suggestion}`)
      lines.push('')
    }
  }

  lines.push(`## Fases expand-contract`)
  lines.push('')
  if (payload.phases.length === 0) {
    lines.push('_Sin fases: no se reconocieron sentencias analizables._')
  } else {
    for (const phase of payload.phases) {
      lines.push(`### ${phase.name}`)
      lines.push('')
      lines.push(phase.description)
      lines.push('')
      lines.push(`_Por qué:_ ${phase.rationale}`)
      lines.push('')
      lines.push(
        `Sentencias: ${phase.statementIds.map((id) => `\`${id}\``).join(', ') || '_ninguna_'}`,
      )
      lines.push('')
    }
  }

  lines.push(`## Plan de rollback`)
  lines.push('')
  if (payload.rollbackSteps.length === 0) {
    lines.push('_Sin pasos de rollback._')
  } else {
    for (const step of payload.rollbackSteps) {
      lines.push(
        `- **${step.description}** (${step.reversible ? 'reversible' : 'NO reversible sin backup'})`,
      )
      lines.push('')
      lines.push('```sql')
      lines.push(step.sql)
      lines.push('```')
      lines.push('')
    }
  }

  lines.push(`## Verificación`)
  lines.push('')
  if (payload.verificationSteps.length === 0) {
    lines.push('_Sin pasos de verificación._')
  } else {
    for (const step of payload.verificationSteps) {
      lines.push(`- ${step.description}`)
      lines.push('')
      lines.push('```sql')
      lines.push(step.query)
      lines.push('```')
      lines.push('')
    }
  }

  lines.push(`## Supuestos`)
  lines.push('')
  for (const assumption of payload.assumptions) lines.push(`- ${assumption}`)
  lines.push('')
  lines.push(`---`)
  lines.push('')
  lines.push(`_${payload.disclaimer}_`)
  lines.push('')
  return lines.join('\n')
}
