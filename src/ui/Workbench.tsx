import { useId } from 'react'
import { MAX_SQL_LENGTH } from '../domain/parser'
import type { RunPhase } from '../hooks/useRun'
import type { Scenario, ScenarioMode } from '../fixtures/types'

interface WorkbenchProps {
  readonly scenarios: readonly Scenario[]
  readonly selectedScenarioId: string
  readonly onSelectScenario: (id: string) => void
  readonly mode: ScenarioMode
  readonly sql: string
  readonly onSqlChange: (value: string) => void
  readonly before: string
  readonly onBeforeChange: (value: string) => void
  readonly after: string
  readonly onAfterChange: (value: string) => void
  readonly phase: RunPhase
  readonly onExecute: () => void
  readonly onCancel: () => void
}

const CATEGORY_LABEL: Record<Scenario['category'], string> = {
  'happy-path': 'Camino feliz',
  boundary: 'Frontera',
  adversarial: 'Adversarial',
  'dependency-down': 'Dependencia caída',
  'invalid-input': 'Entrada inválida',
}

export function Workbench(props: WorkbenchProps) {
  const scenarioListId = useId()
  const sqlFieldId = useId()
  const beforeFieldId = useId()
  const afterFieldId = useId()

  const isProcessing = props.phase === 'processing'
  const currentLength =
    props.mode === 'migration' ? props.sql.length : props.before.length + props.after.length
  const tooLarge = currentLength > MAX_SQL_LENGTH * (props.mode === 'migration' ? 1 : 2)

  return (
    <section className="panel" aria-labelledby="workbench-heading">
      <h2 id="workbench-heading">Entrada y escenario</h2>

      <fieldset>
        <legend>Selecciona un escenario</legend>
        <div className="scenario-list" role="radiogroup" aria-labelledby={scenarioListId}>
          <span id={scenarioListId} className="visually-hidden">
            Escenarios disponibles
          </span>
          {props.scenarios.map((scenario) => (
            <label
              key={scenario.id}
              className="scenario-option"
              htmlFor={`scenario-${scenario.id}`}
            >
              <input
                id={`scenario-${scenario.id}`}
                type="radio"
                name="scenario"
                value={scenario.id}
                checked={props.selectedScenarioId === scenario.id}
                onChange={() => props.onSelectScenario(scenario.id)}
              />
              <span>
                <span className="scenario-option__title">
                  {scenario.label}
                  <span className={`badge badge--${scenario.category}`}>
                    {CATEGORY_LABEL[scenario.category]}
                  </span>
                </span>
                <br />
                <span className="scenario-option__description">{scenario.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {props.mode === 'migration' ? (
        <div className="field">
          <label htmlFor={sqlFieldId}>Migración SQL (editable)</label>
          <textarea
            id={sqlFieldId}
            value={props.sql}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            rows={12}
            onChange={(event) => props.onSqlChange(event.target.value)}
            aria-describedby={`${sqlFieldId}-hint`}
            aria-invalid={tooLarge}
          />
          <p id={`${sqlFieldId}-hint`} className="field-hint">
            Pega tu propia migración de PostgreSQL o edita el ejemplo. El procesamiento es 100%
            local: nada se envía a un servidor. Un SQL vacío también es un caso válido para ver el
            error tipado.
          </p>
          {tooLarge && (
            <p className="field-error" role="alert">
              El SQL supera el tamaño máximo permitido en esta demo (
              {MAX_SQL_LENGTH.toLocaleString('es')} caracteres).
            </p>
          )}
        </div>
      ) : (
        <div className="section-grid section-grid--two">
          <div className="field">
            <label htmlFor={beforeFieldId}>Schema "antes" (CREATE TABLE)</label>
            <textarea
              id={beforeFieldId}
              value={props.before}
              spellCheck={false}
              rows={12}
              onChange={(event) => props.onBeforeChange(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={afterFieldId}>Schema "después" (CREATE TABLE)</label>
            <textarea
              id={afterFieldId}
              value={props.after}
              spellCheck={false}
              rows={12}
              onChange={(event) => props.onAfterChange(event.target.value)}
            />
          </div>
        </div>
      )}

      <div className="execute-row">
        <button
          type="button"
          className="button button--primary"
          onClick={props.onExecute}
          disabled={isProcessing || tooLarge}
        >
          {isProcessing ? 'Procesando…' : 'Ejecutar escenario'}
        </button>
        {isProcessing && (
          <button type="button" className="button button--secondary" onClick={props.onCancel}>
            Cancelar
          </button>
        )}
        <span className="status-line" aria-hidden="true">
          Estado: {phaseLabel(props.phase)}
        </span>
      </div>
    </section>
  )
}

function phaseLabel(phase: RunPhase): string {
  switch (phase) {
    case 'idle':
      return 'preparado'
    case 'processing':
      return 'procesando'
    case 'completed':
      return 'completado'
    case 'cancelled':
      return 'cancelado'
    case 'error':
      return 'error'
  }
}
