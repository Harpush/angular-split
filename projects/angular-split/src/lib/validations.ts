import { SplitUnit } from './models'
import { SplitAreaComponent } from './split-area/split-area.component'
import { sum } from './utils'

export function validateAreas(areas: readonly SplitAreaComponent[], unit: SplitUnit) {
  if (areas.length === 0) {
    return
  }

  const wildcardAreas = areas.filter((area) => area._internalSize() === '*')

  if (wildcardAreas.length > 1) {
    throw new Error('as-split: Maximum one * area is allowed')
  }

  if (wildcardAreas.length === 1) {
    return
  }

  if (unit !== 'percent') {
    throw new Error('as-split: Pixel mode must have one * area')
  }

  const sumPercent = sum(areas, (area) => area._internalSize() as number)

  // As percent calculation isn't perfect we allow for a small margin of error
  if (sumPercent < 99.9 || sumPercent > 100.1) {
    throw new Error('as-split: Percent areas must total 100%')
  }
}
