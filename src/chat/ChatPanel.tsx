import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, Check, Code2, Compass, Copy, Layers3, RotateCcw, Sparkles, Square, X } from 'lucide-react'
import profile from '../../data/profile.json'
import MicButton from './MicButton'

type Message = { id: number; role: 'user' | 'assistant'; content: string }
export type QueuedQuestion = { id: number; text: string }
type Props = { active: boolean; queuedQuestion: QueuedQuestion | null; onReplay: () => void }

const suggestions = [
  { icon: Layers3, title: 'What have you built?', detail: 'Ideas brought to life' },
  { icon: Code2, title: 'What’s in your toolkit?', detail: 'The things I work with', question: 'What skills and technologies do you use?' },
  { icon: Compass, title: 'Tell me about yourself', detail: 'A little more human' },
  { icon: Sparkles, title: 'A risk worth taking?', detail: 'The story behind the work', question: 'Tell me about a risk you have taken.' },
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return <button type="button" className="copy-button" aria-label={copied ? 'Answer copied' : 'Copy answer'} title={copied ? 'Copied' : 'Copy answer'} onClick={async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); timer.current = setTimeout(() => setCopied(false), 1800) }
    catch { setCopied(false) }
  }}>{copied ? <Check size={13} /> : <Copy size={13} />}</button>
}

export default function ChatPanel({ active, queuedQuestion, onReplay }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [voiceStatus, setVoiceStatus] = useState('')
  const [mode, setMode] = useState('profile')
  const [view, setView] = useState<'chat' | 'work'>('chat')
  const [hasNewContent, setHasNewContent] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const busy = useRef(false)
  const history = useRef<Message[]>([])
  const input = useRef<HTMLTextAreaElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const followOutput = useRef(true)
  const lastQuestion = useRef('')
  const processedQueue = useRef(0)
  const sequence = useRef(0)
  history.current = messages

  useEffect(() => {
    const abort = new AbortController()
    void fetch('/api/health', { signal: abort.signal }).then(response => response.json()).then((data: { mode?: string }) => setMode(data.mode || 'profile')).catch(() => {})
    return () => { abort.abort(); controller.current?.abort() }
  }, [])
  useEffect(() => {
    if (log.current && followOutput.current) log.current.scrollTop = log.current.scrollHeight
    else if (loading) setHasNewContent(true)
  }, [messages, loading])
  useEffect(() => {
    if (input.current) { input.current.style.height = 'auto'; input.current.style.height = `${Math.min(input.current.scrollHeight, 124)}px` }
  }, [draft])

  const ask = useCallback(async (question: string) => {
    const text = question.trim()
    if (!text || busy.current) return
    busy.current = true
    setLoading(true)
    setError('')
    setVoiceStatus('')
    setDraft('')
    setView('chat')
    followOutput.current = true
    lastQuestion.current = text
    const user: Message = { id: ++sequence.current, role: 'user', content: text }
    const answer: Message = { id: ++sequence.current, role: 'assistant', content: '' }
    const conversation = [...history.current.filter(message => message.content.trim()), user].slice(-19)
    setMessages([...conversation, answer])
    const abort = new AbortController()
    controller.current = abort
    let complete = false
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ messages: conversation.map(({ role, content }) => ({ role, content })) }),
        signal: abort.signal,
      })
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error || 'The conversation could not connect. Please try again.')
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const consume = (packet: string) => {
        const lines = packet.split('\n')
        const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim()
        const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n')
        if (!data) return
        const payload = JSON.parse(data) as { text?: string; message?: string; mode?: string }
        if (event === 'meta' && payload.mode) setMode(payload.mode)
        if (event === 'token' && payload.text) setMessages(current => current.map(message => message.id === answer.id ? { ...message, content: message.content + payload.text } : message))
        if (event === 'error') throw new Error(payload.message || 'The answer was interrupted.')
        if (event === 'done') complete = true
      }
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
          const packets = buffer.split('\n\n')
          buffer = packets.pop() || ''
          packets.forEach(consume)
        }
        if (buffer.trim()) consume(buffer)
      } finally { reader.releaseLock() }
      if (!complete && !abort.signal.aborted) throw new Error('The answer was interrupted. Please try again.')
    } catch (cause) {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.')
    } finally {
      setMessages(current => current.filter(message => message.role !== 'assistant' || message.content.trim()))
      busy.current = false
      setLoading(false)
      controller.current = null
    }
  }, [])

  useEffect(() => {
    if (active && queuedQuestion && queuedQuestion.id !== processedQueue.current) {
      processedQueue.current = queuedQuestion.id
      void ask(queuedQuestion.text)
    }
  }, [active, queuedQuestion, ask])

  const reset = () => {
    controller.current?.abort()
    history.current = []
    setMessages([])
    setDraft('')
    setError('')
    setView('chat')
    input.current?.focus()
  }

  return <section className={`chat-panel ${messages.length ? 'has-conversation' : ''}`} aria-label="Ask Shaaz about himself">
    <div className="chat-heading">
      <span className="eyebrow chat-eyebrow"><Sparkles size={15} strokeWidth={1.5} /> A CONVERSATION WITH SHAAZ</span>
      <h2>{messages.length ? <>Let’s keep <span>the spark going.</span></> : <>Good questions.<br /><span>Honest answers.</span></>}</h2>
      {!messages.length && <p>Student. Designer. Developer. Still figuring things out.<br className="desktop-break" /> Ask about the things I build, the tools I use, or the person behind them.</p>}
    </div>

    <div className="chat-workspace">
      <div className="chat-tabs" role="tablist" aria-label="Explore Shaaz’s profile">
        <button type="button" role="tab" id="conversation-tab" aria-selected={view === 'chat'} aria-controls="conversation-view" onClick={() => setView('chat')}><Sparkles size={13} /> Ask me anything</button>
        <button type="button" role="tab" id="work-tab" aria-selected={view === 'work'} aria-controls="work-view" onClick={() => setView('work')}><Layers3 size={13} /> Selected work <span>05</span></button>
        {messages.length > 0 && <button type="button" className="new-conversation" onClick={reset} disabled={loading} title="Start a new conversation" aria-label="Start a new conversation"><RotateCcw size={14} /></button>}
      </div>

      {view === 'work' ? <div className="project-grid" id="work-view" role="tabpanel" aria-labelledby="work-tab">
        {profile.projects.map((project, i) => <button type="button" className="project-card" key={project.name} disabled={loading} onClick={() => void ask(`Tell me about ${project.name}.`)}>
          <span className="project-number">0{i + 1} <span>{project.category}</span></span>
          <strong>{project.name}</strong>
          <span className="project-explore">Explore the project <ArrowUpRight size={15} /></span>
        </button>)}
      </div> : <div id="conversation-view" role="tabpanel" aria-labelledby="conversation-tab">
        {messages.length ? <div className="conversation-wrap">
          <div className="conversation" role="log" aria-label="Conversation" aria-live="polite" aria-busy={loading} ref={log} onScroll={() => {
            const element = log.current
            if (element) { followOutput.current = element.scrollHeight - element.scrollTop - element.clientHeight < 70; if (followOutput.current) setHasNewContent(false) }
          }}>
            {messages.map(message => <div key={message.id} className={`message message-${message.role}`}>
              {message.role === 'assistant' && <span className="answer-avatar" aria-label="Shaaz’s profile assistant"><Sparkles size={16} strokeWidth={1.6} /></span>}
              <div className="message-body">
                {message.role === 'assistant' && <span className="answer-name">SHAAZ <span>PROFILE ASSISTANT</span></span>}
                {message.content ? <p>{message.content}</p> : <span className="thinking" aria-label="Thinking"><i /><i /><i /></span>}
                {message.role === 'assistant' && message.content && !loading && <CopyButton text={message.content} />}
              </div>
            </div>)}
          </div>
          {hasNewContent && <button className="new-content" type="button" onClick={() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; followOutput.current = true; setHasNewContent(false) }}><ArrowDown size={14} /> Latest answer</button>}
        </div> : <div className="suggestion-grid">
          {suggestions.map(({ icon: Icon, title, detail, question }) => <button className="suggestion" type="button" key={title} disabled={loading} onClick={() => void ask(question || title)}>
            <span className="suggestion-top"><Icon size={17} strokeWidth={1.4} /><ArrowUpRight size={13} /></span>
            <strong>{title}</strong><span>{detail}</span>
          </button>)}
        </div>}
      </div>}

      {error && <div className="chat-error" role="alert"><span>{error}</span><button type="button" onClick={() => void ask(lastQuestion.current)} disabled={loading}>Try again <ArrowRight size={13} /></button><button type="button" aria-label="Dismiss error" onClick={() => setError('')}><X size={14} /></button></div>}
      <form className="chat-form" onSubmit={event => { event.preventDefault(); void ask(draft) }}>
        <Sparkles className="input-spark" size={20} strokeWidth={1.3} aria-hidden="true" />
        <label htmlFor="chat-input" className="sr-only">Your question for Shaaz</label>
        <textarea id="chat-input" ref={input} rows={1} maxLength={2000} value={draft} placeholder="What would you like to know?" autoComplete="off" spellCheck onChange={event => setDraft(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(draft) }
        }} />
        <div className="input-actions">
          <MicButton disabled={loading} onTranscript={text => { setDraft(current => `${current}${current ? ' ' : ''}${text}`.slice(0, 2000)); input.current?.focus() }} onStatus={setVoiceStatus} />
          {loading ? <button type="button" className="send-button" aria-label="Stop response" title="Stop response" onClick={() => controller.current?.abort()}><Square size={14} fill="currentColor" /></button> : <button type="submit" className="send-button" disabled={!draft.trim()} aria-label="Send question" title="Send question"><ArrowUp size={21} /></button>}
        </div>
      </form>
      <div className="input-footnote"><span className="answer-source"><i /> {mode === 'gemini' ? 'Gemini · grounded in my profile' : 'Answers from my real profile'}</span><span>Curiosity welcome. Invention isn’t.</span></div>
      <p className="voice-status" role="status" aria-live="polite">{voiceStatus}</p>
    </div>
    <footer className="chat-footer"><span>BENGALURU, INDIA <span className="footer-dot">·</span> ALWAYS A WORK IN PROGRESS</span><button type="button" onClick={onReplay}><RotateCcw size={12} /> Replay the story</button></footer>
  </section>
}
