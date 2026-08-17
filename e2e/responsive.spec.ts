import { expect, test, type Page } from '@playwright/test'

type DocumentDimensions = {
  clientWidth: number
  scrollWidth: number
  overflowElements: Array<{
    selector: string
    text: string
    left: number
    right: number
    width: number
    clientWidth: number
    scrollWidth: number
    display: string
    fontFamily: string
    fontSize: string
    minWidth: string
    whiteSpace: string
  }>
}

async function documentDimensions(page: Page) {
  return page.evaluate<DocumentDimensions>(() => {
    const clientWidth = document.documentElement.clientWidth
    const overflowElements = Array.from(document.body.querySelectorAll<HTMLElement>('*'))
      .map((element) => {
        const bounds = element.getBoundingClientRect()
        const styles = getComputedStyle(element)

        return {
          selector: [element.tagName.toLowerCase(), ...Array.from(element.classList)].join('.'),
          text: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) ?? '',
          left: bounds.left,
          right: bounds.right,
          width: bounds.width,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          display: styles.display,
          fontFamily: styles.fontFamily,
          fontSize: styles.fontSize,
          minWidth: styles.minWidth,
          whiteSpace: styles.whiteSpace,
        }
      })
      .filter(({ right, width }) => width > 0 && right > clientWidth)

    return {
      clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowElements,
    }
  })
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
