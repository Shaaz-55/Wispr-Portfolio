import { useEffect, useRef } from 'react'
import { IMPACT, cutProgressAt, seededRandom, smoothstep } from './choreography'
import type { ProgressRef } from './useScrollProgress'

// Optional, self-contained synthesis. Remove this hook call (or use
// ?sound=0) to remove audio; no audio assets or autoplay permission needed.
export function useHeroAudio(progress: ProgressRef, enabled: boolean) {
  const active = useRef(enabled)
  active.current = enabled
  useEffect(() => {
    if (new URLSearchParams(location.search).get('sound') === '0') return
    let context: AudioContext | undefined, master: GainNode | undefined
    let drone: OscillatorNode[] = [], droneFilter: BiquadFilterNode | undefined
    let previous = progress.current, frame = 0
    const sources = new Set<AudioScheduledSourceNode>()
    const noise = () => {
      const buffer = context!.createBuffer(1, context!.sampleRate, context!.sampleRate)
      const random = seededRandom(4311), data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1
      return buffer
    }
    const burst = (duration: number, volume: number, frequency: number, endFrequency: number, type: BiquadFilterType = 'bandpass') => {
      if (!context || !master) return
      const now = context.currentTime, source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain()
      source.buffer = noise(); filter.type = type; filter.Q.value = 0.7
      filter.frequency.setValueAtTime(frequency, now); filter.frequency.exponentialRampToValueAtTime(endFrequency, now + duration)
      gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(volume, now + 0.01); gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
      source.connect(filter).connect(gain).connect(master); sources.add(source)
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); sources.delete(source) }
      source.start(now); source.stop(now + duration)
    }
    const tone = (frequency: number, end: number, duration: number, volume: number) => {
      if (!context || !master) return
      const now = context.currentTime, oscillator = context.createOscillator(), gain = context.createGain()
      oscillator.frequency.setValueAtTime(frequency, now); oscillator.frequency.exponentialRampToValueAtTime(end, now + duration)
      gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
      oscillator.connect(gain).connect(master); sources.add(oscillator)
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); sources.delete(oscillator) }
      oscillator.start(now); oscillator.stop(now + duration)
    }
    const unlock = () => {
      if (!active.current) return
      if (context) { void context.resume().catch(() => {}); return }
      try {
        context = new AudioContext()
        master = context.createGain(); master.gain.value = 0; master.connect(context.destination)
        droneFilter = context.createBiquadFilter(); droneFilter.type = 'lowpass'; droneFilter.frequency.value = 190
        const gain = context.createGain(); gain.gain.value = 0.035
        droneFilter.connect(gain).connect(master)
        drone = [-6, 6].map(detune => {
          const oscillator = context!.createOscillator(); oscillator.type = 'sawtooth'; oscillator.frequency.value = 57; oscillator.detune.value = detune
          oscillator.connect(droneFilter!); oscillator.start(); return oscillator
        })
        void context.resume().catch(() => {})
      } catch { context = undefined }
    }
    const tick = () => {
      const p = progress.current
      if (context && master) {
        const audible = active.current && !document.hidden && p < 0.85
        master.gain.setTargetAtTime(audible ? 0.24 : 0, context.currentTime, 0.035)
        const windup = smoothstep(0.1, 0.28, p), sweep = p >= 0.28 && p < 0.5 ? 1 : 0
        drone.forEach(oscillator => oscillator.frequency.setTargetAtTime(57 + windup * 15 + sweep * cutProgressAt(p) * 55, context!.currentTime, 0.025))
        droneFilter?.frequency.setTargetAtTime(180 + sweep * 650, context.currentTime, 0.025)
        if (audible && p > previous) {
          if (previous < 0.28 && p >= 0.28 && p < 0.5) burst(0.35, 0.27, 260, 2800)
          if (previous < IMPACT && p >= IMPACT && p < 0.55) {
            tone(1950, 1050, 0.22, 0.11); tone(78, 34, 0.19, 0.5)
            burst(0.12, 0.44, 4500, 1900, 'highpass'); burst(0.9, 0.12, 3400, 1000, 'highpass')
          }
        }
      }
      previous = p; frame = requestAnimationFrame(tick)
    }
    window.addEventListener('pointerdown', unlock, { passive: true })
    window.addEventListener('keydown', unlock)
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock)
      sources.forEach(source => { try { source.stop() } catch { /* Already finished. */ } })
      drone.forEach(oscillator => oscillator.stop())
      void context?.close().catch(() => {})
    }
  }, [progress])
}
