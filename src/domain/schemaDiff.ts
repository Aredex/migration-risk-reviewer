import { EngineError } from '../contracts/errors'
import {
  IDENTIFIER,
  MAX_SQL_LENGTH,
  normalizeStatement,
  parseSyntheticStatements,
  splitStatements,
  splitTopLevelCommas,
} from './parser'
import type { MigrationStatement } from './types'

/**
 * Comparación de schemas (modo "compare" del PRD: "comparar schemas ...").
 * Extrae columnas de las sentencias `CREATE TABLE` de dos scripts (antes/
 * después) y sintetiza las sentencias ALTER/CREATE/DROP equivalentes a la
 * diferencia, reutilizando después el mismo clasificador y motor de reglas
 * que `reviewMigration` (parser.ts, rules.ts). No es un parser de esquema
 * completo: ignora vistas, funciones y objetos que no sean CREATE TABLE.
 */

interface ColumnDefinition {
  readonly name: string
  readonly rawRest: string
}

interface TableDefinition {
  readonly name: string
  readonly raw: string
  readonly columns: readonly ColumnDefinition[]
}

function extractTableDefinition(raw: string): TableDefinition | null {
  const normalized = normalizeStatement(raw)
  const headerMatch = new RegExp(
    `^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${IDENTIFIER})\\s*\\(`,
    'i',
  ).exec(normalized)
  if (!headerMatch) return null
  const tableName = (headerMatch[1] ?? '').replace(/^"|"$/g, '')
  const openIndex = normalized.indexOf('(', headerMatch.index)
  if (openIndex === -1) return null

  let depth = 0
  let closeIndex = -1
  for (let i = openIndex; i < normalized.length; i += 1) {
    const ch = normalized[i]
    if (ch === '(') depth += 1
    if (ch === ')') {
      depth -= 1
      if (depth === 0) {
        closeIndex = i
        break
      }
    }
  }
  if (closeIndex === -1) return null

  const body = normalized.slice(openIndex + 1, closeIndex)
  const entries = splitTopLevelCommas(body)
  const columns: ColumnDefinition[] = []
  for (const entry of entries) {
    if (/^(CONSTRAINT\b|PRIMARY\s+KEY\b|UNIQUE\b|CHECK\b|FOREIGN\s+KEY\b|EXCLUDE\b)/i.test(entry)) {
      continue
    }
    const columnMatch = new RegExp(`^(${IDENTIFIER})\\s+(.*)$`, 'i').exec(entry)
    if (!columnMatch) continue
    const name = (columnMatch[1] ?? '').replace(/^"|"$/g, '')
    const rawRest = (columnMatch[2] ?? '').trim()
    columns.push({ name, rawRest })
  }

  return { name: tableName, raw, columns }
}

function extractTables(sql: string): Map<string, TableDefinition> {
  const tables = new Map<string, TableDefinition>()
  for (const raw of splitStatements(sql)) {
    const normalized = normalizeStatement(raw)
    if (!/^CREATE\s+TABLE\b/i.test(normalized)) continue
    const definition = extractTableDefinition(raw)
    if (definition) tables.set(definition.name, definition)
  }
  return tables
}

function columnType(rawRest: string): string {
  const match = /^([\w.]+(?:\s*\([^)]*\))?(?:\s*\[\s*\])?)/i.exec(rawRest)
  return (match?.[1] ?? rawRest).trim().toLowerCase()
}

/** Genera las sentencias ALTER/CREATE/DROP TABLE sintéticas que reproducen
 * la diferencia entre dos scripts de `CREATE TABLE`. */
export function diffSchemas(beforeSql: string, afterSql: string): MigrationStatement[] {
  if (beforeSql.length > MAX_SQL_LENGTH || afterSql.length > MAX_SQL_LENGTH) {
    throw new EngineError(
      'LIMIT_EXCEEDED',
      `Cada schema debe tener como máximo ${MAX_SQL_LENGTH.toLocaleString('es')} caracteres.`,
      ['$.payload'],
    )
  }

  const before = extractTables(beforeSql)
  const after = extractTables(afterSql)
  const synthetic: string[] = []

  for (const [name, definition] of after) {
    if (!before.has(name)) {
      synthetic.push(
        definition.raw.trim().endsWith(';') ? definition.raw.trim() : `${definition.raw.trim()};`,
      )
    }
  }

  for (const [name] of before) {
    if (!after.has(name)) {
      synthetic.push(`DROP TABLE "${name}";`)
    }
  }

  for (const [name, afterTable] of after) {
    const beforeTable = before.get(name)
    if (!beforeTable) continue

    const beforeColumns = new Map(beforeTable.columns.map((column) => [column.name, column]))
    const afterColumns = new Map(afterTable.columns.map((column) => [column.name, column]))

    for (const [columnName, column] of afterColumns) {
      if (!beforeColumns.has(columnName)) {
        synthetic.push(`ALTER TABLE "${name}" ADD COLUMN "${columnName}" ${column.rawRest};`)
      }
    }

    for (const [columnName] of beforeColumns) {
      if (!afterColumns.has(columnName)) {
        synthetic.push(`ALTER TABLE "${name}" DROP COLUMN "${columnName}";`)
      }
    }

    for (const [columnName, afterColumn] of afterColumns) {
      const beforeColumn = beforeColumns.get(columnName)
      if (!beforeColumn) continue

      const beforeType = columnType(beforeColumn.rawRest)
      const afterType = columnType(afterColumn.rawRest)
      if (beforeType !== afterType) {
        synthetic.push(`ALTER TABLE "${name}" ALTER COLUMN "${columnName}" TYPE ${afterType};`)
      }

      const beforeNotNull = /NOT\s+NULL/i.test(beforeColumn.rawRest)
      const afterNotNull = /NOT\s+NULL/i.test(afterColumn.rawRest)
      if (!beforeNotNull && afterNotNull) {
        synthetic.push(`ALTER TABLE "${name}" ALTER COLUMN "${columnName}" SET NOT NULL;`)
      } else if (beforeNotNull && !afterNotNull) {
        synthetic.push(`ALTER TABLE "${name}" ALTER COLUMN "${columnName}" DROP NOT NULL;`)
      }
    }
  }

  return parseSyntheticStatements(synthetic)
}
