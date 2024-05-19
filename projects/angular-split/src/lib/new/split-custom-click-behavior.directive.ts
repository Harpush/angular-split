import { Directive, ElementRef, inject, input, output } from '@angular/core'
import { eventsEqualWithDelta, fromMouseDownEvent, fromMouseUpEvent } from './utils'
import { delay, filter, map, mergeMap, of, scan, switchMap, take, timeInterval } from 'rxjs'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'

/**
 * Emulates browser behavior of click and double click with three new features:
 * 1. Supports touch events (tap and double tap)
 * 2. Ignores the first click in a double click with the side effect of a bit slower emission of fast click event
 * 3. Allow customizing the delay after mouse down to count another mouse down as a double click
 */
@Directive({
  selector: '[asSplitCustomClickBehavior]',
  standalone: true,
})
export class SplitCustomClickBehaviorDirective {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef)

  readonly multiClickThreshold = input.required<number>({ alias: 'asSplitCustomMultiClickThreshold' })
  readonly deltaInPx = input.required<number>({ alias: 'asSplitCustomClickDeltaInPx' })
  readonly click = output({ alias: 'asSplitCustomClick' })
  readonly dblClick = output({ alias: 'asSplitCustomDblClick' })

  constructor() {
    fromMouseDownEvent(this.elementRef.nativeElement)
      .pipe(
        // Gather mousedown events intervals to identify whether it is a single double or more click
        timeInterval(),
        // We only count a click as part of a multi click if the multiClickThreshold wasn't reached
        scan(
          ([, sum], { interval, value }) =>
            interval >= this.multiClickThreshold() ? ([value, 1] as const) : ([value, sum + 1] as const),
          [undefined, 0],
        ),
        // As mouseup always comes after mousedown if the delayed mouseup has yet to come
        // but a new mousedown arrived we can discard the older mouseup as we are part of a multi click
        switchMap(([mouseDownEvent, numOfConsecutiveClicks]) =>
          // In case of a double click we directly emit as we don't care about more than two consecutive clicks
          // so we don't have to wait compared to a single click that might be followed by another for a double.
          // In case of a mouse up that was too long after the mouse down
          // we don't have to wait as we know it won't be a multi click but a single click
          fromMouseUpEvent(this.elementRef.nativeElement).pipe(
            timeInterval(),
            take(1),
            filter(({ value }) => eventsEqualWithDelta(mouseDownEvent, value, this.deltaInPx())),
            numOfConsecutiveClicks === 2
              ? map(() => numOfConsecutiveClicks)
              : mergeMap(({ interval }) =>
                  interval >= this.multiClickThreshold()
                    ? of(numOfConsecutiveClicks)
                    : of(numOfConsecutiveClicks).pipe(delay(this.multiClickThreshold() - interval)),
                ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((amount) => {
        if (amount === 1) {
          this.click.emit()
        } else if (amount === 2) {
          this.dblClick.emit()
        }
      })
  }
}
