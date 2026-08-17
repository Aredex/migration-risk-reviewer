import { expect, test, type Page } from '@playwright/test'

type DocumentDimensions = {
  clientWidth: number
  scrollWidth: number
}

async function documentDimensions(page: Page) {
  return page.evaluate<DocumentDimensions>(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
}

test.describe('Responsive layout', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('no crea desbordamiento horizontal inicialmente ni tras la CTA principal', async ({
    page,
  }, testInfo) => {
    await page.goto('/')

    const initial = await documentDimensions(page)
    expect(
      initial.scrollWidth,
      `initial dimensions: ${JSON.stringify(initial)}`,
    ).toBeLessThanOrEqual(initial.clientWidth)

    await page.getByRole('button', { name: 'Ir al banco de trabajo' }).click()

    const afterPrimaryCta = await documentDimensions(page)
    testInfo.annotations.push({
      type: 'document dimensions',
      description: JSON.stringify({
        viewport: { width: 390, height: 844 },
        initial,
        afterPrimaryCta,
      }),
    })
    expect(
      afterPrimaryCta.scrollWidth,
      `after primary CTA dimensions: ${JSON.stringify(afterPrimaryCta)}`,
    ).toBeLessThanOrEqual(afterPrimaryCta.clientWidth)
  })
})
