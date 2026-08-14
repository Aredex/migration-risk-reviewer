import { describe, expect, it } from 'vitest'
import { buildPhases } from '../../src/domain/phases'
import { parseMigration } from '../../src/domain/parser'
import { evaluateStatements } from '../../src/domain/rules'

describe('buildPhases: propuesta expand-contract (P15-R3)', () => {
  it('agrupa ADD COLUMN nullable en la fase expand', () => {
    const statements = parseMigration('ALTER TABLE "orders" ADD COLUMN "notes" text;')
    const findings = evaluateStatements(statements)
    const phases = buildPhases(statements, findings)
    const expand = phases.find((p) => p.kind === 'expand')
    expect(expand?.statementIds).toContain(statements[0]?.id)
  })

  it('agrupa DROP COLUMN y SET NOT NULL en la fase contract', () => {
    const statements = parseMigration(
      'ALTER TABLE "orders" DROP COLUMN "legacy"; ALTER TABLE "orders" ALTER COLUMN "notes" SET NOT NULL;',
    )
    const findings = evaluateStatements(statements)
    const phases = buildPhases(statements, findings)
    const contract = phases.find((p) => p.kind === 'contract')
    expect(contract?.statementIds).toEqual(expect.arrayContaining(statements.map((s) => s.id)))
  })

  it('genera una fase de backfill cuando hay ADD COLUMN NOT NULL sin DEFAULT', () => {
    const statements = parseMigration('ALTER TABLE "orders" ADD COLUMN "code" text NOT NULL;')
    const findings = evaluateStatements(statements)
    const phases = buildPhases(statements, findings)
    expect(phases.some((p) => p.kind === 'backfill')).toBe(true)
  })

  it('agrupa CREATE INDEX sin CONCURRENTLY y ALTER COLUMN TYPE en revisión manual', () => {
    const statements = parseMigration(
      'CREATE INDEX "idx" ON "orders" ("code"); ALTER TABLE "orders" ALTER COLUMN "code" TYPE bigint;',
    )
    const findings = evaluateStatements(statements)
    const phases = buildPhases(statements, findings)
    const review = phases.find((p) => p.kind === 'manual-review')
    expect(review?.statementIds).toEqual(expect.arrayContaining(statements.map((s) => s.id)))
  })

  it('no genera fases cuando no hay sentencias', () => {
    expect(buildPhases([], [])).toEqual([])
  })
})
