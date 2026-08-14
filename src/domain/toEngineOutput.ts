import type { EngineOutput, Finding } from '../contracts/types'
import type { MigrationAnalysis } from './types'

/**
 * Proyecta el resultado rico de dominio (`MigrationAnalysis`: sentencias,
 * fases, rollback, verificación) sobre la envolvente de salida genérica
 * compartida por los 29 proyectos del portafolio
 * (contracts/output.schema.json). La UI consume `MigrationAnalysis`
 * directamente; esta función solo se usa para exportación/contrato
 * (07-contratos-interfaces.md).
 */
export function toEngineOutput(analysis: MigrationAnalysis): EngineOutput {
  const findings: Finding[] = analysis.findings.slice(0, 1000).map((finding) => ({
    ruleId: finding.ruleId,
    severity: finding.severity,
    message: finding.message.slice(0, 1000),
    ...(finding.evidencePath !== undefined
      ? { evidencePath: finding.evidencePath.slice(0, 500) }
      : {}),
    ...(finding.suggestion !== undefined ? { suggestion: finding.suggestion.slice(0, 2000) } : {}),
  }))

  return {
    schemaVersion: analysis.schemaVersion,
    runId: analysis.runId,
    status: analysis.status,
    summary: analysis.summary.slice(0, 500),
    findings,
    evidence: {
      rulesVersion: analysis.rulesVersion,
      scenarioId: analysis.scenarioId,
    },
  }
}
