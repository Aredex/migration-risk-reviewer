<!-- generated-by: $proyecto-portafolio; date: 2026-08-14 -->

# 06 · Modelo de datos

**Proyecto:** Migration Risk Reviewer  
**Decisión:** GO  
**Versión del paquete:** 0.1 · 2026-08-14

## Entidades

| Entidad              | Propósito             | Invariantes                                   |
| -------------------- | --------------------- | --------------------------------------------- |
| `SchemaSnapshot`     | raíz de una ejecución | ID estable, versión y timestamps normalizados |
| `MigrationStatement` | dato de dominio 1     | ID estable, versión y timestamps normalizados |
| `RiskFinding`        | dato de dominio 2     | ID estable, versión y timestamps normalizados |
| `RolloutPhase`       | dato de dominio 3     | ID estable, versión y timestamps normalizados |
| `RollbackStep`       | dato de dominio 4     | ID estable, versión y timestamps normalizados |

```mermaid
erDiagram
    SchemaSnapshot ||--o{ MigrationStatement : relates
    MigrationStatement ||--o{ RiskFinding : relates
    RiskFinding ||--o{ RolloutPhase : relates
    RolloutPhase ||--o{ RollbackStep : relates
```

## Persistencia

No se necesita base remota. La configuración puede guardarse en IndexedDB bajo consentimiento; por defecto la sesión vive en memoria y se puede borrar con una acción visible.

## Esquema lógico común

- <code>run</code>: <code>id</code>, <code>projectVersion</code>, <code>rulesVersion</code>, <code>scenarioId</code>, <code>status</code>, <code>startedAt</code>, <code>completedAt</code>.
- <code>input</code>: <code>schemaVersion</code>, <code>payloadFingerprint</code>, <code>payload</code> solo local.
- <code>finding</code>: <code>ruleId</code>, <code>severity</code>, <code>message</code>, <code>evidencePath</code>, <code>suggestion</code>.
- <code>export</code>: <code>runId</code>, <code>summary</code>, <code>findings</code>, <code>assumptions</code>; nunca secretos.

## Índices y límites

- Índice compuesto por <code>scenarioId + startedAt</code> cuando exista persistencia.
- Índice único por <code>runId</code>; TTL de siete días para demo serverless.
- Máximo 1.000 hallazgos visibles; truncado explícito y total informado.
- Exportación máxima 5 MB.

## Migraciones

Los schemas llevan <code>schemaVersion</code>. Migraciones locales son incrementales y reversibles; una versión desconocida se abre en solo lectura. D1 usa migraciones numeradas y smoke test antes de promoción.

## Retención

- Memoria: hasta recarga o borrado.
- IndexedDB: opt-in y botón “Eliminar datos locales”.
- Serverless: solo fixtures/hashes, TTL siete días, sin cuentas de usuario.
