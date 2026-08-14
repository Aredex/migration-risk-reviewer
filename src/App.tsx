import { useEffect, useState } from 'react'
import { CaseStudy } from './ui/CaseStudy'
import { Footer } from './ui/Footer'
import { Header } from './ui/Header'
import { Hero } from './ui/Hero'
import { HowItWorks } from './ui/HowItWorks'
import { PrivacySection } from './ui/PrivacySection'
import { ResultPanel } from './ui/ResultPanel'
import { SkipLink } from './ui/SkipLink'
import { Workbench } from './ui/Workbench'
import { DEFAULT_SCENARIO_ID, SCENARIOS, findScenario } from './fixtures/catalog'
import { useRun, type RunPayload, type RunPhase } from './hooks/useRun'
import {
  buildExportPayload,
  exportPayloadToJson,
  exportPayloadToMarkdown,
} from './lib/exportReport'
import { downloadBlob } from './lib/download'
import { clearLocalData, isHistoryConsentGiven, setHistoryConsent } from './storage/localHistory'

export default function App() {
  const initialScenario = findScenario(DEFAULT_SCENARIO_ID)
  const [selectedScenarioId, setSelectedScenarioId] = useState(DEFAULT_SCENARIO_ID)
  const [mode, setMode] = useState(initialScenario?.mode ?? 'migration')
  const [sql, setSql] = useState(initialScenario?.sql ?? '')
  const [before, setBefore] = useState(initialScenario?.before ?? '')
  const [after, setAfter] = useState(initialScenario?.after ?? '')
  const [historyConsent, setHistoryConsentState] = useState(false)
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'done'>('idle')

  const run = useRun()

  useEffect(() => {
    setHistoryConsentState(isHistoryConsentGiven())
  }, [])

  function handleSelectScenario(id: string): void {
    const scenario = findScenario(id)
    if (!scenario) return
    setSelectedScenarioId(id)
    setMode(scenario.mode)
    setSql(scenario.sql ?? '')
    setBefore(scenario.before ?? '')
    setAfter(scenario.after ?? '')
  }

  function handleExecute(): void {
    const payload: RunPayload =
      mode === 'migration' ? { mode: 'migration', sql } : { mode: 'compare', before, after }
    void run.execute({ scenarioId: selectedScenarioId, payload })
  }

  function handleExportJson(): void {
    if (!run.state.output) return
    const payload = buildExportPayload(run.state.output)
    downloadBlob(
      `migration-risk-${payload.runId}.json`,
      exportPayloadToJson(payload),
      'application/json',
    )
  }

  function handleExportMarkdown(): void {
    if (!run.state.output) return
    const payload = buildExportPayload(run.state.output)
    downloadBlob(
      `migration-risk-${payload.runId}.md`,
      exportPayloadToMarkdown(payload),
      'text/markdown',
    )
  }

  function handleHistoryConsentChange(consent: boolean): void {
    setHistoryConsent(consent)
    setHistoryConsentState(consent)
    setDeleteStatus('idle')
  }

  function handleDeleteLocalData(): void {
    void clearLocalData().then(() => {
      setHistoryConsentState(false)
      setDeleteStatus('done')
    })
  }

  function scrollToWorkbench(): void {
    document
      .getElementById('workbench-heading')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="app-shell">
      <SkipLink />
      <Header />
      <main id="main-content">
        <Hero onPrimaryAction={scrollToWorkbench} />

        <div className="container">
          <div className="workbench">
            <Workbench
              scenarios={SCENARIOS}
              selectedScenarioId={selectedScenarioId}
              onSelectScenario={handleSelectScenario}
              mode={mode}
              sql={sql}
              onSqlChange={setSql}
              before={before}
              onBeforeChange={setBefore}
              after={after}
              onAfterChange={setAfter}
              phase={run.state.phase}
              onExecute={handleExecute}
              onCancel={run.cancel}
            />
            <ResultPanel
              phase={run.state.phase}
              output={run.state.output}
              errorMessage={run.state.errorMessage}
              onExportJson={handleExportJson}
              onExportMarkdown={handleExportMarkdown}
            />
          </div>
        </div>

        <div aria-live="polite" className="visually-hidden">
          {runAnnouncement(run.state.phase)}
        </div>

        <HowItWorks />
        <PrivacySection
          historyConsent={historyConsent}
          onHistoryConsentChange={handleHistoryConsentChange}
          onDeleteLocalData={handleDeleteLocalData}
          deleteStatus={deleteStatus}
        />
        <CaseStudy />
      </main>
      <Footer />
    </div>
  )
}

function runAnnouncement(phase: RunPhase): string {
  switch (phase) {
    case 'processing':
      return 'Procesando el análisis.'
    case 'completed':
      return 'Análisis completado. Revisa el resultado.'
    case 'cancelled':
      return 'Análisis cancelado.'
    case 'error':
      return 'Ocurrió un error al procesar la entrada.'
    case 'idle':
    default:
      return ''
  }
}
