import type { Scenario } from './types'

/**
 * Catálogo de escenarios versionados. Todo el SQL es de ejemplo, escrito
 * para esta demo: ningún fixture contiene datos ni nombres de una base de
 * datos real (08-seguridad-privacidad.md: "los fixtures públicos nunca
 * contienen datos reales").
 */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'happy-path',
    label: 'Camino feliz: columna + índice + check',
    description:
      'Migración aditiva: nueva columna nullable, índice construido con CONCURRENTLY y una restricción CHECK añadida con NOT VALID. Ningún hallazgo crítico.',
    category: 'happy-path',
    mode: 'migration',
    sql: `-- Añade contacto opcional a pedidos y un índice para buscarlo
ALTER TABLE "orders" ADD COLUMN "customer_email" text;

CREATE INDEX CONCURRENTLY "idx_orders_customer_email" ON "orders" ("customer_email");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_customer_email_format"
  CHECK (customer_email IS NULL OR customer_email LIKE '%@%') NOT VALID;
`,
  },
  {
    id: 'not-null-boundary',
    label: 'Frontera: NOT NULL con y sin DEFAULT',
    description:
      'Dos ADD COLUMN casi idénticos: uno con DEFAULT constante (seguro desde PostgreSQL 11) y otro sin DEFAULT (falla en tablas con filas). Compara ambos resultados.',
    category: 'boundary',
    mode: 'migration',
    sql: `ALTER TABLE "accounts" ADD COLUMN "tier" text NOT NULL DEFAULT 'free';

ALTER TABLE "accounts" ADD COLUMN "referral_code" text NOT NULL;
`,
  },
  {
    id: 'adversarial-quoting',
    label: 'Adversarial: comentarios, comillas y dollar-quoting hostiles',
    description:
      'SQL diseñado para confundir un separador de sentencias ingenuo: punto y coma dentro de comentarios, cadenas y bloques $$...$$, además de un DROP TABLE real al final. Nunca se ejecuta, solo se analiza como texto.',
    category: 'adversarial',
    mode: 'migration',
    sql: `-- Comentario con ; punto y coma dentro de un comentario, no debe partir la sentencia
CREATE TABLE "legacy_notes" (id integer, body text); -- otro comentario con ;

ALTER TABLE "products" ADD COLUMN "description" text DEFAULT '); DROP TABLE "products"; --';

CREATE OR REPLACE FUNCTION noop_trigger() RETURNS trigger AS $$
BEGIN
  -- cuerpo con ; dentro de dollar-quoting: tampoco debe partir la sentencia
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TABLE "products";
`,
  },
  {
    id: 'adapter-demo',
    label: 'Verificación con motor real (adaptador desactivado)',
    description:
      'Simula pedir el análisis a un motor externo real (p. ej. EXPLAIN contra una base real). Está desactivado por diseño (kill switch): la demo cae automáticamente al motor de reglas determinista.',
    category: 'dependency-down',
    mode: 'migration',
    requiresAdapter: true,
    sql: `ALTER TABLE "invoices" ADD COLUMN "notes" text;
`,
  },
  {
    id: 'empty-input',
    label: 'Entrada inválida: SQL vacío',
    description:
      'No hay SQL que analizar. Debe fallar de forma controlada y explicada, sin bloquear la interfaz ni perder la edición.',
    category: 'invalid-input',
    mode: 'migration',
    sql: '',
  },
  {
    id: 'compare-schemas',
    label: 'Comparar dos schemas',
    description:
      'Compara un "before" y un "after" de CREATE TABLE: columna añadida, columna eliminada y cambio de tipo. Genera automáticamente las sentencias ALTER equivalentes.',
    category: 'happy-path',
    mode: 'compare',
    before: `CREATE TABLE "customers" (
  id integer PRIMARY KEY,
  full_name text NOT NULL,
  signup_source varchar(50),
  legacy_score integer,
  legacy_flag boolean
);
`,
    after: `CREATE TABLE "customers" (
  id integer PRIMARY KEY,
  full_name text NOT NULL,
  signup_source varchar(50),
  legacy_score bigint,
  lifetime_value_cents integer NOT NULL DEFAULT 0
);
`,
  },
] as const

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id)
}

export const DEFAULT_SCENARIO_ID = 'happy-path'
export const CUSTOM_SCENARIO_ID = 'custom-input'
