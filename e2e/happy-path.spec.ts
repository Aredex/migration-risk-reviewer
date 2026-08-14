import { expect, test } from '@playwright/test'

/**
 * Recorrido principal de 30/90 segundos (03-ux-flujos-y-contenido.md) y
 * sustituto automático de las "cinco pruebas observadas" del playbook de
 * portafolio: no hubo usuarios humanos disponibles, así que este test
 * recorre el camino feliz completo de punta a punta.
 */
test.describe('Camino feliz', () => {
  test('ejecutar el fixture por defecto, abrir un hallazgo, cambiar de escenario y exportar', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', { name: 'Haz visible lo que normalmente falla en silencio.' }),
    ).toBeVisible()

    const executeButton = page.getByRole('button', { name: 'Ejecutar escenario' })
    await expect(executeButton).toBeEnabled()
    await executeButton.click()

    await expect(page.getByText(/Estado: Completado\./)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.result-summary')).toContainText('aditiva')

    // 90s: abrir un hallazgo y revisar su evidencia (nivel de lock).
    const firstFinding = page.locator('.finding summary').first()
    await firstFinding.click()
    await expect(page.locator('.finding[open] .finding-body').first()).toBeVisible()

    // El plan expand-contract se muestra con al menos una fase.
    await expect(page.getByRole('heading', { name: 'Plan expand-contract' })).toBeVisible()

    // 90s: cambiar de escenario (parámetro distinto) y volver a ejecutar.
    await page.getByRole('radio', { name: /Frontera: NOT NULL con y sin DEFAULT/ }).check()
    await executeButton.click()
    await expect(page.getByText(/\d+ crítico\(s\)/)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.severity-dot--critical').first()).toBeVisible()

    // Exportar evidencia sin crear cuenta.
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportar JSON' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^migration-risk-run_not-null-boundary_.*\.json$/)
  })
})
