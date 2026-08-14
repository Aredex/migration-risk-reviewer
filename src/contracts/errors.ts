import type { ErrorCode, TypedError } from './types'

/**
 * Error tipado del dominio. Nunca debe construirse con el contenido de un
 * payload/SQL del visitante en el mensaje (ver 08-seguridad-privacidad.md:
 * "no registrar payloads, tokens, archivos, prompts ni cabeceras").
 */
export class EngineError extends Error implements TypedError {
  readonly code: ErrorCode
  readonly paths?: readonly string[]

  constructor(code: ErrorCode, message: string, paths?: readonly string[]) {
    super(message)
    this.name = 'EngineError'
    this.code = code
    this.paths = paths
  }
}

export function isEngineError(value: unknown): value is EngineError {
  return value instanceof EngineError
}
