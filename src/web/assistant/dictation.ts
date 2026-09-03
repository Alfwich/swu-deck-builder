export const DICTATION_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  'audio-capture': 'No microphone was found.',
  'network': 'The browser speech service is unavailable.',
  'no-speech': 'No speech was detected. Try again.',
  'not-allowed': 'Microphone permission was denied.',
  'service-not-allowed': 'Speech recognition is blocked by the browser.',
}

type DictationState = 'error' | 'idle' | 'listening' | 'processing'

interface DictationStateInput {
  error: string
  isListening: boolean
  isProcessing: boolean
}

const DICTATION_LABELS: Record<DictationState, string> = {
  error: 'Dictate',
  idle: 'Dictate',
  listening: 'Stop',
  processing: 'Interpreting…',
}

const DICTATION_MESSAGES: Record<DictationState, string> = {
  error: '',
  idle: '',
  listening: 'Listening…',
  processing: 'Interpreting your dictation…',
}

function getDictationState({
  error,
  isListening,
  isProcessing,
}: DictationStateInput): DictationState {
  if (error) return 'error'
  if (isProcessing) return 'processing'
  if (isListening) return 'listening'
  return 'idle'
}

export function getDictationPresentation({
  disabled,
  error,
  isListening,
  isProcessing,
}: DictationStateInput & { disabled: boolean }) {
  const state = getDictationState({ error, isListening, isProcessing })
  let title = 'Dictate this prompt using your browser microphone'
  if (isProcessing) {
    title = 'Interpreting your dictation'
  }

  return {
    state,
    buttonDisabled: disabled || isProcessing,
    label: DICTATION_LABELS[state],
    message: error || DICTATION_MESSAGES[state],
    title,
  }
}

export function isDictationAvailable({
  isElectron = false,
  isSupported,
}: {
  isElectron?: boolean
  isSupported: boolean
}) {
  return !isElectron && isSupported
}
