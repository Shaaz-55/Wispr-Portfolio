import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } }
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }

export default function MicButton({ disabled, onTranscript, onStatus }: { disabled: boolean; onTranscript: (text: string) => void; onStatus: (message: string) => void }) {
  const [listening, setListening] = useState(false)
  const recognition = useRef<Recognition | null>(null)
  const callback = useRef(onTranscript)
  callback.current = onTranscript
  useEffect(() => () => { recognition.current?.abort() }, [])
  useEffect(() => { if (disabled) recognition.current?.stop() }, [disabled])

  const toggle = () => {
    if (listening) { recognition.current?.stop(); return }
    const speechWindow = window as SpeechWindow
    const Constructor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
    if (!Constructor) {
      onStatus('Voice recognition is unavailable in this browser. You can still use your keyboard’s dictation in the text box.')
      return
    }
    const instance = new Constructor()
    recognition.current = instance
    instance.lang = 'en-IN'
    instance.continuous = false
    instance.interimResults = true
    instance.onresult = event => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal) transcript += event.results[i][0].transcript
      if (transcript) { callback.current(transcript.trim()); onStatus('Voice added. You can edit it before sending.') }
    }
    instance.onerror = event => {
      setListening(false)
      onStatus(event.error === 'not-allowed' ? 'Microphone access was not allowed. You can type or use keyboard dictation instead.' : event.error === 'no-speech' ? 'I didn’t catch that. Try the microphone again or type your question.' : 'Voice recognition could not connect. You can type or use keyboard dictation.')
    }
    instance.onend = () => setListening(false)
    try { instance.start(); setListening(true); onStatus('Listening… your words will appear in the text box.') }
    catch { setListening(false); onStatus('The microphone is busy. Please try again.') }
  }
  return <button type="button" className={`mic-button icon-button ${listening ? 'is-listening' : ''}`} onClick={toggle} disabled={disabled} aria-label={listening ? 'Stop listening' : 'Dictate a question'} aria-pressed={listening} title={listening ? 'Stop listening' : 'Dictate a question'}>
    {listening ? <MicOff size={19} /> : <Mic size={19} />}
  </button>
}
