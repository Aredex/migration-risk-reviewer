import { describe, expect, it } from 'vitest'
import { EngineError } from '../../src/contracts/errors'
import { validateEngineOutput } from '../../src/contracts/validateOutput'

const VALID = {
  schemaVersion: '1.0.0',
  runId: 'run_1',
  status: 'completed',
  summary: 'ok',
  findings: [{ ruleId: 'r1', severity: 'info', message: 'm' }],
  evidence: { rulesVersion: '1.0.0', scenarioId: 'happy-path' },
}

describe('validateEngineOutput', () => {
  it('acepta una salida válida', () => {
    expect(() => validateEngineOutput(VALID)).not.toThrow()
  })

  it('rechaza un status fuera de la enumeración', () => {
    expect(() => validateEngineOutput({ ...VALID, status: 'weird' })).toThrow(EngineError)
  })

  it('rechaza un finding con severity inválida', () => {
    expect(() =>
      validateEngineOutput({
        ...VALID,
        findings: [{ ruleId: 'r1', severity: 'huge', message: 'm' }],
      }),
    ).toThrow(EngineError)
  })

  it('rechaza evidence con propiedades adicionales', () => {
    expect(() =>
      validateEngineOutput({
        ...VALID,
        evidence: { rulesVersion: '1.0.0', scenarioId: 'happy-path', extra: 1 },
      }),
    ).toThrow(EngineError)
  })
})
