import { describe, expect, it } from 'vitest'
import { EngineError } from '../../src/contracts/errors'
import { validateEngineInput } from '../../src/contracts/validateInput'

const VALID = {
  schemaVersion: '1.0.0',
  scenarioId: 'happy-path',
  payload: { mode: 'migration', sql: 'CREATE TABLE a (id int);' },
  options: { deterministic: true },
}

describe('validateEngineInput', () => {
  it('acepta una entrada válida', () => {
    expect(() => validateEngineInput(VALID)).not.toThrow()
  })

  it('rechaza un schemaVersion incorrecto', () => {
    expect(() => validateEngineInput({ ...VALID, schemaVersion: '9.9.9' })).toThrow(EngineError)
  })

  it('rechaza un scenarioId con mayúsculas o caracteres no permitidos', () => {
    expect(() => validateEngineInput({ ...VALID, scenarioId: 'Happy_Path!' })).toThrow(EngineError)
  })

  it('rechaza propiedades adicionales no declaradas', () => {
    expect(() => validateEngineInput({ ...VALID, extra: true })).toThrow(EngineError)
  })

  it('rechaza un payload con más de 200 propiedades como LIMIT_EXCEEDED', () => {
    const bigPayload: Record<string, number> = {}
    for (let i = 0; i < 201; i += 1) bigPayload[`k${i}`] = i
    try {
      validateEngineInput({ ...VALID, payload: bigPayload })
      expect.unreachable('debía lanzar EngineError')
    } catch (error) {
      expect(error).toBeInstanceOf(EngineError)
      expect((error as EngineError).code).toBe('LIMIT_EXCEEDED')
    }
  })

  it('rechaza un valor que no es objeto', () => {
    expect(() => validateEngineInput('no-es-un-objeto')).toThrow(EngineError)
    expect(() => validateEngineInput(null)).toThrow(EngineError)
  })
})
