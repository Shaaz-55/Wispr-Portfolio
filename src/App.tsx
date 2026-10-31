import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowDownRight, ArrowRight, ArrowUpRight, Flame, MoveDown, Sparkles } from 'lucide-react'
import ChatPanel from './chat/ChatPanel'
import type { QueuedQuestion } from './chat/ChatPanel'
import { cameraAt, clamp, flashAt, phaseAt, poseAt, smoothstep, splitAt } from './scene/choreography'
import { useScrollProgress } from './scene/useScrollProgress'

const Scene = lazy(() => import('./scene/Scene'))

type RenderStats = { calls: number; triangles: number; points: number; frame: number; dpr: number; fog?: number[]; camera: number[]; character?: number[]; upperHalf?: number[]; lowerHalf?: number[] }
declare global {
  interface Window {
    __portfolio?: {
      ready: boolean
      reducedMotion: boolean
      render?: RenderStats
      scrollToProgress: (p: number) => void
      getState: () => { p: number; pose: ReturnType<typeof poseAt>; split: ReturnType<typeof splitAt>; camera: ReturnType<typeof cameraAt>; flash: number; active: boolean }
    }
  }
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
  const mobile = useMediaQuery('(max-width: 700px)')
  const [unavailable, setUnavailable] = useState(() => !hasWebGL())
  const [ready, setReady] = useState(false)
  const [atChat, setAtChat] = useState(false)
  const [intersecting, setIntersecting] = useState(true)
  const [documentVisible, setDocumentVisible] = useState(!document.hidden)
  const [queuedQuestion, setQueuedQuestion] = useState<QueuedQuestion | null>(null)
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const chapterIndex = useRef<HTMLSpanElement>(null)
  const chapterLabel = useRef<HTMLSpanElement>(null)
  const chapterTitle = useRef<HTMLParagraphElement>(null)
  const percent = useRef<HTMLSpanElement>(null)
  const staticMode = reducedMotion || unavailable
  const frozen = new URLSearchParams(window.location.search).has('verify')
  const active = intersecting && documentVisible && !atChat && !staticMode
  const activeRef = useRef(active)
  activeRef.current = active

  const onProgress = useCallback((p: number) => {
    const chat = smoothstep(0.87, 0.992, p)
    const exit = smoothstep(0.77, 0.96, p)
    if (stage.current) {
      stage.current.style.setProperty('--progress', String(p))
      stage.current.style.setProperty('--story-opacity', String(1 - exit))
      stage.current.style.setProperty('--scene-opacity', String(1 - smoothstep(0.87, 0.992, p)))
      stage.current.style.setProperty('--chat-opacity', String(chat))
      stage.current.style.setProperty('--chat-rise', `${(1 - chat) * 45}px`)
      stage.current.style.setProperty('--flash', String(flashAt(p)))
      stage.current.style.setProperty('--hint-opacity', String(1 - smoothstep(0.035, 0.16, p)))
      stage.current.dataset.progress = p.toFixed(5)
    }
    const phase = phaseAt(p)
    if (chapterIndex.current) chapterIndex.current.textContent = phase.index
    if (chapterLabel.current) chapterLabel.current.textContent = phase.label
    if (chapterTitle.current) chapterTitle.current.textContent = phase.title
    if (percent.current) percent.current.textContent = `${Math.round(p * 100).toString().padStart(2, '0')}%`
    setAtChat(p >= 0.992)
  }, [])
  const progress = useScrollProgress(section, stage, staticMode, onProgress)
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
    document.documentElement.dataset.verify = String(frozen)
    window.__portfolio = {
      ready: ready || staticMode,
      reducedMotion,
      render: window.__portfolio?.render,
      scrollToProgress: (p: number) => window.scrollTo({ top: (section.current?.offsetTop || 0) + clamp(p) * window.innerHeight * 3, behavior: 'instant' }),
      getState: () => ({ p: progress.current, pose: poseAt(progress.current), split: splitAt(progress.current), camera: cameraAt(progress.current, window.innerWidth / window.innerHeight), flash: flashAt(progress.current), active: activeRef.current }),
    }
    return () => { delete window.__portfolio }
  }, [frozen, progress, ready, reducedMotion, staticMode])

  const goChat = (question?: string) => {
    if (question) setQueuedQuestion({ id: Date.now(), text: question })
    if (staticMode) document.getElementById('chat')?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth' })
    else window.scrollTo({ top: (section.current?.offsetTop || 0) + window.innerHeight * 3, behavior: frozen ? 'instant' : 'smooth' })
  }
  const replay = () => window.scrollTo({ top: 0, behavior: reducedMotion || frozen ? 'instant' : 'smooth' })

  return <>
    <a className="skip-link" href="#chat" onClick={event => { event.preventDefault(); goChat(); setTimeout(() => document.getElementById('chat-input')?.focus({ preventScroll: true }), frozen ? 0 : 700) }}>Skip to the conversation</a>
    <header className={`site-header ${atChat ? 'at-chat' : ''}`}>
      <a className="wordmark" href="#story" onClick={event => { event.preventDefault(); replay() }} aria-label="Shaaz, back to the beginning"><span className="brand-symbol"><Flame size={22} strokeWidth={1.5} /></span><span>shaaz<span className="wordmark-period">.</span></span></a>
      <nav aria-label="Main navigation">
        <button type="button" className={!atChat ? 'is-current' : ''} onClick={replay}>The story</button>
        <button type="button" onClick={() => goChat('What have you built?')}>The work <ArrowUpRight size={12} /></button>
        <span className="nav-divider" />
        <button type="button" className="nav-ask" onClick={() => goChat()}>Ask me anything <ArrowUpRight size={13} /></button>
      </nav>
      <span className="header-status"><i /> OPEN TO POSSIBILITIES</span>
    </header>

    <main>
      <section ref={section} id="story" className={`story-section ${staticMode ? 'is-static' : ''}`} aria-label="The Forgewalker scroll story">
        <div ref={stage} className={`story-stage ${atChat ? 'is-chat' : ''} ${ready ? 'is-ready' : ''}`} data-progress="0.00000">
          <div className="scene-vignette" />
          {staticMode ? <div className="static-art" aria-label="SHAAZ, forged by curiosity"><span className="static-name">SHAAZ</span><span className="static-cut" /><Flame className="static-flame" size={88} strokeWidth={0.8} /></div> : <div className="scene-canvas" aria-hidden={atChat}>
            <Suspense fallback={null}><Scene progress={progress} active={active} mobile={mobile} frozen={frozen} onReady={onReady} onError={onSceneError} /></Suspense>
          </div>}
          <div className="scene-grain" />
          <div className="impact-flash" aria-hidden="true" />
          <div className="story-ui" aria-hidden={atChat} inert={atChat}>
            <h1 className="sr-only">Shaaz. Forged by curiosity. A CSE student, designer, and developer in Bengaluru.</h1>
            <div className="hero-topline"><span className="eyebrow"><span className="tiny-cross">+</span> AN INTERACTIVE PORTFOLIO</span><span className="edition">VOL. 01 <span>—</span> THE BEGINNING</span></div>
            <div className="hero-intro"><span>A LITTLE FIRE.</span><span>A LOT OF CURIOSITY.</span></div>
            <div className="location-stamp"><span className="location-cross">⌖</span><span>BENGALURU, IN<br /><span>12.9716° N · 77.5946° E</span></span></div>
            <div className="character-caption"><span className="caption-line" /><span>THE FORGEWALKER<small>Forged from a different kind of fire.</small></span></div>
            <div className="hero-bottom">
              <div className="hero-bio"><span className="eyebrow">STUDENT BY DAY. BUILDER BY INSTINCT.</span><p>Some follow a path.<br />I’d rather <em>make one.</em><ArrowDownRight size={26} strokeWidth={1} /></p><span className="hero-skills">CSE @ NST <i /> DESIGN <i /> DEVELOPMENT</span></div>
              <div className="scroll-invitation">{staticMode ? <button type="button" onClick={() => goChat()}>MEET THE MAKER <ArrowDown size={16} /></button> : <><span className="scroll-capsule"><MoveDown size={16} strokeWidth={1.5} /></span><span>SCROLL TO UNLEASH</span></>}</div>
              <div className="chapter"><div className="chapter-label"><span ref={chapterIndex} className="chapter-index">01</span><span ref={chapterLabel}>THE QUIET BEFORE</span><span ref={percent} className="chapter-percent">00%</span></div><div className="chapter-track"><span /><i /><i /><i /><i /></div><p ref={chapterTitle}>Every idea starts with a spark.</p><button type="button" className="skip-story" onClick={() => goChat()}>Skip the intro <ArrowRight size={13} /></button></div>
            </div>
            {!ready && !staticMode && <div className="scene-loader"><span /><span>FORGING THE FIRST IMPRESSION</span></div>}
          </div>
          {!staticMode && <div id="chat" className="chat-stage" aria-hidden={!atChat} inert={!atChat}><ChatPanel active={atChat} queuedQuestion={queuedQuestion} onReplay={replay} /></div>}
          <span className="edge-mark edge-mark-left" aria-hidden="true">S / 01</span>
          <span className="edge-mark edge-mark-right" aria-hidden="true"><Sparkles size={11} /> BUILT WITH INTENT</span>
        </div>
      </section>
      {staticMode && <div id="chat" className="static-chat"><ChatPanel active queuedQuestion={queuedQuestion} onReplay={replay} /></div>}
    </main>
  </>
}
