# Migration Risk Reviewer

Pega una migración SQL de PostgreSQL o compara dos schemas (`CREATE TABLE`) y recibe los riesgos de
locks/reescrituras de tabla, un plan expand-contract por fases y su rollback y verificación. Parser
DDL propio en un Web Worker: **nunca ejecuta SQL**, solo lo analiza como texto.

**Demo:** https://migration-risk-reviewer.pages.dev (se activará `https://migration-risk-reviewer.alexcuesta.dev` cuando el dominio quede enlazado)
**Repositorio:** https://github.com/Aredex/migration-risk-reviewer

## El problema

Una migración con buena pinta —`ADD COLUMN`, `CREATE INDEX`, `ALTER TYPE`— puede bloquear
escrituras durante minutos, reescribir una tabla completa o romper un despliegue compatible con
versiones anteriores. Son riesgos que no aparecen en una revisión superficial del SQL: hace falta
conocer qué lock toma cada sentencia en PostgreSQL y si reescribe la tabla. Esta demo hace ese
análisis visible y reproducible, sin ejecutar nada contra una base real.

## Aviso de privacidad (léelo antes de pegar SQL propio)

- El análisis completo ocurre **en tu navegador**, en un Web Worker dedicado. Ningún SQL que pegues
  sale de tu dispositivo: no hay backend propio ni telemetría de contenido.
- Evita incluir datos reales de producción, claves o tokens embebidos en literales dentro del SQL
  que pegues. Como defensa adicional, cualquier literal de texto largo se **redacta** al exportar
  un informe (`src/lib/redact.ts`).
- Esta herramienta **no certifica que una migración sea segura de aplicar en producción**: solo
  reporta los hallazgos de reglas estáticas basadas en la documentación de PostgreSQL.
- Hay un botón explícito **"Eliminar datos locales"** para borrar cualquier historial opcional
  guardado en IndexedDB bajo consentimiento.

## Demo de 30/90 segundos

- **30 s:** abre la app, hay un fixture precargado (`happy-path`) y un CTA "Ejecutar escenario". Al
  ejecutar, ves cada sentencia clasificada con su nivel de lock y si reescribe la tabla.
- **90 s:** abre un hallazgo para ver su evidencia y sugerencia, revisa el plan expand-contract con
  su rollback y verificación, cambia de escenario para ver un resultado distinto, y exporta el
  informe en JSON o Markdown.

## Inicio local

Requiere Node 24 y pnpm 10 (`packageManager` fijado en `package.json`).

```bash
pnpm install
pnpm dev            # http://localhost:5173
pnpm build           # build de producción a dist/
pnpm preview          # sirve dist/ en 127.0.0.1:20374
pnpm typecheck        # tsc -b (proyectos referenciados: app/worker/tests/e2e/node)
pnpm lint             # eslint (typescript-eslint + jsx-a11y + react-hooks)
pnpm test              # vitest: unitarias + contrato
pnpm test:e2e            # playwright (compila y sirve dist/ primero)
```

## Arquitectura

Aplicación 100% estática: sin backend propio, sin datos que salgan del dispositivo.

```
Visitante → React (workbench) → Web Worker (parser + motor de reglas) → fixtures versionados
```

- `src/domain/parser.ts`: tokenizador consciente de comillas/comentarios/dollar-quoting que separa
  un script SQL en sentencias, más un clasificador basado en expresiones regulares (no un parser
  SQL completo; ver "Límites honestos").
- `src/domain/rules.ts`: clasifica cada sentencia reconocida en un nivel de lock PostgreSQL, si
  reescribe la tabla y si bloquea escrituras, con severidad y sugerencia (P15-R1/R2).
- `src/domain/schemaDiff.ts`: modo "comparar schemas" — extrae columnas de dos scripts
  `CREATE TABLE` y sintetiza las sentencias `ALTER TABLE` equivalentes a la diferencia.
- `src/domain/phases.ts`: agrupa las sentencias en fases expand → backfill → contract, con una fase
  adicional de revisión manual para lo que no encaja de forma segura en un bucket automático
  (P15-R3).
- `src/domain/rollback.ts`: genera el SQL de rollback (o explica por qué no es reversible) y las
  consultas de verificación de cada fase (P15-R4).
- `src/worker/`: parser + motor de reglas corren en un Web Worker dedicado (`analysis.worker.ts`),
  cancelable, para no bloquear el hilo principal.
- `src/fixtures/catalog.ts`: escenarios versionados (SQL de ejemplo, ningún dato real).
- `src/contracts/`: tipos y validadores manuales de `contracts/input.schema.json` y
  `contracts/output.schema.json` (ver más abajo por qué no usan `ajv` en producción).
- `src/ui/`: componentes de interfaz (React), sin decisiones de dominio.
- `src/storage/localHistory.ts`: historial local opcional en IndexedDB, bajo consentimiento
  explícito, con botón "Eliminar datos locales".

## Fixtures incluidos

| Escenario | Categoría | Qué demuestra |
|---|---|---|
| `happy-path` | camino feliz | migración aditiva: columna nullable, índice `CONCURRENTLY`, `CHECK NOT VALID` |
| `not-null-boundary` | frontera | `ADD COLUMN NOT NULL` con DEFAULT constante (seguro) vs sin DEFAULT (crítico) |
| `adversarial-quoting` | adversarial | comentarios/comillas/dollar-quoting hostiles + `DROP TABLE` real, sin ejecutar nada |
| `adapter-demo` | dependencia caída | adaptador a un motor real desactivado (kill switch) → fallback al motor de reglas |
| `empty-input` | entrada inválida | SQL vacío → error tipado recuperable |
| `compare-schemas` | camino feliz | modo "comparar schemas": columna añadida, eliminada y cambio de tipo |

## Contratos

`contracts/input.schema.json` y `contracts/output.schema.json` son la envolvente genérica
compartida por el portafolio (fuente de verdad para el flujo "ejecutar escenario"). El motor usa
validadores manuales (`src/contracts/validateInput.ts`, `validateOutput.ts`) en vez de `ajv` en
producción: `ajv.compile()` genera código con `new Function(...)`, incompatible con la CSP estricta
de `public/_headers` (`script-src 'self'`, sin `unsafe-eval`). `ajv` sí se usa —solo en pruebas—
para verificar que los validadores manuales no diverjan del JSON Schema
(`tests/contract/schema-fixtures.test.ts`). El resultado rico de dominio (`MigrationAnalysis`:
sentencias, fases, rollback, verificación) es lo que consume la interfaz directamente; se proyecta
al contrato genérico (`toEngineOutput.ts`) para la exportación y las pruebas de contrato, tal como
describen las interfaces de dominio `reviewMigration(sql)`, `compareSchemas(before, after)` y
`exportPlan()` de `07-contratos-interfaces.md`.

## Seguridad

- CSP restrictiva (`script-src 'self'`, `worker-src 'self'`), `frame-ancestors 'none'`, `nosniff` y
  `Referrer-Policy` en `public/_headers` (convención de Cloudflare Pages).
- Nunca se usa `innerHTML` con entrada del visitante ni se ejecuta el SQL pegado.
- Nunca se registran payloads/SQL (ni en consola, ni en analítica: esta demo no tiene analítica de
  terceros).
- La exportación redacta literales de texto largos dentro del SQL como defensa en profundidad
  (`src/lib/redact.ts`) y descarga vía el atributo `download` del navegador (equivalente estático de
  `Content-Disposition: attachment`; no hay servidor propio que fije esa cabecera).
- Límite de frecuencia del lado del cliente y timeout duro sobre la ejecución del Worker
  (`src/worker/workerClient.ts`); el adaptador externo opcional queda desactivado por diseño
  (`src/adapter/externalAdapter.ts`, kill switch sin UI para reactivarlo).
- Límites de tamaño/cantidad de entrada (`MAX_SQL_LENGTH`, `MAX_STATEMENTS`) validados antes de
  parsear, con el código de error tipado `LIMIT_EXCEEDED`.
- Dependencias fijadas vía `pnpm-lock.yaml` (comiteado).

## Accesibilidad

HTML nativo con landmarks y encabezados coherentes, foco visible, navegación completa por teclado,
`aria-live` para anunciar cambios de estado, hallazgos con severidad textual (no depende solo del
color) y `prefers-reduced-motion` respetado. Verificado con `@axe-core/playwright` en CI
(`e2e/accessibility.spec.ts`) contra violaciones críticas/serias.

## Límites honestos

- El parser reconoce un subconjunto de DDL de PostgreSQL (tablas, columnas, índices, tipos,
  restricciones). Lo que no reconoce se marca `unknown-statement` para revisión manual en vez de
  asumirse seguro; un `ALTER TABLE` con varias acciones separadas por coma solo clasifica la
  primera (aviso `multi-action-partial-analysis`).
- Los niveles de lock y las reescrituras se estiman con reglas estáticas de la documentación de
  PostgreSQL, no con un `EXPLAIN` real ni el tamaño real de las tablas del visitante.
- El modo "comparar schemas" solo entiende sentencias `CREATE TABLE`; vistas, funciones y otros
  objetos se ignoran en el diff.
- No hay "cinco pruebas observadas" con usuarios humanos: el sustituto documentado es la suite E2E
  de Playwright (`e2e/`), que recorre el camino feliz de 30/90 s más los casos adversarial y de
  entrada inválida. Ver `13-presentacion-portafolio.md` para el detalle.
- Esta herramienta **no certifica que una migración sea segura de aplicar en producción**.

## Decisiones

- **Sin VPS:** Cloudflare Pages; GitHub Pages como salida alternativa. Menor carga operativa a
  cambio de límites de plataforma (ADR-001, `05-arquitectura-tecnica.md`).
- **Núcleo funcional puro:** las reglas de dominio son funciones TS puras y tipadas; React solo
  orquesta la interacción (ADR-002).
- **Fixtures como fallback:** cuando el adaptador real está desactivado (siempre, en esta demo), la
  app cae automáticamente al motor de reglas determinista (ADR-003).
- **Sin cuentas en v1:** menor riesgo y tiempo de desarrollo (ADR-004).

El paquete de especificación completo (`00`–`16`) y los contratos (`contracts/`) se mantienen en
este repositorio como documentación de diseño; el orden de lectura sugerido está en
`16-plan-maestro.md`.

## Licencia

Proyecto de portafolio personal. Código disponible para revisión técnica.
