import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

// `globals: false` en vitest.config.ts evita inyectar globals implícitos;
// por eso el auto-cleanup de Testing Library (que depende de un `afterEach`
// global) se registra aquí explícitamente para desmontar el DOM entre tests.
afterEach(() => {
  cleanup()
})
