export type AreaSize = number | '*'

export interface GutterInteractionEvent {
  gutterNum: number
  sizes: AreaSize[]
}
