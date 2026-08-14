export function HowItWorks() {
  return (
    <section id="como-funciona" className="section" aria-labelledby="how-heading">
      <div className="container">
        <h2 id="how-heading">Cómo funciona</h2>
        <div className="section-grid section-grid--two">
          <div>
            <h3>Contrato</h3>
            <p>
              La entrada y la salida siguen <code>contracts/input.schema.json</code> y{' '}
              <code>contracts/output.schema.json</code> (JSON Schema, versionados con{' '}
              <code>schemaVersion</code>). El motor de dominio expone tres funciones puras:{' '}
              <code>reviewMigration(sql)</code>, <code>compareSchemas(before, after)</code> y{' '}
              <code>exportPlan()</code>.
            </p>
            <h3>Arquitectura</h3>
            <p>
              React coordina la interfaz; el parser DDL propio y el motor de reglas corren en un Web
              Worker dedicado, fuera del hilo principal, para poder cancelar un análisis sin
              bloquear la página. No existe backend propio ni ejecución de SQL real: solo se analiza
              el texto.
            </p>
          </div>
          <div>
            <h3>Límites honestos</h3>
            <ul className="limits-list">
              <li>
                El parser reconoce un subconjunto de DDL de PostgreSQL (tablas, columnas, índices,
                tipos, restricciones). Lo que no reconoce se marca para revisión manual en vez de
                asumirse seguro.
              </li>
              <li>
                Los niveles de lock y las reescrituras se estiman con reglas estáticas de la
                documentación de PostgreSQL, no con un <code>EXPLAIN</code> real ni el tamaño real
                de tus tablas.
              </li>
              <li>
                La exportación limita a 1000 hallazgos y 5&nbsp;MB, y usa el atributo{' '}
                <code>download</code> del navegador como equivalente estático de{' '}
                <code>Content-Disposition: attachment</code>.
              </li>
              <li>
                Esta herramienta no certifica que una migración sea segura de aplicar en producción.
              </li>
            </ul>
            <h3>Repositorio</h3>
            <p>
              Código, contratos, pruebas y decisiones en{' '}
              <a
                href="https://github.com/Aredex/migration-risk-reviewer"
                target="_blank"
                rel="noreferrer"
              >
                github.com/Aredex/migration-risk-reviewer
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
