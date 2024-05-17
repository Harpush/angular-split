import { Unit } from './models'
import { NewSplitAreaComponent } from './new-split-area/new-split-area.component'
import { sum } from './utils'

export function validateAreas(areas: readonly NewSplitAreaComponent[], unit: Unit) {
  const wildcardAreas = areas.filter((area) => area._normalizedSize() === '*')

  if (wildcardAreas.length > 1) {
    throw new Error('as-split: Can only have one or zero * areas')
  }

  // Everything is valid
  if (wildcardAreas.length === 1) {
    return
  }

  if (unit !== 'percent') {
    return
  }

  const sumPercent = sum(areas, (area) => area._normalizedSize() as number)

  if (sumPercent !== 100) {
    throw new Error('as-split: Percent areas must total 100%')
  }
}
