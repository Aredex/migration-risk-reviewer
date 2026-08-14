interface PrivacySectionProps {
  readonly historyConsent: boolean
  readonly onHistoryConsentChange: (consent: boolean) => void
  readonly onDeleteLocalData: () => void
  readonly deleteStatus: 'idle' | 'done'
}

export function PrivacySection({
  historyConsent,
  onHistoryConsentChange,
  onDeleteLocalData,
  deleteStatus,
}: PrivacySectionProps) {
  return (
    <section id="privacidad" className="section" aria-labelledby="privacy-heading">
      <div className="container">
        <h2 id="privacy-heading">Privacidad y datos locales</h2>
        <div className="section-grid section-grid--two">
          <div>
            <p>
              Todo el análisis ocurre en tu navegador, en un Web Worker dedicado. Ningún SQL que
              pegues sale de tu dispositivo mientras usas esta demo: no hay backend propio ni
              telemetría de contenido.
            </p>
            <p>
              <strong>Antes de pegar SQL propio:</strong> evita incluir datos reales de producción,
              claves o tokens embebidos en literales. Esta herramienta no certifica que la migración
              sea segura de aplicar; solo reporta los hallazgos de las reglas deterministas que
              ejecutó.
            </p>
          </div>
          <div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={historyConsent}
                onChange={(event) => onHistoryConsentChange(event.target.checked)}
              />
              <span>
                Guardar un historial de análisis en este navegador (IndexedDB). Nunca sale de tu
                dispositivo.
              </span>
            </label>
            <div className="execute-row">
              <button type="button" className="button button--danger" onClick={onDeleteLocalData}>
                Eliminar datos locales
              </button>
              {deleteStatus === 'done' && (
                <span className="status-line" role="status">
                  Datos locales eliminados.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
