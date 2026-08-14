import { describe, expect, it } from 'vitest'
import { parseMigration, splitStatements } from '../../src/domain/parser'
import { EngineError } from '../../src/contracts/errors'

describe('splitStatements', () => {
  it('separa sentencias simples por punto y coma', () => {
    const statements = splitStatements('CREATE TABLE a (id int); CREATE TABLE b (id int);')
    expect(statements).toHaveLength(2)
  })

  it('no parte una sentencia por un ; dentro de un comentario de línea', () => {
    // splitStatements es un separador crudo: el comentario final tras el
    // último `;` real queda como fragmento aparte (sin contenido SQL). Es
    // `parseMigration` quien descarta los fragmentos que solo son comentario.
    const statements = splitStatements('CREATE TABLE a (id int); -- comentario con ; dentro\n')
    expect(statements).toHaveLength(2)
    expect(parseMigration('CREATE TABLE a (id int); -- comentario con ; dentro\n')).toHaveLength(1)
  })

  it('no parte una sentencia por un ; dentro de un comentario de bloque', () => {
    const statements = splitStatements('CREATE TABLE a (id int /* punto y coma ; aquí */, ok int);')
    expect(statements).toHaveLength(1)
  })

  it('no parte una sentencia por un ; dentro de una cadena de texto', () => {
    const statements = splitStatements(
      `ALTER TABLE a ADD COLUMN b text DEFAULT '); DROP TABLE a; --';`,
    )
    expect(statements).toHaveLength(1)
  })

  it('no parte una sentencia por un ; dentro de un bloque dollar-quoted', () => {
    const statements = splitStatements(
      `CREATE FUNCTION f() RETURNS void AS $$ BEGIN PERFORM 1; END; $$ LANGUAGE plpgsql;`,
    )
    expect(statements).toHaveLength(1)
  })

  it('ignora sentencias vacías (espacios, punto y coma sobrante)', () => {
    const statements = splitStatements('  ;  CREATE TABLE a (id int);   ')
    expect(statements).toHaveLength(1)
  })
})

describe('parseMigration: clasificación de sentencias', () => {
  it('clasifica CREATE TABLE', () => {
    const [statement] = parseMigration('CREATE TABLE "orders" (id int);')
    expect(statement?.kind).toBe('create-table')
    expect(statement?.table).toBe('orders')
    expect(statement?.lockLevel).toBe('none')
  })

  it('clasifica ALTER TABLE ADD COLUMN NOT NULL sin DEFAULT', () => {
    const [statement] = parseMigration('ALTER TABLE "accounts" ADD COLUMN "code" text NOT NULL;')
    expect(statement?.kind).toBe('alter-table-add-column')
    expect(statement?.column).toBe('code')
  })

  it('detecta DEFAULT volátil', () => {
    const [statement] = parseMigration(
      'ALTER TABLE "accounts" ADD COLUMN "created_at" timestamptz DEFAULT now();',
    )
    expect(statement?.flags.hasVolatileDefault).toBe(true)
    expect(statement?.rewritesTable).toBe(true)
  })

  it('distingue CREATE INDEX de CREATE INDEX CONCURRENTLY', () => {
    const [blocking] = parseMigration('CREATE INDEX "idx_a" ON "accounts" ("code");')
    const [concurrent] = parseMigration('CREATE INDEX CONCURRENTLY "idx_b" ON "accounts" ("code");')
    expect(blocking?.kind).toBe('create-index')
    expect(blocking?.blocksWrites).toBe(true)
    expect(concurrent?.kind).toBe('create-index-concurrently')
    expect(concurrent?.blocksWrites).toBe(false)
    expect(concurrent?.indexName).toBe('idx_b')
    expect(concurrent?.table).toBe('accounts')
  })

  it('clasifica ALTER COLUMN TYPE como reescritura', () => {
    const [statement] = parseMigration('ALTER TABLE "accounts" ALTER COLUMN "code" TYPE bigint;')
    expect(statement?.kind).toBe('alter-table-alter-type')
    expect(statement?.rewritesTable).toBe(true)
  })

  it('reconoce ADD CONSTRAINT con y sin NOT VALID', () => {
    const [withNotValid] = parseMigration(
      'ALTER TABLE "accounts" ADD CONSTRAINT "chk" CHECK (code IS NOT NULL) NOT VALID;',
    )
    const [withoutNotValid] = parseMigration(
      'ALTER TABLE "accounts" ADD CONSTRAINT "chk" CHECK (code IS NOT NULL);',
    )
    expect(withNotValid?.flags.hasNotValid).toBe(true)
    expect(withNotValid?.blocksWrites).toBe(false)
    expect(withoutNotValid?.flags.hasNotValid).toBe(false)
    expect(withoutNotValid?.blocksWrites).toBe(true)
  })

  it('marca TRUNCATE y DROP TABLE como ACCESS EXCLUSIVE', () => {
    const [truncate] = parseMigration('TRUNCATE "accounts";')
    const [drop] = parseMigration('DROP TABLE "accounts";')
    expect(truncate?.kind).toBe('truncate')
    expect(truncate?.lockLevel).toBe('access-exclusive')
    expect(drop?.kind).toBe('drop-table')
  })

  it('marca sentencias no reconocidas como unknown en vez de fallar', () => {
    const [statement] = parseMigration('COMMENT ON TABLE "accounts" IS \'nota\';')
    expect(statement?.kind).toBe('unknown')
  })

  it('detecta múltiples acciones en un mismo ALTER TABLE', () => {
    const [statement] = parseMigration(
      'ALTER TABLE "accounts" ADD COLUMN "a" int, ADD COLUMN "b" int;',
    )
    expect(statement?.flags.hasMultipleActions).toBe(true)
  })

  it('rechaza migraciones que exceden el máximo de caracteres', () => {
    const huge = `CREATE TABLE "a" (id int);`.repeat(20_000)
    expect(() => parseMigration(huge)).toThrow(EngineError)
  })
})
