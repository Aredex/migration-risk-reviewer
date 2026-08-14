import { EngineError } from './errors'
import type { EngineInput } from './types'

/**
 * Validador manual de contracts/input.schema.json.
 *
 * No se usa `ajv` en tiempo de ejecución: `ajv.compile()` genera código con
 * `new Function(...)`, incompatible con una CSP estricta sin `unsafe-eval`.
 * Este validador replica el schema a mano; `tests/contract/*.test.ts` verifica
 * que no diverja del JSON Schema usando ajv solo en el entorno de pruebas.
 */

const SCENARIO_ID_PATTERN = /^[a-z0-9-]+$/

/** Límite defensivo adicional no explícito en el schema: evita payloads
 * desproporcionados aunque cumplan `maxProperties` (SQL muy largo o
 * objetos muy anidados). Ver 05-arquitectura-tecnica.md: "archivo local
 * inicial ≤10 MB". Usamos un límite más conservador para el payload JSON. */
export const MAX_PAYLOAD_JSON_LENGTH = 2_000_000
export const MAX_PAYLOAD_DEPTH = 12

function jsonDepth(value: unknown, depth = 0): number {
  if (depth > MAX_PAYLOAD_DEPTH) return depth
  if (value === null || typeof value !== 'object') return depth
  const entries = Array.isArray(value) ? value : Object.values(value)
  let max = depth
  for (const entry of entries) {
    const d = jsonDepth(entry, depth + 1)
    if (d > max) max = d
  }
  return max
}

export function validateEngineInput(value: unknown): EngineInput {
  const paths: string[] = []

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new EngineError('INPUT_INVALID', 'La entrada debe ser un objeto JSON.', ['$'])
  }

  const record = value as Record<string, unknown>
  const allowedKeys = new Set(['schemaVersion', 'scenarioId', 'payload', 'options'])
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) paths.push(`$.${key}`)
  }

  if (record['schemaVersion'] !== '1.0.0') paths.push('$.schemaVersion')

  const scenarioId = record['scenarioId']
  if (
    typeof scenarioId !== 'string' ||
    scenarioId.length < 1 ||
    scenarioId.length > 80 ||
    !SCENARIO_ID_PATTERN.test(scenarioId)
  ) {
    paths.push('$.scenarioId')
  }

  const payload = record['payload']
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    paths.push('$.payload')
  } else {
    if (Object.keys(payload).length > 200) {
      throw new EngineError('LIMIT_EXCEEDED', 'El payload excede el máximo de 200 propiedades.', [
        '$.payload',
      ])
    }
    let serialized: string
    try {
      serialized = JSON.stringify(payload)
    } catch {
      paths.push('$.payload')
      serialized = ''
    }
    if (serialized.length > MAX_PAYLOAD_JSON_LENGTH) {
      throw new EngineError('LIMIT_EXCEEDED', 'El payload excede el tamaño máximo permitido.', [
        '$.payload',
      ])
    }
    if (jsonDepth(payload) > MAX_PAYLOAD_DEPTH) {
      throw new EngineError(
        'LIMIT_EXCEEDED',
        'El payload excede la profundidad máxima permitida.',
        ['$.payload'],
      )
    }
  }

  const options = record['options']
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    paths.push('$.options')
  } else {
    const optionsRecord = options as Record<string, unknown>
    const allowedOptionKeys = new Set(['deterministic'])
    for (const key of Object.keys(optionsRecord)) {
      if (!allowedOptionKeys.has(key)) paths.push(`$.options.${key}`)
    }
    if (typeof optionsRecord['deterministic'] !== 'boolean') {
      paths.push('$.options.deterministic')
    }
  }

  if (paths.length > 0) {
    throw new EngineError('INPUT_INVALID', 'La entrada no cumple el contrato esperado.', paths)
  }

  return record as unknown as EngineInput
}
