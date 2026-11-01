import type { cameraAt, cutStateAt, poseAt, splitAt } from './choreography'

export type ScreenBounds = { left: number; top: number; right: number; bottom: number }
export type RenderStats = {
  calls: number; triangles: number; points: number; frame: number; dpr: number
  viewport: number[]
  camera: number[]; character?: number[]; upperHalf?: number[]; lowerHalf?: number[]
  background: string; clearColor: string; fog: boolean
  nameLines?: string[]; nameMaterial?: { type: string; color: string; toneMapped: boolean }
  cut: ReturnType<typeof cutStateAt>
  sparks: { count: number; live: number; visible: number; primitive: string }
  screen?: {
    name: ScreenBounds; character: ScreenBounds; blade: ScreenBounds; face: ScreenBounds
    frontFaceSamples: number[][]
    nameCenter: number[]; characterOrigin: number[]; bladeBase: number[]; bladeTip: number[]
    cutStart: number[]; cutEnd: number[]; cutNormal: number[]
    trail: number[][]; sparkOrigins: number[][]
  }
}
export type PortfolioDebug = {
  ready: boolean; reducedMotion: boolean; render?: RenderStats
  scrollToProgress: (p: number) => void
  getState: () => {
    p: number; scroll: number; pose: ReturnType<typeof poseAt>; split: ReturnType<typeof splitAt>
    camera: ReturnType<typeof cameraAt>; flash: number; active: boolean
  }
}
