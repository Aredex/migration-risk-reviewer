<!-- generated-by: $proyecto-portafolio; date: 2026-08-14 -->

# 13 · Presentación de portafolio

**Proyecto:** Migration Risk Reviewer  
**Decisión:** GO  
**Versión del paquete:** 0.1 · 2026-08-14

## Titular

**Migration Risk Reviewer: Prioriza operación segura y despliegue expand-contract sobre estilo SQL.**

## Caso de estudio

1. Problema: migraciones aparentemente simples pueden bloquear escrituras, reescribir tablas o romper despliegues compatibles.
2. Restricción: demostrarlo sin VPS, datos privados ni dependencia permanente.
3. Decisión: La aplicación es estática: lógica en TypeScript dentro del navegador, procesamiento pesado en Web Worker y persistencia opcional local. No existe backend público ni datos enviados fuera del dispositivo.
4. Prueba: acción pública, fixtures adversariales, contratos y suite reproducible.
5. Resultado: publicar solo métricas obtenidas después de pruebas reales.

## Guion de demo (60–90 s)

- **0–10 s:** “Este proyecto hace visible un fallo que normalmente aparece tarde.”
- **10–30 s:** ejecutar fixture: comparar schemas o pegar una migración y recibir riesgos, fases y rollback.
- **30–55 s:** abrir una decisión, su evidencia y corrección.
- **55–75 s:** cambiar un parámetro y demostrar resultado distinto.
- **75–90 s:** mostrar contratos, pruebas y arquitectura sin VPS.

## Capturas

1. Workbench antes de ejecutar.
2. Resultado con evidencia abierta.
3. Caso adversarial o comparación.
4. Diagrama de arquitectura.
5. Test/contrato que prueba la promesa central.

## README público

Problema, demo, inicio local, arquitectura, fixtures, comandos, seguridad, accesibilidad, límites honestos y decisiones. Evitar badges sin valor y listas de tecnologías sin explicar decisiones.

## Textos reutilizables

### Malt

“Diseñé Migration Risk Reviewer, una demo interactiva para migraciones aparentemente simples pueden bloquear escrituras, reescribir tablas o romper despliegues compatibles. Incluye React, TypeScript, PostgreSQL parser, escenarios reproducibles y despliegue sin servidor dedicado.”

### Upwork

“Tengo una muestra pública relacionada: Migration Risk Reviewer. Permite comparar schemas o pegar una migración y recibir riesgos, fases y rollback e incluye contratos, casos adversariales y pruebas. Puedo compartir el enlace y explicar qué parte se adapta a su alcance.”

### LinkedIn

“Convertí un problema difícil de enseñar —migraciones aparentemente simples pueden bloquear escrituras, reescribir tablas o romper despliegues compatibles— en una demo que se puede probar en menos de 90 segundos. Próximamente publicaré decisiones, fallos encontrados y evidencia reproducible; no métricas inventadas.”
