export type AreaSize = number | '*'

export type Unit = 'pixel' | 'percent'

export interface GutterInteractionEvent {
  gutterNum: number
  sizes: AreaSize[]
}
