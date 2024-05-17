import { filter, fromEvent, merge } from 'rxjs'

export interface ClientPoint {
  x: number
  y: number
}

/**
 * Only supporting a single {@link TouchEvent} point
 */
export function getMousePointFromEvent(event: MouseEvent | TouchEvent): ClientPoint {
  if ('changedTouches' in event) {
    if (event.changedTouches.length === 0) {
      return undefined
    }

    const { clientX, clientY } = event.changedTouches[0]

    return {
      x: clientX,
      y: clientY,
    }
  }

  return {
    x: event.clientX,
    y: event.clientY,
  }
}

export function roundWithPrecision(num: number, precision: number) {
  return Math.round(num * 10 ** precision) / 10 ** precision
}

export function fromMouseDownEvent(target: HTMLElement | Document) {
  return merge(
    fromEvent<MouseEvent>(target, 'mousedown').pipe(filter((e) => e.button === 0)),
    fromEvent<TouchEvent>(target, 'touchstart'),
  )
}

export function fromMouseMoveEvent(target: HTMLElement | Document) {
  return merge(fromEvent<MouseEvent>(target, 'mousemove'), fromEvent<TouchEvent>(target, 'touchmove'))
}

export function fromMouseUpEvent(target: HTMLElement | Document, includeTouchCancel = false) {
  const withoutTouchCancel = merge(fromEvent<MouseEvent>(target, 'mouseup'), fromEvent<TouchEvent>(target, 'touchend'))

  return includeTouchCancel
    ? merge(withoutTouchCancel, fromEvent<TouchEvent>(target, 'touchcancel'))
    : withoutTouchCancel
}

export function sum<T>(array: T[] | readonly T[], fn: (item: T) => number) {
  return (array as T[]).reduce((sum, item) => sum + fn(item), 0)
}

export function sumNumArray(array: number[]) {
  return sum(array, (num) => num)
}

export function toRecord<TItem, TKey extends string, TValue>(
  array: TItem[] | readonly TItem[],
  fn: (item: TItem, index: number) => [TKey, TValue],
): Record<TKey, TValue> {
  return (array as TItem[]).reduce<Record<TKey, TValue>>(
    (record, item, index) => {
      const [key, value] = fn(item, index)
      record[key] = value
      return record
    },
    {} as Record<TKey, TValue>,
  )
}

export function createClassesString(classesRecord: Record<string, boolean>) {
  return Object.entries(classesRecord)
    .filter(([, value]) => value)
    .map(([key]) => key)
    .join(' ')
}
