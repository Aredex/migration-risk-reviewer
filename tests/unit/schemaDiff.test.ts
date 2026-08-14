import { describe, expect, it } from 'vitest'
import { diffSchemas } from '../../src/domain/schemaDiff'

const BEFORE = `CREATE TABLE "customers" (
  id integer PRIMARY KEY,
  full_name text NOT NULL,
  legacy_score integer,
  legacy_flag boolean
);`

const AFTER = `CREATE TABLE "customers" (
  id integer PRIMARY KEY,
  full_name text NOT NULL,
  legacy_score bigint,
  lifetime_value_cents integer NOT NULL DEFAULT 0
);`

describe('diffSchemas: comparación de schemas (modo "compare" del PRD)', () => {
  it('detecta una columna añadida', () => {
    const statements = diffSchemas(BEFORE, AFTER)
    const added = statements.find(
      (s) => s.kind === 'alter-table-add-column' && s.column === 'lifetime_value_cents',
    )
    expect(added).toBeDefined()
  })

  it('detecta una columna eliminada', () => {
    const statements = diffSchemas(BEFORE, AFTER)
    const dropped = statements.find(
      (s) => s.kind === 'alter-table-drop-column' && s.column === 'legacy_flag',
    )
    expect(dropped).toBeDefined()
  })

  it('detecta un cambio de tipo de columna', () => {
    const statements = diffSchemas(BEFORE, AFTER)
    const typeChange = statements.find(
      (s) => s.kind === 'alter-table-alter-type' && s.column === 'legacy_score',
    )
    expect(typeChange).toBeDefined()
    expect(typeChange?.raw).toMatch(/bigint/i)
  })

  it('detecta una tabla completamente nueva', () => {
    const statements = diffSchemas('', 'CREATE TABLE "new_table" (id integer);')
    expect(statements.some((s) => s.kind === 'create-table' && s.table === 'new_table')).toBe(true)
  })

  it('detecta una tabla eliminada', () => {
    const statements = diffSchemas('CREATE TABLE "old_table" (id integer);', '')
    expect(statements.some((s) => s.kind === 'drop-table' && s.table === 'old_table')).toBe(true)
  })

  it('no genera cambios cuando los schemas son idénticos', () => {
    expect(diffSchemas(BEFORE, BEFORE)).toHaveLength(0)
  })
})
