/// <reference lib="webworker" />

import { validateEngineInput } from '../contracts/validateInput'
import { runEngine } from '../domain/engine'
import type { WorkerRequest, WorkerResponse } from './protocol'

/** Pequeña latencia deliberada para que el estado "procesando" de la
 * interfaz sea visible y la cancelación sea observable en pruebas E2E. El
 * motor de dominio en sí (`runEngine`) es instantáneo y determinista. */
const SIMULATED_LATENCY_MS = 300

const activeControllers = new Map<string, AbortController>()

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  if (message.type === 'run') {
    void handleRun(message)
  } else if (message.type === 'cancel') {
    activeControllers.get(message.requestId)?.abort()
  }
})

async function handleRun(message: Extract<WorkerRequest, { type: 'run' }>): Promise<void> {
  const controller = new AbortController()
  activeControllers.set(message.requestId, controller)

  try {
    const input = validateEngineInput(message.input)
    const output = await runEngine(input, controller.signal, {
      simulateLatencyMs: SIMULATED_LATENCY_MS,
    })
    const response: WorkerResponse = { type: 'success', requestId: message.requestId, output }
    postMessage(response)
  } catch (error) {
    // Nunca se registra el contenido de `message.input` (puede contener SQL
    // sensible pegado por el visitante).
    const response: WorkerResponse = {
      type: 'error',
      requestId: message.requestId,
      message: error instanceof Error ? error.message : 'Error interno no clasificado.',
    }
    postMessage(response)
  } finally {
    activeControllers.delete(message.requestId)
  }
}
