import { EngineError } from './errors'
import type { EngineOutput, Finding } from './types'

/**
 * Validador manual de contracts/output.schema.json. Ver validateInput.ts
 * para la justificación de no usar `ajv` en tiempo de ejecución.
 */

const STATUS_VALUES = new Set(['completed', 'partial', 'failed', 'cancelled'])
const SEVERITY_VALUES = new Set(['info', 'warning', 'error', 'critical'])

function validateFinding(value: unknown, index: number, paths: string[]): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    paths.push(`$.findings[${index}]`)
    return
  }
  const record = value as Record<string, unknown>
  const allowedKeys = new Set(['ruleId', 'severity', 'message', 'evidencePath', 'suggestion'])
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) paths.push(`$.findings[${index}].${key}`)
  }
  if (typeof record['ruleId'] !== 'string') paths.push(`$.findings[${index}].ruleId`)
  if (typeof record['severity'] !== 'string' || !SEVERITY_VALUES.has(record['severity'])) {
    paths.push(`$.findings[${index}].severity`)
  }
  if (typeof record['message'] !== 'string' || record['message'].length > 1000) {
    paths.push(`$.findings[${index}].message`)
  }
  if (record['evidencePath'] !== undefined) {
    if (typeof record['evidencePath'] !== 'string' || record['evidencePath'].length > 500) {
      paths.push(`$.findings[${index}].evidencePath`)
    }
  }
  if (record['suggestion'] !== undefined) {
    if (typeof record['suggestion'] !== 'string' || record['suggestion'].length > 2000) {
      paths.push(`$.findings[${index}].suggestion`)
    }
  }
}

export function validateEngineOutput(value: unknown): EngineOutput {
  const paths: string[] = []

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new EngineError('INTERNAL_ERROR', 'La salida generada no es un objeto JSON.', ['$'])
  }

  const record = value as Record<string, unknown>
  const allowedKeys = new Set([
    'schemaVersion',
    'runId',
    'status',
    'summary',
    'findings',
    'evidence',
  ])
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) paths.push(`$.${key}`)
  }

  if (record['schemaVersion'] !== '1.0.0') paths.push('$.schemaVersion')

  const runId = record['runId']
  if (typeof runId !== 'string' || runId.length < 1 || runId.length > 100) {
    paths.push('$.runId')
  }

  const status = record['status']
  if (typeof status !== 'string' || !STATUS_VALUES.has(status)) paths.push('$.status')

  const summary = record['summary']
  if (typeof summary !== 'string' || summary.length < 1 || summary.length > 500) {
    paths.push('$.summary')
  }

  const findings = record['findings']
  if (!Array.isArray(findings)) {
    paths.push('$.findings')
  } else {
    if (findings.length > 1000) paths.push('$.findings')
    findings.forEach((finding, index) => validateFinding(finding, index, paths))
  }

  const evidence = record['evidence']
  if (typeof evidence !== 'object' || evidence === null || Array.isArray(evidence)) {
    paths.push('$.evidence')
  } else {
    const evidenceRecord = evidence as Record<string, unknown>
    const allowedEvidenceKeys = new Set(['rulesVersion', 'scenarioId'])
    for (const key of Object.keys(evidenceRecord)) {
      if (!allowedEvidenceKeys.has(key)) paths.push(`$.evidence.${key}`)
    }
    if (typeof evidenceRecord['rulesVersion'] !== 'string') paths.push('$.evidence.rulesVersion')
    if (typeof evidenceRecord['scenarioId'] !== 'string') paths.push('$.evidence.scenarioId')
  }

  if (paths.length > 0) {
    throw new EngineError(
      'INTERNAL_ERROR',
      'La salida generada no cumple el contrato esperado.',
      paths,
    )
  }

  return record as unknown as EngineOutput
}

export function isFinding(value: unknown): value is Finding {
  const paths: string[] = []
  validateFinding(value, 0, paths)
  return paths.length === 0
}
