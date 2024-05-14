import {
  Component,
  ElementRef,
  HostBinding,
  Renderer2,
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

type SplitAreaSize = AreaSize | `${number}` | null | undefined

const areaSizeTransform = (areaSize: SplitAreaSize): AreaSize =>
  areaSize === null || areaSize === undefined || areaSize === '*' ? '*' : +areaSize

@Component({
  selector: 'as-new-split-area',
  standalone: true,
  templateUrl: './new-split-area.component.html',
  styleUrl: './new-split-area.component.scss',
})
export class NewSplitAreaComponent {
  protected readonly split = inject(NewSplitComponent)
  private readonly renderer = inject(Renderer2)
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

  @HostBinding('class.as-min') get isHostMinSize() {
    return this._normalizedSize() === this._normalizedMinSize()
  }
  @HostBinding('class.as-max') get isHostMaxSize() {
    return this._normalizedSize() === this._normalizedMaxSize()
  }

  constructor() {
    this.renderer.addClass(this._elementRef.nativeElement, 'as-split-area')

    // Update grid css properties for area
    effect(() => {
      const style = `${this.gridAreaNum()} / ${this.gridAreaNum()}`

      if (this.split.direction() === 'horizontal') {
        this.renderer.setStyle(this._elementRef.nativeElement, 'grid-column', style)
      } else {
        this.renderer.setStyle(this._elementRef.nativeElement, 'grid-row', style)
      }
    })

    // Add position relative for the iframe fix class
    effect(() => {
      if (this.split._isDragging()) {
        this.renderer.setStyle(this._elementRef.nativeElement, 'position', 'relative')
      } else {
        this.renderer.removeStyle(this._elementRef.nativeElement, 'position')
      }
    })
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
