/**
 * Red de seguridad de redacción para exportaciones (08-seguridad-privacidad.md:
 * "cualquier exportación de datos debe redactar campos configurados"). El
 * riesgo específico de este proyecto es "SQL sensible pegado por el
 * usuario": una migración puede contener un literal de texto largo dentro
 * de un DEFAULT (una clave, un token, un fragmento de dato real) copiado
 * sin querer. Esta función redacta cualquier literal de cadena largo antes
 * de exportar, conservando la estructura de la sentencia (palabras clave,
 * nombres de columna/tabla) que es lo que aporta valor al informe.
 */
const LONG_STRING_LITERAL_PATTERN = /'[^'\n]{25,}'/g

export function redactSensitiveSql(text: string): string {
  return text.replace(LONG_STRING_LITERAL_PATTERN, "'[valor redactado]'")
}

export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return redactSensitiveSql(value) as unknown as T
  }
  if (Array.isArray(value)) {
    const items = value as readonly unknown[]
    const mapped: unknown[] = items.map((item) => redactDeep(item))
    return mapped as unknown as T
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = redactDeep(val)
    }
    return result as unknown as T
  }
  return value
}
