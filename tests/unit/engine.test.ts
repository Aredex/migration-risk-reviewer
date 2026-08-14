import { describe, expect, it } from 'vitest'
import type { EngineInput } from '../../src/contracts/types'
import { runEngine } from '../../src/domain/engine'

function input(scenarioId: string, payload: Record<string, unknown>): EngineInput {
  return { schemaVersion: '1.0.0', scenarioId, payload, options: { deterministic: true } }
}

describe('runEngine: orquestación del motor de dominio', () => {
  it('produce un análisis completo para una migración aditiva simple', async () => {
    const result = await runEngine(
      input('happy-path', {
        mode: 'migration',
        sql: 'ALTER TABLE "orders" ADD COLUMN "notes" text;',
      }),
    )
    expect(result.status).toBe('completed')
    expect(result.statements).toHaveLength(1)
    expect(result.findings.length).toBeGreaterThan(0)
    expect(result.phases.length).toBeGreaterThan(0)
  })

  it('devuelve status failed con un hallazgo crítico ante un payload inválido (sql vacío)', async () => {
    const result = await runEngine(input('empty-input', { mode: 'migration', sql: '' }))
    expect(result.status).toBe('failed')
    expect(result.findings[0]?.severity).toBe('critical')
    expect(result.findings[0]?.ruleId).toBe('error-input-invalid')
  })

  it('respeta la cancelación vía AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await runEngine(
      input('happy-path', { mode: 'migration', sql: 'CREATE TABLE a (id int);' }),
      controller.signal,
    )
    expect(result.status).toBe('cancelled')
  })

  it('marca status partial y añade un hallazgo informativo cuando el escenario requiere el adaptador (desactivado)', async () => {
    const result = await runEngine(
      input('adapter-demo', {
        mode: 'migration',
        sql: 'ALTER TABLE "invoices" ADD COLUMN "notes" text;',
      }),
    )
    expect(result.status).toBe('partial')
    expect(result.findings.some((f) => f.ruleId === 'adapter-disabled')).toBe(true)
  })

  it('nunca lanza excepciones no controladas ante entradas límite', async () => {
    const hugeSql = 'CREATE TABLE a (id int);'.repeat(20_000)
    const result = await runEngine(input('boundary', { mode: 'migration', sql: hugeSql }))
    expect(result.status).toBe('failed')
    expect(result.findings[0]?.ruleId).toBe('error-limit-exceeded')
  })
})
