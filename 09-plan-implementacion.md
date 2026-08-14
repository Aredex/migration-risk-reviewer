<!-- generated-by: $proyecto-portafolio; date: 2026-08-14 -->

# 09 · Plan de implementación

**Proyecto:** Migration Risk Reviewer  
**Decisión:** GO  
**Versión del paquete:** 0.1 · 2026-08-14

## Ruta crítica

Contrato → motor puro → fixture adversarial → experiencia 30/90 s → accesibilidad/pruebas → publicación → caso de estudio.

## Fases

### F0 — Base y contratos (2 h)

- <code>P15-T01</code> crear repositorio, TypeScript estricto, lint y tests.
- <code>P15-T02</code> implementar schemas de entrada/salida y fixtures mínimos.
- <code>P15-T03</code> montar shell visual y tokens.

### F1 — Corte vertical principal (35% de 10–14 h)

- `P15-T04` implementar P15-R1: analizar operaciones DDL.
- `P15-T05` implementar P15-R2: clasificar locks y reescrituras.
- Añadir caso feliz, error tipado y evidencia exportable.

### F2 — Robustez del dominio (25%)

- `P15-T06` implementar P15-R3: proponer expand-contract.
- `P15-T07` implementar P15-R4: generar rollback y verificación.
- Añadir límites, cancelación, fixture adversarial y fallback.

### F3 — Experiencia pública (20%)

- Implementar recorrido 30/90 segundos y copy definitivo.
- Responsive, navegación por teclado, foco, estados y alternativa textual.
- Capturas automatizadas y guion de demo.

### F4 — Producción (20%)

- CI, pruebas completas, budgets de rendimiento y seguridad.
- Preview, smoke test, producción, rollback y caso de estudio.

## Dependencias

F1 depende de contratos; F2 puede avanzar junto a la UI únicamente después de estabilizar interfaces. Máximo tres workers: dominio, UI y calidad, sin compartir archivos en paralelo.

## Definición de listo

Requisito con ID, aceptación, fixture, contrato y diseño identificado.

## Definición de terminado

Código revisado, pruebas verdes, error/empty/loading, accesibilidad manual, evidencia generada, documentación y preview verificadas.

## Riesgos de ejecución

- **dependencia de versión PostgreSQL:** disparador observable; mitigación: fixture adversarial, validación explícita, mensaje accionable y prueba de regresión.
- **parser incompleto:** disparador observable; mitigación: fixture adversarial, validación explícita, mensaje accionable y prueba de regresión.
- **recomendaciones sin tamaño real:** disparador observable; mitigación: fixture adversarial, validación explícita, mensaje accionable y prueba de regresión.
- **rollback imposible:** disparador observable; mitigación: fixture adversarial, validación explícita, mensaje accionable y prueba de regresión.
- **SQL sensible pegado:** disparador observable; mitigación: procesamiento local, aviso previo, no telemetría de payloads y borrado explícito.

## Primera tarea exacta

Crear el repositorio de <code>migration-risk-reviewer</code>, configurar TypeScript estricto y convertir <code>contracts/input.schema.json</code> y <code>contracts/output.schema.json</code> en tipos validados con un fixture feliz y uno inválido.
