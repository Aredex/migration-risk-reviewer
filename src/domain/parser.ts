import { EngineError } from '../contracts/errors'
import type { MigrationStatement, StatementFlags, StatementKind } from './types'

/**
 * Parser DDL propio, no ejecuta SQL: solo separa sentencias y reconoce su
 * forma (05-arquitectura-tecnica.md: "PostgreSQL parser"; 16-plan-maestro.md:
 * "no ejecuta SQL real, solo lo analiza"). No es un parser SQL completo: es
 * un tokenizador consciente de comillas/comentarios para separar sentencias
 * de forma segura, más un clasificador basado en expresiones regulares sobre
 * la forma canónica de cada sentencia. Sentencias que no reconoce se marcan
 * `unknown` y generan un hallazgo de revisión manual (mitigación del riesgo
 * "parser incompleto" de 08-seguridad-privacidad.md) en vez de fallar.
 */

export const MAX_SQL_LENGTH = 200_000
export const MAX_STATEMENTS = 500

/** Separa un script SQL en sentencias individuales respetando cadenas de
 * texto ('...', "..."), comentarios (--... y /* ... *\/) y bloques
 * dollar-quoted ($$...$$ o $tag$...$tag$) usados por funciones/triggers, que
 * no debemos partir por los `;` que puedan contener. */
export function splitStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let i = 0
  const n = sql.length

  type State = 'normal' | 'single' | 'double' | 'line-comment' | 'block-comment' | 'dollar'
  let state: State = 'normal'
  let dollarTag = ''

  while (i < n) {
    const ch = sql[i] ?? ''
    const next = sql[i + 1] ?? ''

    if (state === 'normal') {
      if (ch === '-' && next === '-') {
        state = 'line-comment'
        current += ch + next
        i += 2
        continue
      }
      if (ch === '/' && next === '*') {
        state = 'block-comment'
        current += ch + next
        i += 2
        continue
      }
      if (ch === "'") {
        state = 'single'
        current += ch
        i += 1
        continue
      }
      if (ch === '"') {
        state = 'double'
        current += ch
        i += 1
        continue
      }
      if (ch === '$') {
        const tagMatch = /^\$[a-zA-Z_][a-zA-Z0-9_]*\$|^\$\$/.exec(sql.slice(i))
        if (tagMatch) {
          dollarTag = tagMatch[0]
          state = 'dollar'
          current += dollarTag
          i += dollarTag.length
          continue
        }
      }
      if (ch === ';') {
        const trimmed = current.trim()
        if (trimmed.length > 0) statements.push(trimmed)
        current = ''
        i += 1
        continue
      }
      current += ch
      i += 1
      continue
    }

    if (state === 'line-comment') {
      current += ch
      if (ch === '\n') state = 'normal'
      i += 1
      continue
    }

    if (state === 'block-comment') {
      current += ch
      if (ch === '*' && next === '/') {
        current += next
        i += 2
        state = 'normal'
        continue
      }
      i += 1
      continue
    }

    if (state === 'single') {
      current += ch
      if (ch === "'" && next === "'") {
        current += next
        i += 2
        continue
      }
      if (ch === "'") state = 'normal'
      i += 1
      continue
    }

    if (state === 'double') {
      current += ch
      if (ch === '"' && next === '"') {
        current += next
        i += 2
        continue
      }
      if (ch === '"') state = 'normal'
      i += 1
      continue
    }

    if (state === 'dollar') {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag
        i += dollarTag.length
        state = 'normal'
        dollarTag = ''
        continue
      }
      current += ch
      i += 1
      continue
    }
  }

  const trimmedTail = current.trim()
  if (trimmedTail.length > 0) statements.push(trimmedTail)

  return statements
}

/** Elimina comentarios de una sentencia ya separada, para que el
 * clasificador basado en regex no se confunda con palabras clave dentro de
 * comentarios. No toca literales entre comillas. */
function stripComments(statement: string): string {
  let result = ''
  let i = 0
  const n = statement.length
  let inSingle = false
  let inDouble = false
  while (i < n) {
    const ch = statement[i] ?? ''
    const next = statement[i + 1] ?? ''
    if (!inSingle && !inDouble && ch === '-' && next === '-') {
      const newline = statement.indexOf('\n', i)
      i = newline === -1 ? n : newline
      continue
    }
    if (!inSingle && !inDouble && ch === '/' && next === '*') {
      const end = statement.indexOf('*/', i + 2)
      i = end === -1 ? n : end + 2
      continue
    }
    if (!inDouble && ch === "'") inSingle = !inSingle
    if (!inSingle && ch === '"') inDouble = !inDouble
    result += ch
    i += 1
  }
  return result
}

function normalize(statement: string): string {
  return stripComments(statement).replace(/\s+/g, ' ').trim()
}

/** Divide una cláusula por comas de nivel superior (fuera de paréntesis y
 * comillas). Usado para detectar `ALTER TABLE ... ADD COLUMN a int, ADD
 * COLUMN b int` (varias acciones en una sola sentencia). */
function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  let inSingle = false
  for (const ch of text) {
    if (ch === "'" && !inSingle) inSingle = true
    else if (ch === "'" && inSingle) inSingle = false
    if (!inSingle) {
      if (ch === '(') depth += 1
      if (ch === ')') depth -= 1
    }
    if (ch === ',' && depth === 0 && !inSingle) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim().length > 0) parts.push(current.trim())
  return parts
}

const IDENTIFIER = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*)`

function extractIdentifier(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text)
  const raw = match?.[1]
  return raw ? raw.replace(/^"|"$/g, '') : null
}

const VOLATILE_DEFAULT_PATTERN =
  /DEFAULT\s+(now\s*\(|clock_timestamp\s*\(|random\s*\(|gen_random_uuid\s*\(|uuid_generate_v4\s*\(|nextval\s*\()/i

interface AlterClauseResult {
  readonly kind: StatementKind
  readonly column: string | null
  readonly constraintName: string | null
  readonly newName: string | null
  readonly hasNotValid: boolean
}

function classifyAlterClause(clause: string): AlterClauseResult {
  const notValid = /\bNOT\s+VALID\b/i.test(clause)

  if (/^VALIDATE\s+CONSTRAINT\b/i.test(clause)) {
    return {
      kind: 'alter-table-validate-constraint',
      column: null,
      constraintName: extractIdentifier(
        clause,
        new RegExp(`^VALIDATE\\s+CONSTRAINT\\s+(${IDENTIFIER})`, 'i'),
      ),
      newName: null,
      hasNotValid: notValid,
    }
  }
  if (/^RENAME\s+COLUMN\b/i.test(clause)) {
    const match = new RegExp(
      `^RENAME\\s+COLUMN\\s+(${IDENTIFIER})\\s+TO\\s+(${IDENTIFIER})`,
      'i',
    ).exec(clause)
    return {
      kind: 'alter-table-rename-column',
      column: match?.[1]?.replace(/^"|"$/g, '') ?? null,
      constraintName: null,
      newName: match?.[2]?.replace(/^"|"$/g, '') ?? null,
      hasNotValid: notValid,
    }
  }
  if (/^RENAME\s+TO\b/i.test(clause)) {
    return {
      kind: 'alter-table-rename-table',
      column: null,
      constraintName: null,
      newName: extractIdentifier(clause, new RegExp(`^RENAME\\s+TO\\s+(${IDENTIFIER})`, 'i')),
      hasNotValid: notValid,
    }
  }
  if (/^DROP\s+COLUMN\b/i.test(clause)) {
    return {
      kind: 'alter-table-drop-column',
      column: extractIdentifier(
        clause,
        new RegExp(`^DROP\\s+COLUMN\\s+(?:IF\\s+EXISTS\\s+)?(${IDENTIFIER})`, 'i'),
      ),
      constraintName: null,
      newName: null,
      hasNotValid: notValid,
    }
  }
  if (/^ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?/i.test(clause)) {
    const withoutAdd = clause.replace(/^ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?/i, '')
    const looksLikeConstraint =
      /^(CONSTRAINT\b|PRIMARY\s+KEY\b|UNIQUE\b|CHECK\b|FOREIGN\s+KEY\b|EXCLUDE\b)/i.test(withoutAdd)
    if (!looksLikeConstraint) {
      const columnMatch = new RegExp(`^(${IDENTIFIER})`, 'i').exec(withoutAdd)
      return {
        kind: 'alter-table-add-column',
        column: columnMatch?.[1]?.replace(/^"|"$/g, '') ?? null,
        constraintName: null,
        newName: null,
        hasNotValid: notValid,
      }
    }
  }
  if (/^ADD\s+CONSTRAINT\b/i.test(clause)) {
    return {
      kind: 'alter-table-add-constraint',
      column: null,
      constraintName: extractIdentifier(
        clause,
        new RegExp(`^ADD\\s+CONSTRAINT\\s+(${IDENTIFIER})`, 'i'),
      ),
      newName: null,
      hasNotValid: notValid,
    }
  }
  if (/^ADD\s+(PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY|EXCLUDE)\b/i.test(clause)) {
    return {
      kind: 'alter-table-add-constraint',
      column: null,
      constraintName: null,
      newName: null,
      hasNotValid: notValid,
    }
  }
  if (/^ALTER\s+COLUMN\s+\S+\s+SET\s+NOT\s+NULL\b/i.test(clause)) {
    return {
      kind: 'alter-table-set-not-null',
      column: extractIdentifier(clause, new RegExp(`^ALTER\\s+COLUMN\\s+(${IDENTIFIER})`, 'i')),
      constraintName: null,
      newName: null,
      hasNotValid: notValid,
    }
  }
  if (/^ALTER\s+COLUMN\s+\S+\s+DROP\s+NOT\s+NULL\b/i.test(clause)) {
    return {
      kind: 'alter-table-drop-not-null',
      column: extractIdentifier(clause, new RegExp(`^ALTER\\s+COLUMN\\s+(${IDENTIFIER})`, 'i')),
      constraintName: null,
      newName: null,
      hasNotValid: notValid,
    }
  }
  if (/^ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i.test(clause)) {
    return {
      kind: 'alter-table-alter-type',
      column: extractIdentifier(clause, new RegExp(`^ALTER\\s+COLUMN\\s+(${IDENTIFIER})`, 'i')),
      constraintName: null,
      newName: null,
      hasNotValid: notValid,
    }
  }
  if (/^ALTER\s+COLUMN\s+\S+\s+SET\s+DEFAULT\b/i.test(clause)) {
    return {
      kind: 'alter-table-set-default',
      column: extractIdentifier(clause, new RegExp(`^ALTER\\s+COLUMN\\s+(${IDENTIFIER})`, 'i')),
      constraintName: null,
      newName: null,
      hasNotValid: notValid,
    }
  }
  if (/^ALTER\s+COLUMN\s+\S+\s+DROP\s+DEFAULT\b/i.test(clause)) {
    return {
      kind: 'alter-table-drop-default',
      column: extractIdentifier(clause, new RegExp(`^ALTER\\s+COLUMN\\s+(${IDENTIFIER})`, 'i')),
      constraintName: null,
      newName: null,
      hasNotValid: notValid,
    }
  }

  return {
    kind: 'alter-table-other',
    column: null,
    constraintName: null,
    newName: null,
    hasNotValid: notValid,
  }
}

function buildFlags(rawClause: string, hasMultipleActions: boolean): StatementFlags {
  return {
    hasConcurrently: /\bCONCURRENTLY\b/i.test(rawClause),
    hasNotValid: /\bNOT\s+VALID\b/i.test(rawClause),
    hasIfExists: /\bIF\s+EXISTS\b/i.test(rawClause),
    hasIfNotExists: /\bIF\s+NOT\s+EXISTS\b/i.test(rawClause),
    hasVolatileDefault: VOLATILE_DEFAULT_PATTERN.test(rawClause),
    hasMultipleActions,
  }
}

function classifyStatement(raw: string, normalized: string, index: number): MigrationStatement {
  const id = `stmt_${index + 1}`

  if (/^CREATE\s+TABLE\b/i.test(normalized)) {
    const table = extractIdentifier(
      normalized,
      new RegExp(`^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${IDENTIFIER})`, 'i'),
    )
    return {
      id,
      index,
      raw,
      kind: 'create-table',
      table,
      column: null,
      indexName: null,
      constraintName: null,
      newName: null,
      flags: buildFlags(normalized, false),
      lockLevel: 'none',
      rewritesTable: false,
      blocksWrites: false,
    }
  }

  if (/^DROP\s+TABLE\b/i.test(normalized)) {
    const table = extractIdentifier(
      normalized,
      new RegExp(`^DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(${IDENTIFIER})`, 'i'),
    )
    return {
      id,
      index,
      raw,
      kind: 'drop-table',
      table,
      column: null,
      indexName: null,
      constraintName: null,
      newName: null,
      flags: buildFlags(normalized, false),
      lockLevel: 'access-exclusive',
      rewritesTable: false,
      blocksWrites: true,
    }
  }

  if (/^TRUNCATE\b/i.test(normalized)) {
    const table = extractIdentifier(
      normalized,
      new RegExp(`^TRUNCATE\\s+(?:TABLE\\s+)?(${IDENTIFIER})`, 'i'),
    )
    return {
      id,
      index,
      raw,
      kind: 'truncate',
      table,
      column: null,
      indexName: null,
      constraintName: null,
      newName: null,
      flags: buildFlags(normalized, false),
      lockLevel: 'access-exclusive',
      rewritesTable: false,
      blocksWrites: true,
    }
  }

  if (/^CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(normalized)) {
    const concurrently = /\bCONCURRENTLY\b/i.test(normalized)
    const indexName = extractIdentifier(
      normalized,
      new RegExp(
        `^CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?(${IDENTIFIER})\\s+ON\\b`,
        'i',
      ),
    )
    const table = extractIdentifier(
      normalized,
      new RegExp(`\\bON\\s+(?:ONLY\\s+)?(${IDENTIFIER})`, 'i'),
    )
    return {
      id,
      index,
      raw,
      kind: concurrently ? 'create-index-concurrently' : 'create-index',
      table,
      column: null,
      indexName,
      constraintName: null,
      newName: null,
      flags: buildFlags(normalized, false),
      lockLevel: concurrently ? 'share-update-exclusive' : 'share',
      rewritesTable: false,
      blocksWrites: !concurrently,
    }
  }

  if (/^DROP\s+INDEX\b/i.test(normalized)) {
    const concurrently = /\bCONCURRENTLY\b/i.test(normalized)
    const indexName = extractIdentifier(
      normalized,
      new RegExp(
        `^DROP\\s+INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+EXISTS\\s+)?(${IDENTIFIER})`,
        'i',
      ),
    )
    return {
      id,
      index,
      raw,
      kind: concurrently ? 'drop-index-concurrently' : 'drop-index',
      table: null,
      column: null,
      indexName,
      constraintName: null,
      newName: null,
      flags: buildFlags(normalized, false),
      lockLevel: concurrently ? 'share-update-exclusive' : 'access-exclusive',
      rewritesTable: false,
      blocksWrites: !concurrently,
    }
  }

  if (/^CREATE\s+TYPE\b/i.test(normalized)) {
    const typeName = extractIdentifier(
      normalized,
      new RegExp(`^CREATE\\s+TYPE\\s+(${IDENTIFIER})`, 'i'),
    )
    return {
      id,
      index,
      raw,
      kind: 'create-type',
      table: typeName,
      column: null,
      indexName: null,
      constraintName: null,
      newName: null,
      flags: buildFlags(normalized, false),
      lockLevel: 'none',
      rewritesTable: false,
      blocksWrites: false,
    }
  }

  if (/^ALTER\s+TYPE\b/i.test(normalized)) {
    const typeName = extractIdentifier(
      normalized,
      new RegExp(`^ALTER\\s+TYPE\\s+(${IDENTIFIER})`, 'i'),
    )
    const addValue = /\bADD\s+VALUE\b/i.test(normalized)
    return {
      id,
      index,
      raw,
      kind: addValue ? 'alter-type-add-value' : 'alter-type-other',
      table: typeName,
      column: null,
      indexName: null,
      constraintName: null,
      newName: null,
      flags: buildFlags(normalized, false),
      lockLevel: 'access-exclusive',
      rewritesTable: false,
      blocksWrites: false,
    }
  }

  if (/^ALTER\s+TABLE\b/i.test(normalized)) {
    const table = extractIdentifier(
      normalized,
      new RegExp(`^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(${IDENTIFIER})`, 'i'),
    )
    const bodyMatch = new RegExp(
      `^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?${IDENTIFIER}\\s+(.*)$`,
      'i',
    ).exec(normalized)
    const body = bodyMatch?.[1] ?? ''
    const actions = splitTopLevelCommas(body)
    const firstAction = actions[0] ?? ''
    const result = classifyAlterClause(firstAction)
    return {
      id,
      index,
      raw,
      kind: result.kind,
      table,
      column: result.column,
      indexName: null,
      constraintName: result.constraintName,
      newName: result.newName,
      flags: buildFlags(normalized, actions.length > 1),
      lockLevel: lockLevelForAlterKind(result.kind),
      rewritesTable: rewritesTableForAlterKind(result.kind, normalized),
      blocksWrites: blocksWritesForAlterKind(result.kind, result.hasNotValid),
    }
  }

  return {
    id,
    index,
    raw,
    kind: 'unknown',
    table: null,
    column: null,
    indexName: null,
    constraintName: null,
    newName: null,
    flags: buildFlags(normalized, false),
    lockLevel: 'access-exclusive',
    rewritesTable: false,
    blocksWrites: true,
  }
}

function lockLevelForAlterKind(kind: StatementKind): MigrationStatement['lockLevel'] {
  // Todas las variantes de ALTER TABLE reconocidas toman ACCESS EXCLUSIVE
  // durante su (normalmente breve) fase de cambio de catálogo; la única
  // excepción es VALIDATE CONSTRAINT, que usa un lock más permisivo para no
  // bloquear escrituras mientras escanea las filas existentes.
  if (kind === 'alter-table-validate-constraint') return 'share-update-exclusive'
  return 'access-exclusive'
}

function rewritesTableForAlterKind(kind: StatementKind, normalized: string): boolean {
  if (kind === 'alter-table-alter-type') return true
  if (kind === 'alter-table-add-column') return VOLATILE_DEFAULT_PATTERN.test(normalized)
  return false
}

function blocksWritesForAlterKind(kind: StatementKind, hasNotValid: boolean): boolean {
  switch (kind) {
    case 'alter-table-validate-constraint':
      return false
    case 'alter-table-add-constraint':
      // NOT VALID evita el escaneo/lock largo de validación (ver rules.ts:
      // ADD_CONSTRAINT_NOT_VALID_OK vs ADD_CONSTRAINT_VALIDATION_LOCK).
      return !hasNotValid
    case 'alter-table-set-not-null':
      return true
    case 'alter-table-alter-type':
      return true
    case 'alter-table-drop-column':
      return true
    default:
      return !hasNotValid
  }
}

export function parseMigration(sql: string): MigrationStatement[] {
  if (sql.length > MAX_SQL_LENGTH) {
    throw new EngineError(
      'LIMIT_EXCEEDED',
      `La migración excede el máximo de ${MAX_SQL_LENGTH.toLocaleString('es')} caracteres soportado por esta demo.`,
      ['$.payload.sql'],
    )
  }

  const rawStatements = splitStatements(sql)
  if (rawStatements.length > MAX_STATEMENTS) {
    throw new EngineError(
      'LIMIT_EXCEEDED',
      `La migración tiene ${rawStatements.length} sentencias; el máximo soportado es ${MAX_STATEMENTS}.`,
      ['$.payload.sql'],
    )
  }

  return classifyRawStatements(rawStatements)
}

/** `splitStatements` separa por `;` sin entender el contenido; un fragmento
 * final formado solo por un comentario (p. ej. `-- nota` tras el último `;`
 * real) no es una sentencia y se descarta aquí para no generar un hallazgo
 * `unknown-statement` espurio. */
function classifyRawStatements(rawStatements: readonly string[]): MigrationStatement[] {
  const statements: MigrationStatement[] = []
  for (const raw of rawStatements) {
    const normalized = normalize(raw)
    if (normalized.length === 0) continue
    statements.push(classifyStatement(raw, normalized, statements.length))
  }
  return statements
}

/** Clasifica sentencias ya separadas y con `raw` completo (usado por
 * `schemaDiff.ts` para las sentencias ALTER/CREATE/DROP sintéticas que
 * genera al comparar dos schemas). No aplica límites de tamaño: la entrada
 * ya fue validada por `parseMigration`/`enginePayload.ts` antes de llegar
 * aquí. */
export function parseSyntheticStatements(rawStatements: readonly string[]): MigrationStatement[] {
  if (rawStatements.length > MAX_STATEMENTS) {
    throw new EngineError(
      'LIMIT_EXCEEDED',
      `La comparación produce ${rawStatements.length} cambios; el máximo soportado es ${MAX_STATEMENTS}.`,
      ['$.payload'],
    )
  }
  return classifyRawStatements(rawStatements)
}

export { IDENTIFIER, normalize as normalizeStatement, splitTopLevelCommas }
