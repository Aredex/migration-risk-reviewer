export type ScenarioCategory =
  'happy-path' | 'boundary' | 'adversarial' | 'dependency-down' | 'invalid-input'

export type ScenarioMode = 'migration' | 'compare'

/**
 * Escenario/fixture versionado (06-modelo-datos.md). Ningún fixture
 * contiene datos reales de ninguna base de datos: son migraciones de
 * ejemplo escritas para esta demo.
 */
export interface Scenario {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly category: ScenarioCategory
  readonly mode: ScenarioMode
  readonly sql?: string
  readonly before?: string
  readonly after?: string
  /** Cuando es `true`, la ejecución primero intenta un adaptador externo
   * (desactivado por diseño/kill switch) antes de caer al motor de reglas
   * determinista. */
  readonly requiresAdapter?: boolean
}

export const RULES_VERSION = '1.0.0'
