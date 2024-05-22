import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostBinding,
  NgZone,
  Renderer2,
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
import { Subject, filter, fromEvent, map, pairwise, skipWhile, startWith, switchMap, take, takeUntil, tap } from 'rxjs'
import {
  ClientPoint,
  createClassesString,
  eventsEqualWithDelta,
  fromMouseMoveEvent,
  fromMouseUpEvent,
  getPointFromEvent,
  leaveNgZone,
  roundWithPrecision,
  sum,
  sumNumArray,
  toRecord,
} from '../utils'
import { DOCUMENT, NgStyle } from '@angular/common'
import { SplitGutterInteractionEvent, SplitAreaSize, SplitUnit } from '../models'
import { SplitCustomEventsBehaviorDirective } from '../split-custom-events-behavior.directive'
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
  startEvent: MouseEvent | TouchEvent | KeyboardEvent
  areaPixelsSize: number[]
  areaIndexToBoundaries: Record<number, AreaBoundary>
  areaBeforeGutterIndex: number
  areaAfterGutterIndex: number
}

@Component({
  selector: 'as-new-split',
  standalone: true,
  imports: [NgStyle, SplitCustomEventsBehaviorDirective],
  exportAs: 'asSplit',
  templateUrl: './new-split.component.html',
  styleUrl: './new-split.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewSplitComponent {
  private readonly document = inject(DOCUMENT)
  private readonly renderer = inject(Renderer2)
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef)
  private readonly ngZone = inject(NgZone)

  // TODO: Global config
  private readonly gutterMouseDown$ = new Subject<MouseDownContext>()
  private readonly dragProgressSubject = new Subject<SplitGutterInteractionEvent>()

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
  readonly useTransition = input(false, { transform: booleanAttribute })
  readonly gutterClick = output<SplitGutterInteractionEvent>()
  readonly gutterDblClick = output<SplitGutterInteractionEvent>()
  readonly gutterDblClickDuration = input(0)
  readonly dragStart = output<SplitGutterInteractionEvent>()
  readonly dragEnd = output<SplitGutterInteractionEvent>()
  readonly transitionEnd = output<SplitAreaSize[]>()

  readonly dragProgress$ = this.dragProgressSubject.asObservable()

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
        columns.push('0fr')
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
        columns.push('0px')
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
      ['as-transition']: this.useTransition() && !this._isDragging(),
    }),
  )
  protected readonly draggedGutterIndex = signal<number>(undefined)
  readonly _isDragging = computed(() => this.draggedGutterIndex() !== undefined)

  @HostBinding('class') protected get hostClassesBinding() {
    return this.hostClasses()
  }

  constructor() {
    // Responsible for auto areas sizes distribution and areas sizes validations
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

    // Responsible for updating grid template style. Must be this way and not based on HostBinding
    // as change detection fo host binding is bound to the parent component and this style
    // is updated on every muse move. Doing it this way will prevent change detection cycles in parent.
    effect(() => {
      const gridTemplateColumnsStyle = this.gridTemplateColumnsStyle()
      this.renderer.setStyle(this.elementRef.nativeElement, 'grid-template', gridTemplateColumnsStyle)
    })

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
            skipWhile(([, currMoveEvent]) =>
              eventsEqualWithDelta(mouseDownContext.mouseDownEvent, currMoveEvent, this.gutterClickDeltaPx()),
            ),
            take(1),
            takeUntil(fromMouseUpEvent(this.document, true).pipe(take(1))),
            tap(() => {
              this.ngZone.run(() => {
                this.dragStart.emit(this.createDragInteractionEvent(mouseDownContext.gutterIndex))
                this.draggedGutterIndex.set(mouseDownContext.gutterIndex)
              })
            }),
            map(([prevMoveEvent]) =>
              this.createDragStartContext(
                prevMoveEvent,
                mouseDownContext.areaBeforeGutterIndex,
                mouseDownContext.areaAfterGutterIndex,
              ),
            ),
            switchMap((dragStartContext) =>
              fromMouseMoveEvent(this.document).pipe(
                tap((moveEvent) => this.mouseDragMove(moveEvent, dragStartContext)),
                takeUntil(fromMouseUpEvent(this.document, true).pipe(take(1))),
                tap({
                  complete: () => {
                    this.ngZone.run(() => {
                      this.dragEnd.emit(this.createDragInteractionEvent(this.draggedGutterIndex()))
                      this.draggedGutterIndex.set(undefined)
                    })
                  },
                }),
              ),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe()

    fromEvent<TransitionEvent>(this.elementRef.nativeElement, 'transitionend')
      .pipe(
        filter((e) => e.propertyName === 'grid-template'),
        leaveNgZone(),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.ngZone.run(() => this.transitionEnd.emit(this.createAreaSizes())))
  }

  protected gutterClicked(gutterIndex: number) {
    this.ngZone.run(() => this.gutterClick.emit(this.createDragInteractionEvent(gutterIndex)))
  }

  protected gutterDoubleClicked(gutterIndex: number) {
    this.ngZone.run(() => this.gutterDblClick.emit(this.createDragInteractionEvent(gutterIndex)))
  }

  protected gutterMouseDown(
    e: MouseEvent | TouchEvent,
    gutterIndex: number,
    areaBeforeGutterIndex: number,
    areaAfterGutterIndex: number,
  ) {
    // Only left clicks
    if (e instanceof MouseEvent && e.button !== 0) {
      return
    }

    if (this.disabled()) {
      return
    }

    e.preventDefault()
    e.stopPropagation()

    this.gutterMouseDown$.next({
      mouseDownEvent: e,
      gutterIndex,
      areaBeforeGutterIndex,
      areaAfterGutterIndex,
    })
  }

  protected gutterKeyDown(
    e: KeyboardEvent,
    gutterIndex: number,
    areaBeforeGutterIndex: number,
    areaAfterGutterIndex: number,
  ) {
    if (this.disabled()) {
      return
    }

    const pixelsToMove = 50
    const pageMoveMultiplier = 10

    let xPointOffset = 0
    let yPointOffset = 0

    if (this.direction() === 'horizontal') {
      // Even though we are going in the x axis we support page up and down
      switch (e.key) {
        case 'ArrowLeft':
          xPointOffset -= pixelsToMove
          break
        case 'ArrowRight':
          xPointOffset += pixelsToMove
          break
        case 'PageUp':
          if (this.dir() === 'rtl') {
            xPointOffset -= pixelsToMove * pageMoveMultiplier
          } else {
            xPointOffset += pixelsToMove * pageMoveMultiplier
          }
          break
        case 'PageDown':
          if (this.dir() === 'rtl') {
            xPointOffset += pixelsToMove * pageMoveMultiplier
          } else {
            xPointOffset -= pixelsToMove * pageMoveMultiplier
          }
          break
        default:
          return
      }
    } else {
      switch (e.key) {
        case 'ArrowUp':
          yPointOffset -= pixelsToMove
          break
        case 'ArrowDown':
          yPointOffset += pixelsToMove
          break
        case 'PageUp':
          yPointOffset -= pixelsToMove * pageMoveMultiplier
          break
        case 'PageDown':
          yPointOffset += pixelsToMove * pageMoveMultiplier
          break
        default:
          return
      }
    }

    e.preventDefault()
    e.stopPropagation()

    const gutterMidPoint = getPointFromEvent(e)
    const dragStartContext = this.createDragStartContext(e, areaBeforeGutterIndex, areaAfterGutterIndex)

    this.ngZone.run(() => {
      this.dragStart.emit(this.createDragInteractionEvent(gutterIndex))
      this.draggedGutterIndex.set(gutterIndex)

      this.dragMoveToPoint({ x: gutterMidPoint.x + xPointOffset, y: gutterMidPoint.y + yPointOffset }, dragStartContext)

      this.dragEnd.emit(this.createDragInteractionEvent(gutterIndex))
      this.draggedGutterIndex.set(undefined)
    })
  }

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
      sizes: this.createAreaSizes(),
    }
  }

  private createAreaSizes() {
    return this.visibleAreas().map((area) => area._internalSize())
  }

  private createDragStartContext(
    startEvent: MouseEvent | TouchEvent | KeyboardEvent,
    areaBeforeGutterIndex: number,
    areaAfterGutterIndex: number,
  ): DragStartContext {
    const areaPixelsSize = this.areas().map((area) => {
      const boundingRect = area._elementRef.nativeElement.getBoundingClientRect()
      const size = this.direction() === 'horizontal' ? boundingRect.width : boundingRect.height

      return roundWithPrecision(size, 1)
    })
    const allAreasSumPixels = sumNumArray(areaPixelsSize)

    return {
      startEvent,
      areaBeforeGutterIndex,
      areaAfterGutterIndex,
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

  private mouseDragMove(moveEvent: MouseEvent | TouchEvent, dragStartContext: DragStartContext) {
    moveEvent.preventDefault()
    moveEvent.stopPropagation()

    const endPoint = getPointFromEvent(moveEvent)

    this.dragMoveToPoint(endPoint, dragStartContext)
  }

  private dragMoveToPoint(endPoint: ClientPoint, dragStartContext: DragStartContext) {
    const startPoint = getPointFromEvent(dragStartContext.startEvent)
    const preDirOffset = this.direction() === 'horizontal' ? endPoint.x - startPoint.x : endPoint.y - startPoint.y
    const offset = this.direction() === 'horizontal' && this.dir() === 'rtl' ? -preDirOffset : preDirOffset
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

    this.dragProgressSubject.next(this.createDragInteractionEvent(this.draggedGutterIndex()))
  }
}
