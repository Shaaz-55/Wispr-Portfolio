import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import ChatPanel from './chat/ChatPanel'
import { cameraAt, clamp, flashAt, layoutAtAspect, poseAt, smoothstep, splitAt } from './scene/choreography'
import type { PortfolioDebug } from './scene/diagnostics'
import { useScrollProgress } from './scene/useScrollProgress'
import { useHeroAudio } from './scene/useHeroAudio'

const Scene = lazy(() => import('./scene/Scene'))

declare global {
  interface Window { __portfolio?: PortfolioDebug }
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    media.addEventListener('change', update)
    update()
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

function hasWebGL() {
  try {
    const context = document.createElement('canvas').getContext('webgl2')
    if (!context) return false
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch { return false }
}

export default function App() {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const mobile = useMediaQuery('(max-width: 767px)')
  const [unavailable, setUnavailable] = useState(() => !hasWebGL())
  const [ready, setReady] = useState(false)
  const [atChat, setAtChat] = useState(false)
  const [intersecting, setIntersecting] = useState(true)
  const [documentVisible, setDocumentVisible] = useState(!document.hidden)
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const pendingChatFocus = useRef(false)
  const staticMode = reducedMotion || unavailable
  const frozen = new URLSearchParams(window.location.search).has('verify')
  const active = intersecting && documentVisible && !atChat && !staticMode
  const activeRef = useRef(active)
  activeRef.current = active

  const onProgress = useCallback((p: number) => {
    const chat = smoothstep(0.87, 0.992, p)
    if (stage.current) {
      stage.current.style.setProperty('--scene-opacity', String(1 - chat))
      stage.current.style.setProperty('--chat-opacity', String(chat))
      stage.current.style.setProperty('--chat-rise', `${(1 - chat) * 45}px`)
      stage.current.style.setProperty('--chat-visibility', chat > 0 ? 'visible' : 'hidden')
      stage.current.dataset.progress = p.toFixed(5)
    }
    setAtChat(p >= 0.992)
  }, [])
  const progress = useScrollProgress(section, stage, staticMode, onProgress)
  useHeroAudio(progress, active && !frozen)
  const onReady = useCallback(() => setReady(true), [])
  const onSceneError = useCallback(() => setUnavailable(true), [])

  useEffect(() => {
    const element = stage.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => setIntersecting(entry.isIntersecting), { threshold: 0 })
    observer.observe(element)
    const visibility = () => setDocumentVisible(!document.hidden)
    document.addEventListener('visibilitychange', visibility)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', visibility) }
  }, [staticMode])
  useEffect(() => {
    if (atChat && pendingChatFocus.current) {
      pendingChatFocus.current = false
      document.getElementById('chat-input')?.focus({ preventScroll: true })
    }
  }, [atChat])
  useEffect(() => {
    document.documentElement.dataset.verify = String(frozen)
    window.__portfolio = {
      ready: ready || staticMode,
      reducedMotion,
      render: window.__portfolio?.render,
      scrollToProgress: (p: number) => window.scrollTo({ top: (section.current?.offsetTop || 0) + clamp(p) * window.innerHeight * 3, behavior: 'instant' }),
      getState: () => {
        const aspect = window.innerWidth / window.innerHeight
        const layout = layoutAtAspect(aspect, window.innerWidth < 768)
        return { p: progress.current, scroll: progress.scroll, pose: poseAt(progress.current, layout), split: splitAt(progress.current, layout), camera: cameraAt(progress.current, aspect, layout.mobile), flash: flashAt(progress.current), active: activeRef.current }
      },
    }
    return () => { delete window.__portfolio }
  }, [frozen, progress, ready, reducedMotion, staticMode])

  const goChat = () => {
    if (atChat) {
      document.getElementById('chat-input')?.focus({ preventScroll: true })
    } else if (staticMode) {
      document.getElementById('chat')?.scrollIntoView({ behavior: 'instant' })
      document.getElementById('chat-input')?.focus({ preventScroll: true })
    } else {
      pendingChatFocus.current = true
      window.scrollTo({ top: (section.current?.offsetTop || 0) + window.innerHeight * 3, behavior: frozen ? 'instant' : 'smooth' })
    }
  }
  const replay = () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.scrollTo({ top: 0, behavior: reducedMotion || frozen ? 'instant' : 'smooth' })
  }

  return <>
    <a className="skip-link" href="#chat" onClick={event => { event.preventDefault(); goChat() }}>Skip to the conversation</a>
    <main>
      <section ref={section} id="story" className={`story-section ${staticMode ? 'is-static' : ''}`} aria-label="Shaaz Hemani">
        <div ref={stage} className={`story-stage ${atChat ? 'is-chat' : ''} ${ready ? 'is-ready' : ''}`} data-progress="0.00000">
          <h1 className="sr-only">Shaaz Hemani</h1>
          {staticMode ? <div className="static-art" aria-hidden="true"><div className="static-name"><span>Shaaz</span><span>Hemani</span></div></div> : <div className="scene-canvas" aria-hidden="true">
            <Suspense fallback={null}><Scene progress={progress} active={active} mobile={mobile} frozen={frozen} onReady={onReady} onError={onSceneError} /></Suspense>
          </div>}
          {!staticMode && <div id="chat" className="chat-stage" aria-hidden={!atChat} inert={!atChat}><ChatPanel active={atChat} queuedQuestion={null} onReplay={replay} /></div>}
        </div>
      </section>
      {staticMode && <div id="chat" className="static-chat"><ChatPanel active queuedQuestion={null} onReplay={replay} /></div>}
    </main>
  </>
}
