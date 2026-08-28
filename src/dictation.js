export const DICTATION_ERROR_MESSAGES = {
  'audio-capture': 'No microphone was found.',
  'network': 'The browser speech service is unavailable.',
  'no-speech': 'No speech was detected. Try again.',
  'not-allowed': 'Microphone permission was denied.',
  'service-not-allowed': 'Speech recognition is blocked by the browser.',
}

const DICTATION_LABELS = {
  error: 'Dictate',
  idle: 'Dictate',
  listening: 'Stop',
  processing: 'Interpreting…',
}

const DICTATION_MESSAGES = {
  error: '',
  idle: '',
  listening: 'Listening…',
  processing: 'Interpreting your dictation…',
}

function getDictationState({ error, isListening, isProcessing }) {
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
  isSupported,
}) {
  const state = getDictationState({ error, isListening, isProcessing })
  let title = 'Dictate this prompt using your browser microphone'
  if (!isSupported) {
    title = 'Speech recognition is not supported by this browser'
  } else if (isProcessing) {
    title = 'Interpreting your dictation'
  }

  return {
    state,
    buttonDisabled: disabled || !isSupported || isProcessing,
    label: DICTATION_LABELS[state],
    message: error || DICTATION_MESSAGES[state],
    title,
  }
}
