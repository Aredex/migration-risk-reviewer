import { describe, expect, it } from 'vitest'
import { buildPhases } from '../../src/domain/phases'
import { parseMigration } from '../../src/domain/parser'
import { buildRollbackSteps, buildVerificationSteps } from '../../src/domain/rollback'
import { evaluateStatements } from '../../src/domain/rules'
import type { MigrationStatement } from '../../src/domain/types'

function analyze(sql: string) {
  const statements = parseMigration(sql)
  const findings = evaluateStatements(statements)
  const phases = buildPhases(statements, findings)
  const statementsById = new Map<string, MigrationStatement>(statements.map((s) => [s.id, s]))
  return {
    statements,
    phases,
    rollback: buildRollbackSteps(phases, statementsById),
    verification: buildVerificationSteps(phases, statementsById),
  }
}

describe('buildRollbackSteps: generación de rollback (P15-R4)', () => {
  it('ADD COLUMN es reversible con DROP COLUMN', () => {
    const { rollback } = analyze('ALTER TABLE "orders" ADD COLUMN "notes" text;')
    const step = rollback.find((s) => s.sql.includes('DROP COLUMN'))
    expect(step?.reversible).toBe(true)
    expect(step?.sql).toContain('"notes"')
  })

  it('CREATE INDEX CONCURRENTLY es reversible con DROP INDEX CONCURRENTLY', () => {
    const { rollback } = analyze('CREATE INDEX CONCURRENTLY "idx" ON "orders" ("code");')
    expect(rollback[0]?.sql).toContain('DROP INDEX CONCURRENTLY')
    expect(rollback[0]?.reversible).toBe(true)
  })

  it('DROP TABLE y TRUNCATE se marcan explícitamente como no reversibles', () => {
    const dropAnalysis = analyze('DROP TABLE "orders";')
    const truncateAnalysis = analyze('TRUNCATE "orders";')
    expect(dropAnalysis.rollback[0]?.reversible).toBe(false)
    expect(dropAnalysis.rollback[0]?.sql).toMatch(/no reversible/i)
    expect(truncateAnalysis.rollback[0]?.reversible).toBe(false)
  })

  it('RENAME COLUMN genera el RENAME inverso', () => {
    const { rollback } = analyze('ALTER TABLE "orders" RENAME COLUMN "code" TO "order_code";')
    expect(rollback[0]?.sql).toBe('ALTER TABLE "orders" RENAME COLUMN "order_code" TO "code";')
    expect(rollback[0]?.reversible).toBe(true)
  })

  it('SET NOT NULL es reversible con DROP NOT NULL', () => {
    const { rollback } = analyze('ALTER TABLE "orders" ALTER COLUMN "code" SET NOT NULL;')
    expect(rollback[0]?.sql).toContain('DROP NOT NULL')
    expect(rollback[0]?.reversible).toBe(true)
  })
})

describe('buildVerificationSteps: verificación (P15-R4)', () => {
  it('genera una consulta pg_index para CREATE INDEX CONCURRENTLY', () => {
    const { verification } = analyze('CREATE INDEX CONCURRENTLY "idx" ON "orders" ("code");')
    expect(verification.some((step) => step.query.includes('pg_index'))).toBe(true)
  })

  it('genera una consulta de filas NULL pendientes para ADD COLUMN NOT NULL sin DEFAULT', () => {
    const { verification } = analyze('ALTER TABLE "orders" ADD COLUMN "code" text NOT NULL;')
    expect(verification.some((step) => step.query.includes('IS NULL'))).toBe(true)
  })

  it('toda fase generada tiene al menos un paso de verificación', () => {
    const { phases, verification } = analyze(
      'ALTER TABLE "orders" ADD COLUMN "code" text NOT NULL; ALTER TABLE "orders" DROP COLUMN "legacy";',
    )
    for (const phase of phases) {
      expect(verification.some((step) => step.phaseId === phase.id)).toBe(true)
    }
  })
})
