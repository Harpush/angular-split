import {
  Component,
  ElementRef,
  HostBinding,
  Signal,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  model,
} from '@angular/core'
import { NewSplitComponent } from '../new-split/new-split.component'
import { AreaSize } from '../models'
import { createClassesString } from '../utils'

type SplitAreaSize = AreaSize | `${number}` | null | undefined

const areaSizeTransform = (areaSize: SplitAreaSize): AreaSize =>
  areaSize === null || areaSize === undefined || areaSize === '*' ? '*' : +areaSize

@Component({
  selector: 'as-new-split-area',
  standalone: true,
  exportAs: 'asSplitArea',
  templateUrl: './new-split-area.component.html',
  styleUrl: './new-split-area.component.scss',
})
export class NewSplitAreaComponent {
  protected readonly split = inject(NewSplitComponent)
  readonly _elementRef = inject<ElementRef<HTMLElement>>(ElementRef)

  readonly size = model<SplitAreaSize>('*')
  readonly minSize = input('*', { transform: areaSizeTransform })
  readonly maxSize = input('*', { transform: areaSizeTransform })
  readonly lockSize = input(false, { transform: booleanAttribute })
  // TODO: visible
  // TODO: transition
  // TODO: collapse/expand

  readonly _normalizedSize = computed(() => areaSizeTransform(this.size()))
  readonly _normalizedMinSize = computed(() => this.normalizeSizeBoundary(this.minSize, 0))
  readonly _normalizedMaxSize = computed(() => this.normalizeSizeBoundary(this.maxSize, Infinity))
  private readonly index = computed(() => this.split.areas().findIndex((area) => area === this))
  private readonly gridAreaNum = computed(() => this.index() * 2 + 1)
  private readonly hostClasses = computed(() =>
    createClassesString({
      ['as-split-area']: true,
      ['as-min']: this._normalizedSize() === this._normalizedMinSize(),
      ['as-max']: this._normalizedSize() === this._normalizedMaxSize(),
    }),
  )

  @HostBinding('class') protected get hostClassesBinding() {
    return this.hostClasses()
  }
  @HostBinding('style.grid-column') protected get hostGridColumnStyleBinding() {
    return this.split.direction() === 'horizontal' ? `${this.gridAreaNum()} / ${this.gridAreaNum()}` : undefined
  }
  @HostBinding('style.grid-row') protected get hostGridRowStyleBinding() {
    return this.split.direction() === 'vertical' ? `${this.gridAreaNum()} / ${this.gridAreaNum()}` : undefined
  }
  @HostBinding('style.position') protected get hostPositionStyleBinding() {
    return this.split._isDragging() ? 'relative' : undefined
  }

  constructor() {
    effect(() => {
      const size = this._normalizedSize()

      if (size === '*') {
        return
      }

      if (size > this._normalizedMaxSize()) {
        throw new Error('as-split: size cannot be larger than maxSize')
      }
    })

    effect(() => {
      const size = this._normalizedSize()

      if (size === '*') {
        return
      }

      if (size < this._normalizedMinSize()) {
        throw new Error('as-split: size cannot be smaller than minSize')
      }
    })

    // TODO: lockSize with * not supported...
  }

  private normalizeSizeBoundary(sizeBoundarySignal: Signal<AreaSize>, defaultNum: number): number {
    if (this.lockSize()) {
      const size = areaSizeTransform(this.size())

      return size === '*' ? defaultNum : size
    }

    const sizeBoundary = sizeBoundarySignal()

    return sizeBoundary === '*' ? defaultNum : sizeBoundary
  }
}
