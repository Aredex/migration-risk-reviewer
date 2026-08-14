import type { FindingSeverity } from '../contracts/types'
import type { MigrationAnalysis, RiskFinding, RolloutPhase } from '../domain/types'
import { countBySeverity } from '../domain/types'
import type { RunPhase } from '../hooks/useRun'

interface ResultPanelProps {
  readonly phase: RunPhase
  readonly output: MigrationAnalysis | null
  readonly errorMessage: string | null
  readonly onExportJson: () => void
  readonly onExportMarkdown: () => void
}

const STATUS_LABEL: Record<MigrationAnalysis['status'], string> = {
  completed: 'Completado',
  partial: 'Parcial',
  failed: 'Fallido',
  cancelled: 'Cancelado',
}

export function ResultPanel({
  phase,
  output,
  errorMessage,
  onExportJson,
  onExportMarkdown,
}: ResultPanelProps) {
  return (
    <section className="panel" aria-labelledby="result-heading">
      <h2 id="result-heading">Resultado</h2>

      {phase === 'idle' && (
        <p className="result-empty">
          Aún no hay resultado. Ejecuta el fixture para ver cada decisión.
        </p>
      )}

      {phase === 'processing' && <p aria-live="polite">Procesando la ejecución…</p>}

      {phase === 'error' && (
        <p className="field-error" role="alert">
          {errorMessage ??
            'No pudimos procesar esta entrada. Tus datos no se enviaron; corrige los campos señalados.'}
        </p>
      )}

      {phase === 'cancelled' && !output && (
        <p className="status-line" role="status">
          La ejecución fue cancelada. Puedes volver a ejecutar el escenario cuando quieras.
        </p>
      )}

      {output && (
        <div>
          <div className={`result-summary result-summary--${output.status}`}>
            <p>
              <strong>Estado: {STATUS_LABEL[output.status]}.</strong> La ejecución terminó. Abre
              cada decisión para revisar su evidencia.
            </p>
            <p>{output.summary}</p>
          </div>

          <SeverityCounts findings={output.findings} />

          <h3>Hallazgos</h3>
          <ul className="findings-list">
            {output.findings.map((finding, index) => (
              <FindingItem key={`${finding.ruleId}-${index}`} finding={finding} />
            ))}
          </ul>

          {output.phases.length > 0 && <PhasesSection analysis={output} />}

          <div className="export-row">
            <button type="button" className="button button--secondary" onClick={onExportJson}>
              Exportar JSON
            </button>
            <button type="button" className="button button--secondary" onClick={onExportMarkdown}>
              Exportar Markdown
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function SeverityCounts({ findings }: { readonly findings: readonly RiskFinding[] }) {
  const counts: Record<FindingSeverity, number> = countBySeverity(findings)
  return (
    <p className="status-line">
      {counts.critical} crítico(s) · {counts.error} error(es) · {counts.warning} advertencia(s) ·{' '}
      {counts.info} informativo(s)
    </p>
  )
}

const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  info: 'Info',
  warning: 'Advertencia',
  error: 'Error',
  critical: 'Crítico',
}

function FindingItem({ finding }: { readonly finding: RiskFinding }) {
  return (
    <li>
      <details className="finding">
        <summary>
          <span className={`severity-dot severity-dot--${finding.severity}`} aria-hidden="true" />
          <span className="severity-label">{SEVERITY_LABEL[finding.severity]}</span>
          <span>{finding.message}</span>
        </summary>
        <div className="finding-body">
          <dl>
            <dt>Regla</dt>
            <dd>
              <code>{finding.ruleId}</code>
            </dd>
            {finding.lockLevel && (
              <>
                <dt>Nivel de lock</dt>
                <dd>
                  <code>{finding.lockLevel}</code>
                  {finding.rewritesTable && ' · reescribe la tabla'}
                </dd>
              </>
            )}
            {finding.evidencePath && (
              <>
                <dt>Evidencia</dt>
                <dd>
                  <code>{finding.evidencePath}</code>
                </dd>
              </>
            )}
            {finding.suggestion && (
              <>
                <dt>Sugerencia</dt>
                <dd>{finding.suggestion}</dd>
              </>
            )}
          </dl>
        </div>
      </details>
    </li>
  )
}

function PhasesSection({ analysis }: { readonly analysis: MigrationAnalysis }) {
  const statementsById = new Map(analysis.statements.map((statement) => [statement.id, statement]))

  return (
    <div className="phases-section">
      <h3>Plan expand-contract</h3>
      <ol className="phase-list">
        {[...analysis.phases]
          .sort((a, b) => a.order - b.order)
          .map((phase) => (
            <li key={phase.id} className={`phase phase--${phase.kind}`}>
              <PhaseCard
                phase={phase}
                statementsById={statementsById}
                rollbackSteps={analysis.rollbackSteps.filter((step) => step.phaseId === phase.id)}
                verificationSteps={analysis.verificationSteps.filter(
                  (step) => step.phaseId === phase.id,
                )}
              />
            </li>
          ))}
      </ol>
    </div>
  )
}

function PhaseCard({
  phase,
  statementsById,
  rollbackSteps,
  verificationSteps,
}: {
  readonly phase: RolloutPhase
  readonly statementsById: ReadonlyMap<string, MigrationAnalysis['statements'][number]>
  readonly rollbackSteps: MigrationAnalysis['rollbackSteps']
  readonly verificationSteps: MigrationAnalysis['verificationSteps']
}) {
  return (
    <details className="finding" open>
      <summary>
        <span>{phase.name}</span>
      </summary>
      <div className="finding-body">
        <p>{phase.description}</p>
        <p className="field-hint">
          <strong>Por qué:</strong> {phase.rationale}
        </p>

        {phase.statementIds.length > 0 && (
          <>
            <h4>Sentencias</h4>
            <ul>
              {phase.statementIds.map((id) => {
                const statement = statementsById.get(id)
                return (
                  <li key={id}>
                    <code>{statement?.raw.trim().slice(0, 140) ?? id}</code>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {rollbackSteps.length > 0 && (
          <>
            <h4>Rollback</h4>
            {rollbackSteps.map((step) => (
              <div key={step.id}>
                <p className="field-hint">
                  {step.description} — {step.reversible ? 'reversible' : 'NO reversible sin backup'}
                </p>
                <pre>
                  <code>{step.sql}</code>
                </pre>
              </div>
            ))}
          </>
        )}

        {verificationSteps.length > 0 && (
          <>
            <h4>Verificación</h4>
            {verificationSteps.map((step) => (
              <div key={step.id}>
                <p className="field-hint">{step.description}</p>
                <pre>
                  <code>{step.query}</code>
                </pre>
              </div>
            ))}
          </>
        )}
      </div>
    </details>
  )
}
