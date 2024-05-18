import {
  Component,
  HostBinding,
  booleanAttribute,
  computed,
  contentChildren,
  effect,
  inject,
  input,
  numberAttribute,
  output,
  signal,
  untracked,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NewSplitAreaComponent } from '../new-split-area/new-split-area.component'
import { Subject, map, pairwise, skipWhile, startWith, switchMap, take, takeUntil, tap } from 'rxjs'
import {
  createClassesString,
  fromMouseMoveEvent,
  fromMouseUpEvent,
  getMousePointFromEvent,
  roundWithPrecision,
  sum,
  sumNumArray,
  toRecord,
} from '../utils'
import { DOCUMENT, NgStyle } from '@angular/common'
import { SplitGutterInteractionEvent, SplitAreaSize, SplitUnit } from '../models'
import { SplitCustomClickBehaviorDirective } from '../split-custom-click-behavior.directive'
import { validateAreas } from '../validations'

interface MouseDownContext {
  mouseDownEvent: MouseEvent | TouchEvent
  gutterIndex: number
  areaBeforeGutterIndex: number
  areaAfterGutterIndex: number
}

interface AreaBoundary {
  min: number
  max: number
}

interface DragStartContext {
  startEvent: MouseEvent | TouchEvent
  areaPixelsSize: number[]
  areaIndexToBoundaries: Record<number, AreaBoundary>
  areaBeforeGutterIndex: number
  areaAfterGutterIndex: number
}

@Component({
  selector: 'as-new-split',
  standalone: true,
  imports: [NgStyle, SplitCustomClickBehaviorDirective],
  exportAs: 'asSplit',
  templateUrl: './new-split.component.html',
  styleUrl: './new-split.component.scss',
})
export class NewSplitComponent {
  private readonly document = inject(DOCUMENT)

  // TODO: Global config
  // TODO: Change detection decisions
  private readonly gutterMouseDown$ = new Subject<MouseDownContext>()

  readonly areas = contentChildren(NewSplitAreaComponent)
  readonly gutterSize = input(11, { transform: numberAttribute })
  readonly gutterStep = input(1, { transform: numberAttribute })
  readonly disabled = input(false, { transform: booleanAttribute })
  readonly gutterClickDeltaPx = input(2, { transform: numberAttribute })
  readonly direction = input<'horizontal' | 'vertical'>('horizontal')
  readonly dir = input<'ltr' | 'rtl'>('ltr')
  readonly unit = input<SplitUnit>('percent')
  readonly gutterAriaLabel = input<string>()
  readonly restrictMove = input(false, { transform: booleanAttribute })
  // TODO: useTransition
  readonly gutterClick = output<SplitGutterInteractionEvent>()
  readonly gutterDblClick = output<SplitGutterInteractionEvent>()
  readonly gutterDblClickDuration = input(0)
  readonly dragStart = output<SplitGutterInteractionEvent>()
  readonly dragEnd = output<SplitGutterInteractionEvent>()

  // TODO: transitionEnd

  readonly visibleAreas = computed(() => this.areas().filter((area) => area.visible()))
  private readonly gridTemplateColumnsStyle = computed(() => {
    const columns: string[] = []
    const sumNonWildcardSizes = sum(this.visibleAreas(), (area) => {
      const size = area._internalSize()
      return size === '*' ? 0 : size
    })
    const visibleAreasCount = this.visibleAreas().length

    let visitedVisibleAreas = 0

    this.areas().forEach((area, index, areas) => {
      // Add area size column
      if (!area.visible()) {
        columns.push('0')
      } else {
        const areaSize = area._internalSize()
        const unit = this.unit()

        if (unit === 'pixel') {
          const columnValue = areaSize === '*' ? '100fr' : `${areaSize}px`
          columns.push(columnValue)
        } else {
          const columnValue = areaSize === '*' ? `${100 - sumNonWildcardSizes}fr` : `${areaSize}fr`
          columns.push(columnValue)
        }

        visitedVisibleAreas++
      }

      const isLastArea = index === areas.length - 1

      if (isLastArea) {
        return
      }

      const remainingVisibleAreas = visibleAreasCount - visitedVisibleAreas

      // Only add gutter with size if this area is visible and there are more visible areas after this one
      // to avoid ghost gutters
      if (area.visible() && remainingVisibleAreas > 0) {
        columns.push(`${this.gutterSize()}px`)
      } else {
        columns.push('0')
      }
    })

    return this.direction() === 'horizontal' ? `1fr / ${columns.join(' ')}` : `${columns.join(' ')} / 1fr`
  })
  private readonly hostClasses = computed(() =>
    createClassesString({
      [`as-${this.direction()}`]: true,
      [`as-${this.unit()}`]: true,
      ['as-disabled']: this.disabled(),
      ['as-dragging']: this._isDragging(),
    }),
  )
  protected readonly draggedGutterIndex = signal<number>(undefined)
  readonly _isDragging = computed(() => this.draggedGutterIndex() !== undefined)

  @HostBinding('style.grid-template') protected get hostGridTemplateColumnsStyleBinding() {
    return this.gridTemplateColumnsStyle()
  }
  @HostBinding('class') protected get hostClassesBinding() {
    return this.hostClasses()
  }

  // TODO: (?) dragProgress$

  constructor() {
    effect(
      () => {
        const visibleAreas = this.visibleAreas()
        const unit = this.unit()
        const shouldDistributeSizeEvenly = visibleAreas.every((area) => area.size() === 'auto')

        untracked(() => {
          if (shouldDistributeSizeEvenly) {
            if (unit === 'pixel') {
              throw new Error('as-split: All areas without size can only be in percent mode')
            }

            visibleAreas.forEach((area) => area._internalSize.set(100 / visibleAreas.length))
          } else {
            // Visibility changed - reset back to sizes as we can't know if sizes will be valid
            // Unit changed - the whole calculation is different so reset to the input size
            // Area size changed - we need to reset all areas sizes as the change might break with current internal sizes
            visibleAreas.forEach((area) => area._internalSize.reset())
          }

          validateAreas(visibleAreas, unit)
        })
      },
      { allowSignalWrites: true },
    )

    this.gutterMouseDown$
      .pipe(
        switchMap((mouseDownContext) =>
          // As we have gutterClickDeltaPx we can't just start the drag but need to make sure
          // we are out of the delta pixels. As the delta can be any number we make sure
          // we always start the drag if we go out of the gutter (delta based on mouse position is larger than gutter).
          // As moving can start inside the drag and end outside of it we always keep track of the previous event
          // so once the current is out of the delta size we use the previous one as the drag start baseline.
          fromMouseMoveEvent(this.document).pipe(
            startWith(mouseDownContext.mouseDownEvent),
            pairwise(),
            skipWhile(([, currMoveEvent]) => this.eventsEqualWithDelta(mouseDownContext.mouseDownEvent, currMoveEvent)),
            take(1),
            takeUntil(fromMouseUpEvent(this.document, true).pipe(take(1))),
            tap(() => this.draggedGutterIndex.set(mouseDownContext.gutterIndex)),
            tap(() => this.dragStart.emit(this.createDragInteractionEvent(mouseDownContext.gutterIndex))),
            map(([prevMoveEvent]) => this.createDragStartContext(prevMoveEvent, mouseDownContext)),
            switchMap((dragStartContext) =>
              fromMouseMoveEvent(this.document).pipe(
                tap((moveEvent) => this.dragMove(moveEvent, dragStartContext)),
                takeUntil(fromMouseUpEvent(this.document, true).pipe(take(1))),
                tap({
                  complete: () => {
                    if (this._isDragging()) {
                      // Needed as there is no better way to cancel the click event
                      // that will come after the mouseup event.
                      setTimeout(() => {
                        this.draggedGutterIndex.set(undefined)
                        this.dragEnd.emit(this.createDragInteractionEvent(mouseDownContext.gutterIndex))
                      })
                    }
                  },
                }),
              ),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe()
  }

  protected gutterClicked(gutterIndex: number) {
    // Just ended dragging so ignore
    if (this._isDragging()) {
      return
    }

    this.gutterClick.emit(this.createDragInteractionEvent(gutterIndex))
  }

  protected gutterDoubleClicked(gutterIndex: number) {
    // Just ended dragging so ignore
    if (this._isDragging()) {
      return
    }

    this.gutterDblClick.emit(this.createDragInteractionEvent(gutterIndex))
  }

  protected gutterMouseDown(
    e: MouseEvent | TouchEvent,
    gutterIndex: number,
    areaBeforeIndex: number,
    areaAfterIndex: number,
  ) {
    // Only left clicks
    if (e instanceof MouseEvent && e.button !== 0) {
      return
    }

    e.preventDefault()
    e.stopPropagation()

    if (this.disabled()) {
      return
    }

    this.gutterMouseDown$.next({
      mouseDownEvent: e,
      gutterIndex,
      areaBeforeGutterIndex: areaBeforeIndex,
      areaAfterGutterIndex: areaAfterIndex,
    })
  }

  // TODO: keyboard drag

  protected getGutterGridStyle(nextAreaIndex: number) {
    const gutterNum = nextAreaIndex * 2
    const style = `${gutterNum} / ${gutterNum}`

    return {
      ['grid-column']: this.direction() === 'horizontal' ? style : '1',
      ['grid-row']: this.direction() === 'vertical' ? style : '1',
    }
  }

  protected getAriaAreaSizeText(area: NewSplitAreaComponent): string {
    const size = area._internalSize()

    if (size === '*') {
      return undefined
    }

    return `${size.toFixed(0)} ${this.unit()}`
  }

  protected getAriaValue(size: SplitAreaSize) {
    return size === '*' ? undefined : size
  }

  private createDragInteractionEvent(gutterIndex: number): SplitGutterInteractionEvent {
    return {
      gutterNum: gutterIndex + 1,
      sizes: this.visibleAreas().map((area) => area._internalSize()),
    }
  }

  private createDragStartContext(
    startEvent: MouseEvent | TouchEvent,
    mouseDownContext: MouseDownContext,
  ): DragStartContext {
    const areaPixelsSize = this.areas().map((area) => {
      const boundingRect = area._elementRef.nativeElement.getBoundingClientRect()
      const size = this.direction() === 'horizontal' ? boundingRect.width : boundingRect.height

      return roundWithPrecision(size, 1)
    })
    const allAreasSumPixels = sumNumArray(areaPixelsSize)

    return {
      startEvent,
      areaBeforeGutterIndex: mouseDownContext.areaBeforeGutterIndex,
      areaAfterGutterIndex: mouseDownContext.areaAfterGutterIndex,
      areaPixelsSize,
      areaIndexToBoundaries: toRecord(this.areas(), (area, index) => {
        // Precision of 3 prevents browser weird behavior with percent calculation and it is sensitive enough
        const percentToRoundedPixels = (percent: number) => roundWithPrecision((percent / 100) * allAreasSumPixels, 3)

        const value: AreaBoundary =
          this.unit() === 'pixel'
            ? {
                min: area._normalizedMinSize(),
                max: area._normalizedMaxSize(),
              }
            : {
                min: percentToRoundedPixels(area._normalizedMinSize()),
                max: percentToRoundedPixels(area._normalizedMaxSize()),
              }

        return [index.toString(), value]
      }),
    }
  }

  private eventsEqualWithDelta(startEvent: MouseEvent | TouchEvent, endEvent: MouseEvent | TouchEvent) {
    // We are leaving the gutter with this mousemove event
    if (startEvent.target !== endEvent.target) {
      return false
    }

    const startPoint = getMousePointFromEvent(startEvent)
    const endPoint = getMousePointFromEvent(endEvent)
    const deltaInPx = this.gutterClickDeltaPx()

    return Math.abs(endPoint.x - startPoint.x) <= deltaInPx && Math.abs(endPoint.y - startPoint.y) <= deltaInPx
  }

  private dragMove(moveEvent: MouseEvent | TouchEvent, dragStartContext: DragStartContext) {
    moveEvent.preventDefault()
    moveEvent.stopPropagation()

    const startPoint = getMousePointFromEvent(dragStartContext.startEvent)
    const endPoint = getMousePointFromEvent(moveEvent)
    const preDirOffset = this.direction() === 'horizontal' ? endPoint.x - startPoint.x : endPoint.y - startPoint.y
    const offset = this.dir() === 'ltr' ? preDirOffset : -preDirOffset
    const isDraggingForward = offset > 0
    // Align offset with gutter step and abs it as we need absolute pixels movement
    const absSteppedOffset = Math.abs(Math.round(offset / this.gutterStep()) * this.gutterStep())
    // Copy as we don't want to edit the original array
    const tempAreaPixelsSize = [...dragStartContext.areaPixelsSize]
    // As we are going to shuffle the areas order for easier iterations we should work with area indices array
    // instead of actual area sizes array
    const areasIndices = tempAreaPixelsSize.map((_, index) => index)
    // The two variables below are ordered for iterations with real area indices inside.
    const areasIndicesBeforeGutter = this.restrictMove()
      ? [dragStartContext.areaBeforeGutterIndex]
      : areasIndices.slice(0, dragStartContext.areaBeforeGutterIndex + 1).reverse()
    const areasIndicesAfterGutter = this.restrictMove()
      ? [dragStartContext.areaAfterGutterIndex]
      : areasIndices.slice(dragStartContext.areaAfterGutterIndex)
    // Based on direction we need to decide which areas are expanding and which are shrinking
    const potentialAreasIndicesArrToShrink = isDraggingForward ? areasIndicesAfterGutter : areasIndicesBeforeGutter
    const potentialAreasIndicesArrToExpand = isDraggingForward ? areasIndicesBeforeGutter : areasIndicesAfterGutter

    let remainingPixels = absSteppedOffset
    let potentialShrinkArrIndex = 0
    let potentialExpandArrIndex = 0

    // We gradually run in both expand and shrink direction transferring pixels from the offset.
    // We stop once no pixels are left or we reached the end of either the expanding areas or the shrinking areas
    while (
      remainingPixels !== 0 &&
      potentialShrinkArrIndex < potentialAreasIndicesArrToShrink.length &&
      potentialExpandArrIndex < potentialAreasIndicesArrToExpand.length
    ) {
      const areaIndexToShrink = potentialAreasIndicesArrToShrink[potentialShrinkArrIndex]
      const areaIndexToExpand = potentialAreasIndicesArrToExpand[potentialExpandArrIndex]
      const areaToShrinkSize = tempAreaPixelsSize[areaIndexToShrink]
      const areaToExpandSize = tempAreaPixelsSize[areaIndexToExpand]
      const areaToShrinkMinSize = dragStartContext.areaIndexToBoundaries[areaIndexToShrink].min
      const areaToExpandMaxSize = dragStartContext.areaIndexToBoundaries[areaIndexToExpand].max
      // We can only transfer pixels based on the shrinking area min size and the expanding area max size
      // to avoid overflow. If any pixels left they will be handled by the next area in teh next while iteration
      const maxPixelsToShrink = areaToShrinkSize - areaToShrinkMinSize
      const maxPixelsToExpand = areaToExpandMaxSize - areaToExpandSize
      const pixelsToTransfer = Math.min(maxPixelsToShrink, maxPixelsToExpand, remainingPixels)

      // Actual pixels transfer
      tempAreaPixelsSize[areaIndexToShrink] -= pixelsToTransfer
      tempAreaPixelsSize[areaIndexToExpand] += pixelsToTransfer
      remainingPixels -= pixelsToTransfer

      // Once min threshold reached we need to move to the next area in turn
      if (tempAreaPixelsSize[areaIndexToShrink] === areaToShrinkMinSize) {
        potentialShrinkArrIndex++
      }

      // Once max threshold reached we need to move to the next area in turn
      if (tempAreaPixelsSize[areaIndexToExpand] === areaToExpandMaxSize) {
        potentialExpandArrIndex++
      }
    }

    // Once pixels transfer is done - we can update the areas with their new sizes
    const allAreasSumPixels = sumNumArray(tempAreaPixelsSize)

    this.areas().forEach((area, index) => {
      // No need to update wildcard size
      if (area._internalSize() === '*') {
        return
      }

      if (this.unit() === 'pixel') {
        area._internalSize.set(tempAreaPixelsSize[index])
      } else {
        // Precision of 3 prevents browser weird behavior with percent calculation and it is sensitive enough
        const percentSize = roundWithPrecision((tempAreaPixelsSize[index] / allAreasSumPixels) * 100, 3)
        area._internalSize.set(percentSize)
      }
    })
  }
}
