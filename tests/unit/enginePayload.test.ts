import { describe, expect, it } from 'vitest'
import { EngineError } from '../../src/contracts/errors'
import { validateEnginePayload } from '../../src/domain/enginePayload'

describe('validateEnginePayload', () => {
  it('acepta un payload de migración válido', () => {
    const result = validateEnginePayload({ mode: 'migration', sql: 'CREATE TABLE a (id int);' })
    expect(result).toEqual({ mode: 'migration', sql: 'CREATE TABLE a (id int);' })
  })

  it('acepta un payload de comparación válido', () => {
    const result = validateEnginePayload({ mode: 'compare', before: 'a', after: 'b' })
    expect(result).toEqual({ mode: 'compare', before: 'a', after: 'b' })
  })

  it('rechaza un mode desconocido como INPUT_INVALID', () => {
    try {
      validateEnginePayload({ mode: 'delete-everything' })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(EngineError)
      expect((error as EngineError).code).toBe('INPUT_INVALID')
    }
  })

  it('rechaza sql vacío/ausente en modo migración', () => {
    expect(() => validateEnginePayload({ mode: 'migration', sql: '' })).toThrow(EngineError)
    expect(() => validateEnginePayload({ mode: 'migration' })).toThrow(EngineError)
  })

  it('rechaza before/after ausentes en modo comparación', () => {
    expect(() => validateEnginePayload({ mode: 'compare', before: 'a' })).toThrow(EngineError)
  })

  it('rechaza SQL que excede el máximo de caracteres como LIMIT_EXCEEDED', () => {
    const huge = 'a'.repeat(200_001)
    try {
      validateEnginePayload({ mode: 'migration', sql: huge })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(EngineError)
      expect((error as EngineError).code).toBe('LIMIT_EXCEEDED')
    }
  })
})
