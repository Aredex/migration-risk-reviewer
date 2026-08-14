export function CaseStudy() {
  return (
    <section id="caso-de-estudio" className="section" aria-labelledby="case-heading">
      <div className="container">
        <h2 id="case-heading">Caso de estudio</h2>
        <ol className="decisions-list">
          <li>
            <strong>Problema:</strong> migraciones aparentemente simples pueden bloquear escrituras,
            reescribir tablas o romper despliegues compatibles.
          </li>
          <li>
            <strong>Restricción:</strong> demostrarlo sin VPS, sin datos privados y sin dependencia
            permanente.
          </li>
          <li>
            <strong>Decisión:</strong> aplicación 100% estática — parser DDL propio y motor de
            reglas en TypeScript, ejecutados en un Web Worker. Sin backend propio, sin ejecutar SQL
            real.
          </li>
          <li>
            <strong>Prueba:</strong> acción pública reproducible, fixtures adversariales
            versionados, contratos de entrada/salida y una suite de pruebas (unitarias, de contrato,
            de integración y E2E).
          </li>
          <li>
            <strong>Resultado:</strong> solo se publican métricas obtenidas después de pruebas
            reales; nada se afirma sin evidencia.
          </li>
        </ol>
        <p>
          Sustituto de las "cinco pruebas observadas": no hubo usuarios humanos disponibles durante
          el desarrollo. En su lugar, un recorrido E2E (Playwright) automatiza el camino feliz de
          30/90 segundos más dos casos límite/adversariales (SQL con
          comentarios/comillas/dollar-quoting hostiles y el caso de entrada vacía) como sustituto
          reproducible.
        </p>
      </div>
    </section>
  )
}
