import { describe, expect, it } from 'vitest'
import { RULE_IDS } from '../../src/domain/findings'
import { parseMigration } from '../../src/domain/parser'
import { evaluateStatements } from '../../src/domain/rules'

function findingsFor(sql: string) {
  return evaluateStatements(parseMigration(sql))
}

describe('evaluateStatements: clasificación de locks y reescrituras (P15-R2)', () => {
  it('ADD COLUMN NOT NULL sin DEFAULT es crítico', () => {
    const findings = findingsFor('ALTER TABLE "accounts" ADD COLUMN "code" text NOT NULL;')
    expect(
      findings.some(
        (f) => f.ruleId === RULE_IDS.ADD_COLUMN_NOT_NULL_NO_DEFAULT && f.severity === 'critical',
      ),
    ).toBe(true)
  })

  it('ADD COLUMN NOT NULL con DEFAULT constante es informativo', () => {
    const findings = findingsFor(
      'ALTER TABLE "accounts" ADD COLUMN "tier" text NOT NULL DEFAULT \'free\';',
    )
    expect(findings.some((f) => f.ruleId === RULE_IDS.ADD_COLUMN_OK)).toBe(true)
    expect(findings.some((f) => f.severity === 'critical')).toBe(false)
  })

  it('ADD COLUMN con DEFAULT volátil es crítico y marca reescritura', () => {
    const findings = findingsFor(
      'ALTER TABLE "accounts" ADD COLUMN "created_at" timestamptz DEFAULT now();',
    )
    const finding = findings.find((f) => f.ruleId === RULE_IDS.ADD_COLUMN_VOLATILE_DEFAULT)
    expect(finding?.severity).toBe('critical')
    expect(finding?.rewritesTable).toBe(true)
  })

  it('CREATE INDEX sin CONCURRENTLY es error bloqueante', () => {
    const findings = findingsFor('CREATE INDEX "idx" ON "accounts" ("code");')
    expect(
      findings.some((f) => f.ruleId === RULE_IDS.CREATE_INDEX_BLOCKING && f.severity === 'error'),
    ).toBe(true)
  })

  it('CREATE INDEX CONCURRENTLY es informativo', () => {
    const findings = findingsFor('CREATE INDEX CONCURRENTLY "idx" ON "accounts" ("code");')
    expect(findings.some((f) => f.ruleId === RULE_IDS.CREATE_INDEX_CONCURRENTLY_OK)).toBe(true)
  })

  it('ALTER COLUMN TYPE es crítico y marca reescritura', () => {
    const findings = findingsFor('ALTER TABLE "accounts" ALTER COLUMN "code" TYPE bigint;')
    const finding = findings.find((f) => f.ruleId === RULE_IDS.ALTER_COLUMN_TYPE_REWRITE)
    expect(finding?.severity).toBe('critical')
    expect(finding?.rewritesTable).toBe(true)
  })

  it('SET NOT NULL es error de escaneo completo', () => {
    const findings = findingsFor('ALTER TABLE "accounts" ALTER COLUMN "code" SET NOT NULL;')
    expect(
      findings.some((f) => f.ruleId === RULE_IDS.SET_NOT_NULL_FULL_SCAN && f.severity === 'error'),
    ).toBe(true)
  })

  it('ADD CONSTRAINT sin NOT VALID es error; con NOT VALID es informativo', () => {
    const blocking = findingsFor(
      'ALTER TABLE "accounts" ADD CONSTRAINT "chk" CHECK (code IS NOT NULL);',
    )
    const notValid = findingsFor(
      'ALTER TABLE "accounts" ADD CONSTRAINT "chk" CHECK (code IS NOT NULL) NOT VALID;',
    )
    expect(
      blocking.some(
        (f) => f.ruleId === RULE_IDS.ADD_CONSTRAINT_VALIDATION_LOCK && f.severity === 'error',
      ),
    ).toBe(true)
    expect(notValid.some((f) => f.ruleId === RULE_IDS.ADD_CONSTRAINT_NOT_VALID_OK)).toBe(true)
  })

  it('DROP COLUMN es advertencia de compatibilidad', () => {
    const findings = findingsFor('ALTER TABLE "accounts" DROP COLUMN "legacy";')
    expect(
      findings.some(
        (f) => f.ruleId === RULE_IDS.DROP_COLUMN_BREAKS_COMPAT && f.severity === 'warning',
      ),
    ).toBe(true)
  })

  it('TRUNCATE y DROP TABLE son críticos por pérdida de datos', () => {
    expect(
      findingsFor('TRUNCATE "accounts";').some(
        (f) => f.ruleId === RULE_IDS.TRUNCATE_DATA_LOSS && f.severity === 'critical',
      ),
    ).toBe(true)
    expect(
      findingsFor('DROP TABLE "accounts";').some(
        (f) => f.ruleId === RULE_IDS.DROP_TABLE_DATA_LOSS && f.severity === 'critical',
      ),
    ).toBe(true)
  })

  it('sentencias no reconocidas generan advertencia de revisión manual, sin lanzar excepción', () => {
    const findings = findingsFor('COMMENT ON TABLE "accounts" IS \'nota\';')
    expect(
      findings.some((f) => f.ruleId === RULE_IDS.UNKNOWN_STATEMENT && f.severity === 'warning'),
    ).toBe(true)
  })

  it('múltiples acciones en un ALTER TABLE generan aviso de análisis parcial', () => {
    const findings = findingsFor('ALTER TABLE "accounts" ADD COLUMN "a" int, ADD COLUMN "b" int;')
    expect(findings.some((f) => f.ruleId === RULE_IDS.MULTI_ACTION_PARTIAL)).toBe(true)
  })

  it('RENAME COLUMN y RENAME TO avisan de ruptura de compatibilidad', () => {
    expect(
      findingsFor('ALTER TABLE "accounts" RENAME COLUMN "code" TO "account_code";').some(
        (f) => f.ruleId === RULE_IDS.RENAME_BREAKS_COMPAT,
      ),
    ).toBe(true)
    expect(
      findingsFor('ALTER TABLE "accounts" RENAME TO "accounts_v2";').some(
        (f) => f.ruleId === RULE_IDS.RENAME_BREAKS_COMPAT,
      ),
    ).toBe(true)
  })
})
