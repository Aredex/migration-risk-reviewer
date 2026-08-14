import { EngineError } from '../contracts/errors'
import type { EngineInput } from '../contracts/types'
import type { MigrationAnalysis } from '../domain/types'
import type { WorkerRequest, WorkerResponse } from './protocol'

/** Límite de frecuencia del lado del cliente para la función pública
 * "ejecutar escenario" (08-seguridad-privacidad.md: "rate limit... para
 * cualquier función pública"). No es un límite de seguridad de servidor
 * -no lo hay en una app 100% estática-, sino una guarda defensiva contra
 * bucles de ejecución accidentales o automatizados. */
const RATE_LIMIT_MAX_RUNS = 20
const RATE_LIMIT_WINDOW_MS = 60_000
const RUN_TIMEOUT_MS = 8_000

const runTimestamps: number[] = []

function assertWithinRateLimit(): void {
  const now = Date.now()
  while (runTimestamps.length > 0 && now - (runTimestamps[0] ?? 0) > RATE_LIMIT_WINDOW_MS) {
    runTimestamps.shift()
  }
  if (runTimestamps.length >= RATE_LIMIT_MAX_RUNS) {
    throw new EngineError(
      'LIMIT_EXCEEDED',
      'Se alcanzó el límite de ejecuciones por minuto de esta demo. Espera unos segundos e inténtalo de nuevo.',
    )
  }
  runTimestamps.push(now)
}

export class EngineWorkerClient {
  #worker: Worker
  #pending = new Map<
    string,
    {
      resolve: (output: MigrationAnalysis) => void
      reject: (error: unknown) => void
      timeoutId: number
    }
  >()

  constructor() {
    this.#worker = createWorker()
    this.#worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      this.#handleMessage(event.data)
    })
  }

  run(input: EngineInput): { requestId: string; result: Promise<MigrationAnalysis> } {
    assertWithinRateLimit()

    const requestId = generateRequestId()
    const result = new Promise<MigrationAnalysis>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.#pending.delete(requestId)
        this.cancel(requestId)
        reject(
          new EngineError(
            'INTERNAL_ERROR',
            'La ejecución no respondió a tiempo y fue cancelada automáticamente.',
          ),
        )
      }, RUN_TIMEOUT_MS)
      this.#pending.set(requestId, { resolve, reject, timeoutId })
    })

    const message: WorkerRequest = { type: 'run', requestId, input }
    this.#worker.postMessage(message)

    return { requestId, result }
  }

  cancel(requestId: string): void {
    const message: WorkerRequest = { type: 'cancel', requestId }
    this.#worker.postMessage(message)
  }

  /** Termina el Worker inmediatamente (cancelación dura) y crea uno nuevo
   * para la siguiente ejecución. Usado por la UI cuando el visitante pulsa
   * "Cancelar". */
  hardReset(): void {
    this.#worker.terminate()
    for (const [, pending] of this.#pending) {
      window.clearTimeout(pending.timeoutId)
      pending.reject(new EngineError('RUN_CANCELLED', 'La ejecución fue cancelada.'))
    }
    this.#pending.clear()
    this.#worker = createWorker()
    this.#worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      this.#handleMessage(event.data)
    })
  }

  dispose(): void {
    this.#worker.terminate()
    for (const [, pending] of this.#pending) {
      window.clearTimeout(pending.timeoutId)
    }
    this.#pending.clear()
  }

  #handleMessage(response: WorkerResponse): void {
    const pending = this.#pending.get(response.requestId)
    if (!pending) return
    this.#pending.delete(response.requestId)
    window.clearTimeout(pending.timeoutId)
    if (response.type === 'success') {
      pending.resolve(response.output)
    } else {
      pending.reject(new EngineError('INTERNAL_ERROR', response.message))
    }
  }
}

function createWorker(): Worker {
  return new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })
}

function generateRequestId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
