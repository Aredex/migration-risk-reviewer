interface HeroProps {
  readonly onPrimaryAction: () => void
}

export function Hero({ onPrimaryAction }: HeroProps) {
  return (
    <section className="hero">
      <div className="container">
        <h1 className="hero__title">Haz visible lo que normalmente falla en silencio.</h1>
        <p className="hero__lede">
          Una migración de PostgreSQL con buena pinta puede bloquear escrituras, reescribir una
          tabla entera o romper un despliegue compatible con versiones anteriores. Pega tu migración
          o compara dos schemas y recibe los riesgos de lock/reescritura, un plan expand-contract
          por fases y su rollback y verificación.
        </p>
        <p className="field-hint">
          Usa el ejemplo incluido o pega tu propia migración. El modo local no la envía a ningún
          servidor.
        </p>
        <div className="hero__actions">
          <button type="button" className="button button--primary" onClick={onPrimaryAction}>
            Ir al banco de trabajo
          </button>
          <a className="button button--secondary" href="#como-funciona">
            Cómo funciona
          </a>
        </div>
      </div>
    </section>
  )
}
