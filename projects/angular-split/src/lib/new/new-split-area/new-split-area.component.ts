import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostBinding,
  Signal,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
} from '@angular/core'
import { NewSplitComponent } from '../new-split/new-split.component'
import { createClassesString, mirrorSignal } from '../utils'
import { SplitAreaSize, areaSizeTransform, boundaryAreaSizeTransform } from '../models'

@Component({
  selector: 'as-new-split-area',
  standalone: true,
  exportAs: 'asSplitArea',
  templateUrl: './new-split-area.component.html',
  styleUrl: './new-split-area.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewSplitAreaComponent {
  protected readonly split = inject(NewSplitComponent)
  readonly _elementRef = inject<ElementRef<HTMLElement>>(ElementRef)

  readonly size = input('auto', { transform: areaSizeTransform })
  readonly minSize = input('*', { transform: boundaryAreaSizeTransform })
  readonly maxSize = input('*', { transform: boundaryAreaSizeTransform })
  readonly lockSize = input(false, { transform: booleanAttribute })
  readonly visible = input(true)

  // As size is an input and we can change the size without the outside
  // listening to the change we need an intermediate writeable signal
  readonly _internalSize = mirrorSignal(
    computed((): SplitAreaSize => {
      if (!this.visible()) {
        return 0
      }

      const size = this.size()
      // auto will get fixed by the effect in split component
      return size === 'auto' ? '*' : size
    }),
  )
  readonly _normalizedMinSize = computed(() => this.normalizeSizeBoundary(this.minSize, 0))
  readonly _normalizedMaxSize = computed(() => this.normalizeSizeBoundary(this.maxSize, Infinity))
  private readonly index = computed(() => this.split._areas().findIndex((area) => area === this))
  private readonly gridAreaNum = computed(() => this.index() * 2 + 1)
  private readonly hostClasses = computed(() =>
    createClassesString({
      ['as-split-area']: true,
      ['as-min']: this._internalSize() === this._normalizedMinSize(),
      ['as-max']: this._internalSize() === this._normalizedMaxSize(),
      ['as-hidden']: !this.visible(),
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
      const size = this._internalSize()
      const maxSize = this.maxSize()
      const unit = this.split.unit()
      const visible = this.visible()

      if (!visible) {
        return
      }

      if (unit === 'pixel' && size === '*' && maxSize !== '*') {
        throw new Error('as-split: maxSize not allowed on * in pixel mode')
      }

      if (size === '*' || maxSize === '*') {
        return
      }

      if (size > maxSize) {
        throw new Error('as-split: size cannot be larger than maxSize')
      }
    })

    effect(() => {
      const size = this._internalSize()
      const minSize = this.minSize()
      const unit = this.split.unit()
      const visible = this.visible()

      if (!visible) {
        return
      }

      if (unit === 'pixel' && size === '*' && minSize !== '*') {
        throw new Error('as-split: minSize not allowed on * in pixel mode')
      }

      if (size === '*' || minSize === '*') {
        return
      }

      if (size < minSize) {
        throw new Error('as-split: size cannot be smaller than minSize')
      }
    })

    effect(() => {
      const size = this._internalSize()
      const lockSize = this.lockSize()
      const visible = this.visible()

      if (!visible) {
        return
      }

      if (lockSize && size === '*') {
        throw new Error(`as-split: lockSize isn't supported on area with * size or without size`)
      }
    })
  }

  private normalizeSizeBoundary(sizeBoundarySignal: Signal<SplitAreaSize>, defaultNum: number): number {
    if (this.lockSize()) {
      const size = this.size()

      // Should never happen and guarded by an effect. But in case after the error someone starts dragging
      // it might get to an endless loop unless we handle it here.
      return size === '*' || size === 'auto' ? defaultNum : size
    }

    const sizeBoundary = sizeBoundarySignal()

    return sizeBoundary === '*' ? defaultNum : sizeBoundary
  }
}
