import { EngineError } from '../contracts/errors'
import { MAX_SQL_LENGTH } from './parser'

export type EnginePayload =
  | { readonly mode: 'migration'; readonly sql: string }
  | { readonly mode: 'compare'; readonly before: string; readonly after: string }

/** Valida el `payload` específico de este dominio (07-contratos-interfaces.md:
 * `reviewMigration(sql)` / `compareSchemas(before, after)`), por encima de la
 * validación genérica de `contracts/validateInput.ts`. El Worker vuelve a
 * validar siempre, aunque el payload ya venga de nuestra propia UI
 * (08-seguridad-privacidad.md: "cualquier Worker valida de nuevo"). */
export function validateEnginePayload(payload: Record<string, unknown>): EnginePayload {
  const mode = payload['mode']
  if (mode === 'migration') {
    const sql = payload['sql']
    if (typeof sql !== 'string' || sql.trim().length === 0) {
      throw new EngineError('INPUT_INVALID', 'Falta el SQL de la migración a analizar.', [
        '$.payload.sql',
      ])
    }
    if (sql.length > MAX_SQL_LENGTH) {
      throw new EngineError(
        'LIMIT_EXCEEDED',
        `El SQL excede el máximo de ${MAX_SQL_LENGTH.toLocaleString('es')} caracteres soportado por esta demo.`,
        ['$.payload.sql'],
      )
    }
    return { mode: 'migration', sql }
  }

  if (mode === 'compare') {
    const before = payload['before']
    const after = payload['after']
    if (typeof before !== 'string' || typeof after !== 'string') {
      throw new EngineError('INPUT_INVALID', 'Faltan los schemas "before"/"after" a comparar.', [
        '$.payload.before',
        '$.payload.after',
      ])
    }
    if (before.length > MAX_SQL_LENGTH || after.length > MAX_SQL_LENGTH) {
      throw new EngineError(
        'LIMIT_EXCEEDED',
        `Cada schema excede el máximo de ${MAX_SQL_LENGTH.toLocaleString('es')} caracteres soportado por esta demo.`,
        ['$.payload.before'],
      )
    }
    if (before.trim().length === 0 && after.trim().length === 0) {
      throw new EngineError('INPUT_INVALID', 'Ambos schemas están vacíos.', [
        '$.payload.before',
        '$.payload.after',
      ])
    }
    return { mode: 'compare', before, after }
  }

  throw new EngineError(
    'INPUT_INVALID',
    'El payload debe declarar mode: "migration" o "compare".',
    ['$.payload.mode'],
  )
}
