import { expect, test } from '@playwright/test'

/**
 * Caso adversarial: SQL con comentarios, comillas y bloques dollar-quoted
 * diseñados para confundir un separador de sentencias ingenuo, más un DROP
 * TABLE real al final (08-seguridad-privacidad.md: "parser incompleto" y
 * "SQL sensible pegado" están en el threat model). Nunca se ejecuta SQL:
 * solo se analiza como texto, y el resultado debe seguir siendo explicable.
 */
test('el fixture adversarial se analiza sin romper la interfaz y marca el DROP TABLE como crítico', async ({
  page,
}) => {
  await page.goto('/')

  await page
    .getByRole('radio', { name: /Adversarial: comentarios, comillas y dollar-quoting/ })
    .check()
  await page.getByRole('button', { name: 'Ejecutar escenario' }).click()

  await expect(page.getByText(/\d+ crítico\(s\)/)).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.severity-dot--critical').first()).toBeVisible()

  // La interfaz sigue respondiendo con normalidad (no se rompió el layout).
  await expect(page.getByRole('heading', { name: 'Resultado' })).toBeVisible()
})

test('el fixture de entrada vacía produce un error tipado recuperable', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('radio', { name: /Entrada inválida: SQL vacío/ }).check()
  await page.getByRole('button', { name: 'Ejecutar escenario' }).click()

  await expect(page.getByText(/no pudimos procesar esta entrada/i)).toBeVisible({ timeout: 10_000 })
})
