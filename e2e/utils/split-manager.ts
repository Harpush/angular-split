import { Locator, Page, expect } from '@playwright/test'

export class SplitManager {
  private readonly splitLocator: Locator
  private readonly guttersLocator: Locator
  private readonly areasLocator: Locator

  constructor(
    private readonly page: Page,
    splitSelector: string,
  ) {
    this.splitLocator = this.page.locator(splitSelector)
    this.guttersLocator = this.splitLocator.locator('.as-split-gutter')
    this.areasLocator = this.splitLocator.locator('.as-split-area')
  }

  // TODO: aria label and value?

  async expectSplitSizes(areasSizes: number[], gutterSizes: number | number[], direction: 'vertical' | 'horizontal') {
    await this.splitLocator.scrollIntoViewIfNeeded()

    const splitBox = await this.splitLocator.boundingBox()

    await expect(this.guttersLocator).toHaveCount(areasSizes.length - 1)

    const guttersLocators = await this.guttersLocator.all()

    for (let gutterIndex = 0; gutterIndex < guttersLocators.length; gutterIndex++) {
      const gutterLocator = guttersLocators[gutterIndex]
      const gutterBox = await gutterLocator.boundingBox()
      const gutterSize = Array.isArray(gutterSizes) ? gutterSizes[gutterIndex] : gutterSizes

      if (direction === 'horizontal') {
        expect(gutterBox.width).toBe(gutterSize)
        expect(gutterBox.height).toBe(splitBox.height)
      } else {
        expect(gutterBox.width).toBe(splitBox.width)
        expect(gutterBox.height).toBe(gutterSize)
      }
    }

    await expect(this.areasLocator).toHaveCount(areasSizes.length)

    const areasLocators = await this.areasLocator.all()

    for (let areaIndex = 0; areaIndex < areasLocators.length; areaIndex++) {
      const areaLocator = areasLocators[areaIndex]
      const areaBox = await areaLocator.boundingBox()

      if (direction === 'horizontal') {
        expect(this.round(areaBox.width)).toBe(this.round(areasSizes[areaIndex]))
        expect(this.round(areaBox.height)).toBe(this.round(splitBox.height))
      } else {
        expect(this.round(areaBox.width)).toBe(this.round(splitBox.width))
        expect(this.round(areaBox.height)).toBe(this.round(areasSizes[areaIndex]))
      }
    }
  }

  async moveGutterByMouse(gutterIndex: number, amount: { x?: number; y?: number }) {
    await this.splitLocator.scrollIntoViewIfNeeded()

    const firstGutterLocator = this.guttersLocator.nth(gutterIndex)
    const gutterBox = await firstGutterLocator.boundingBox()
    const halfGutterWidth = gutterBox.width / 2
    const halfGutterHeight = gutterBox.height / 2

    await this.page.mouse.move(gutterBox.x + halfGutterWidth, gutterBox.y + halfGutterHeight)
    await this.page.mouse.down({ button: 'left' })
    await this.page.mouse.move(
      gutterBox.x + halfGutterWidth + (amount.x ?? 0),
      gutterBox.y + halfGutterHeight + (amount.y ?? 0),
      { steps: 5 },
    )
    await this.page.mouse.up({ button: 'left' })
  }

  // TODO: expectClasses({must: [], mustNot: []})
  // expectSplit({sizes, gutters, classes})

  private round(value: number) {
    return Math.round(value * 10) / 10
  }
}
