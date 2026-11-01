import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { scrollProgressAt } from './choreography'

gsap.registerPlugin(ScrollTrigger)
export type ProgressRef = { current: number; scroll: number }
export function useScrollProgress(section: RefObject<HTMLElement | null>, stage: RefObject<HTMLDivElement | null>, reducedMotion: boolean, onProgress: (p: number) => void) {
  const progress = useRef<ProgressRef>({ current: 0, scroll: 0 }).current
  const callback = useRef(onProgress)
  callback.current = onProgress
  useLayoutEffect(() => {
    if (!section.current || !stage.current || reducedMotion) {
      progress.current = progress.scroll = 0
      callback.current(0)
      return
    }
    const state = { p: 0 }
    const context = gsap.context(() => {
      gsap.to(state, {
        p: 1, ease: 'none', onUpdate: () => {
          progress.current = progress.scroll = scrollProgressAt(state.p, window.innerHeight * 3)
          callback.current(progress.current)
        },
        scrollTrigger: { id: 'forgewalker', trigger: section.current, start: 'top top', end: () => '+=' + window.innerHeight * 3, pin: stage.current, pinSpacing: false, scrub: true, invalidateOnRefresh: true, anticipatePin: 1 },
      })
    }, section)
    const refresh = () => ScrollTrigger.refresh()
    window.addEventListener('load', refresh)
    return () => { window.removeEventListener('load', refresh); context.revert() }
  }, [section, stage, reducedMotion, progress])
  return progress
}
