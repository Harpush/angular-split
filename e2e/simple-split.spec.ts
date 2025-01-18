import { Page, test } from '@playwright/test'
import { SplitManager } from './utils/split-manager'

class SimpleSplitPage {
  readonly noWildcardsPercentSplit = new SplitManager(this.page, '.ex-percent > as-split')
  private readonly directionToggleBtnLocator = this.page.locator('.btns > .btn')

  constructor(private readonly page: Page) {}

  async load() {
    await this.page.goto('http://localhost:4200/examples/simple-split')
  }

  async toggleDirection() {
    await this.directionToggleBtnLocator.click()
  }
}

test.describe('Percent no wildcards split', () => {
  const gutterSize = 11

  test('Initial horizontal state', async ({ page }) => {
    const simpleSplitPage = new SimpleSplitPage(page)

    await simpleSplitPage.load()
    await simpleSplitPage.noWildcardsPercentSplit.expectSplitSizes([319.5, 745.5], gutterSize, 'horizontal')
  })

  test('Move in horizontal mode', async ({ page }) => {
    const simpleSplitPage = new SimpleSplitPage(page)

    await simpleSplitPage.load()
    await simpleSplitPage.noWildcardsPercentSplit.moveGutterByMouse(0, { x: 280 })
    await simpleSplitPage.noWildcardsPercentSplit.expectSplitSizes([599.5, 465.5], gutterSize, 'horizontal')
    await simpleSplitPage.noWildcardsPercentSplit.moveGutterByMouse(0, { x: -280 })
    await simpleSplitPage.noWildcardsPercentSplit.expectSplitSizes([319.5, 745.5], gutterSize, 'horizontal')
    await simpleSplitPage.noWildcardsPercentSplit.moveGutterByMouse(0, { x: 750 })
    await simpleSplitPage.noWildcardsPercentSplit.expectSplitSizes([1065, 0], gutterSize, 'horizontal')
    await simpleSplitPage.noWildcardsPercentSplit.moveGutterByMouse(0, { x: -1070 })
    await simpleSplitPage.noWildcardsPercentSplit.expectSplitSizes([0, 1065], gutterSize, 'horizontal')
  })

  test('Initial vertical state', async ({ page }) => {
    const simpleSplitPage = new SimpleSplitPage(page)

    await simpleSplitPage.load()
    await simpleSplitPage.toggleDirection()
    await simpleSplitPage.noWildcardsPercentSplit.expectSplitSizes([86.7, 202.3], gutterSize, 'vertical')
  })

  test('Move in vertical mode', async ({ page }) => {
    const simpleSplitPage = new SimpleSplitPage(page)

    await simpleSplitPage.load()
    await simpleSplitPage.toggleDirection()
    await simpleSplitPage.noWildcardsPercentSplit.moveGutterByMouse(0, { y: 20 })
    await simpleSplitPage.noWildcardsPercentSplit.expectSplitSizes([106.7, 182.3], gutterSize, 'vertical')
    await simpleSplitPage.noWildcardsPercentSplit.moveGutterByMouse(0, { y: -20 })
    await simpleSplitPage.noWildcardsPercentSplit.expectSplitSizes([86.7, 202.3], gutterSize, 'vertical')
    await simpleSplitPage.noWildcardsPercentSplit.moveGutterByMouse(0, { y: 300 })
    await simpleSplitPage.noWildcardsPercentSplit.expectSplitSizes([289, 0], gutterSize, 'vertical')
    await simpleSplitPage.noWildcardsPercentSplit.moveGutterByMouse(0, { y: -300 })
    await simpleSplitPage.noWildcardsPercentSplit.expectSplitSizes([0, 289], gutterSize, 'vertical')
  })

  // TODO: max left, change, max top, change

  // TODO: keyboard horiz

  // TODO: keyboard vertical
})
