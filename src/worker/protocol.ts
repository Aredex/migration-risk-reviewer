import type { MigrationAnalysis } from '../domain/types'

/**
 * Protocolo de mensajes entre la interfaz y el Web Worker que ejecuta el
 * motor. `input` viaja como `unknown`: aunque hoy solo lo produce nuestro
 * propio código, el Worker lo vuelve a validar contra el contrato antes de
 * usarlo (08-seguridad-privacidad.md: "cualquier Worker valida de nuevo").
 */
export interface WorkerRunRequest {
  readonly type: 'run'
  readonly requestId: string
  readonly input: unknown
}

export interface WorkerCancelRequest {
  readonly type: 'cancel'
  readonly requestId: string
}

export type WorkerRequest = WorkerRunRequest | WorkerCancelRequest

export interface WorkerRunSuccess {
  readonly type: 'success'
  readonly requestId: string
  readonly output: MigrationAnalysis
}

export interface WorkerRunError {
  readonly type: 'error'
  readonly requestId: string
  readonly message: string
}

export type WorkerResponse = WorkerRunSuccess | WorkerRunError
