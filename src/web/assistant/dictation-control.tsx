import { useEffect, useRef, useState } from 'react'

import {
  DICTATION_ERROR_MESSAGES,
  getDictationPresentation,
  isDictationAvailable,
} from './dictation.js'

export function DictationControl({
  disabled = false,
  isElectron = false,
  onTranscript,
}: {
  disabled?: boolean
  isElectron?: boolean
  onTranscript(transcript: string): void
}) {
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const onTranscriptRef = useRef(onTranscript)
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [isSupported] = useState(
    () =>
      typeof window !== 'undefined' &&
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
  )

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  useEffect(() => {
    if (!isSupported || isElectron) {
      return undefined
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return undefined
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = navigator.language || 'en-US'

    recognition.onstart = () => {
      setError('')
      setIsProcessing(false)
      setIsListening(true)
    }
    recognition.onend = () => {
      setIsListening(false)
      setIsProcessing(false)
    }
    recognition.onerror = (event) => {
      setIsListening(false)
      setIsProcessing(false)
      if (event.error !== 'aborted') {
        setError(
          DICTATION_ERROR_MESSAGES[event.error] ??
            'Dictation stopped unexpectedly.',
        )
      }
    }
    recognition.onresult = (event) => {
      let transcript = ''

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result?.isFinal) {
          transcript += result[0]?.transcript ?? ''
        }
      }

      if (transcript.trim()) {
        onTranscriptRef.current(transcript.trim())
      }
      setIsProcessing(false)
    }

    recognitionRef.current = recognition
    return () => {
      recognition.onstart = null
      recognition.onend = null
      recognition.onerror = null
      recognition.onresult = null
      recognition.abort()
      recognitionRef.current = null
    }
  }, [isElectron, isSupported])

  useEffect(() => {
    if (disabled && isListening) {
      recognitionRef.current?.stop()
    }
  }, [disabled, isListening])

  function toggleDictation() {
    const recognition = recognitionRef.current
    if (!recognition) {
      return
    }

    if (isListening) {
      setIsListening(false)
      setIsProcessing(true)
      try {
        recognition.stop()
      } catch {
        setIsProcessing(false)
        setError('Dictation could not be stopped. Please try again.')
      }
      return
    }

    setError('')
    setIsProcessing(false)
    try {
      recognition.start()
    } catch {
      setError('Dictation is already starting. Please try again.')
    }
  }

  if (!isDictationAvailable({ isElectron, isSupported })) {
    return null
  }

  const presentation = getDictationPresentation({
    disabled,
    error,
    isListening,
    isProcessing,
  })

  return (
    <div className="dictation-control" title={presentation.title}>
      <button
        className={`dictation-button is-${presentation.state}`}
        type="button"
        disabled={presentation.buttonDisabled}
        aria-pressed={isListening}
        aria-busy={isProcessing}
        title={presentation.title}
        onClick={toggleDictation}
      >
        <span aria-hidden="true">
          {isProcessing ? '' : isListening ? '■' : '●'}
        </span>
        {presentation.label}
      </button>
      <span
        className={`dictation-control__status${error ? ' is-error' : ''}`}
        aria-live="polite"
      >
        {presentation.message}
      </span>
    </div>
  )
}
