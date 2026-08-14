import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('la página principal no tiene violaciones de accesibilidad críticas o serias', async ({
  page,
}) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page }).analyze()
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  )
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([])
})
