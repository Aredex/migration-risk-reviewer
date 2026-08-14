import { describe, expect, it } from 'vitest'
import {
  buildExportPayload,
  exportPayloadToJson,
  exportPayloadToMarkdown,
} from '../../src/lib/exportReport'
import { runEngine } from '../../src/domain/engine'
import type { EngineInput } from '../../src/contracts/types'

async function analyze(sql: string) {
  const input: EngineInput = {
    schemaVersion: '1.0.0',
    scenarioId: 'happy-path',
    payload: { mode: 'migration', sql },
    options: { deterministic: true },
  }
  return runEngine(input)
}

describe('buildExportPayload / exportPayload*', () => {
  it('redacta literales de texto largos dentro del SQL exportado', async () => {
    const longSecret = 'x'.repeat(40)
    const analysis = await analyze(`ALTER TABLE "t" ADD COLUMN "c" text DEFAULT '${longSecret}';`)
    const payload = buildExportPayload(analysis)
    const json = exportPayloadToJson(payload)
    expect(json).not.toContain(longSecret)
    expect(json).toContain('[valor redactado]')
  })

  it('nunca incluye el disclaimer vacío ni pierde el runId', async () => {
    const analysis = await analyze('CREATE TABLE a (id int);')
    const payload = buildExportPayload(analysis)
    expect(payload.runId).toBe(analysis.runId)
    expect(payload.disclaimer.length).toBeGreaterThan(0)
  })

  it('el JSON exportado se mantiene por debajo de 5 MB para una migración típica', async () => {
    const analysis = await analyze('ALTER TABLE "orders" ADD COLUMN "notes" text;')
    const payload = buildExportPayload(analysis)
    const json = exportPayloadToJson(payload)
    expect(new TextEncoder().encode(json).byteLength).toBeLessThan(5 * 1024 * 1024)
  })

  it('el Markdown exportado incluye las secciones de fases, rollback y verificación', async () => {
    const analysis = await analyze('ALTER TABLE "orders" ADD COLUMN "notes" text;')
    const payload = buildExportPayload(analysis)
    const markdown = exportPayloadToMarkdown(payload)
    expect(markdown).toContain('## Fases expand-contract')
    expect(markdown).toContain('## Plan de rollback')
    expect(markdown).toContain('## Verificación')
  })
})
