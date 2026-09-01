import { useEffect, useRef } from 'react'

import { deckHistoryShortcutDirection } from './deck-history.js'

const STARTING_ENTRIES = [{ label: 'Starting deck' }]

function historyPositionLabel(position, entry) {
  return `Position ${position}: ${entry.label}`
}

function isEditableTarget(target) {
  return target instanceof Element && (
    target.matches('input, textarea, select') ||
    target.closest('[contenteditable]:not([contenteditable="false"])')
  )
}

export default function DeckHistoryBar({ history, onNavigate }) {
  const activeTickRef = useRef(null)

  useEffect(() => {
    activeTickRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [history?.position])

  useEffect(() => {
    function handleKeyDown(event) {
      const direction = deckHistoryShortcutDirection(event)
      if (!history || direction === 0 || isEditableTarget(event.target)) {
        return
      }

      const nextPosition = history.position + direction
      if (nextPosition < 0 || nextPosition >= history.entries.length) {
        return
      }

      event.preventDefault()
      onNavigate(nextPosition)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [history, onNavigate])

  const hasHistory = Boolean(history?.entries.length)
  const entries = hasHistory ? history.entries : STARTING_ENTRIES
  const position = hasHistory ? history.position : 0
  return (
    <nav className="deck-history" aria-label="Deck history">
      <ol className="deck-history__timeline" aria-label="Deck versions">
        {entries.map((entry, index) => {
          const isCurrent = index === position
          const state = index < position ? 'past' : isCurrent ? 'current' : 'future'
          const label = historyPositionLabel(index, entry)

          return (
            <li
              className={`is-${state}${index === 0 ? ' is-start' : ''}`}
              key={`${index}-${entry.label}`}
            >
              <button
                type="button"
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={label}
                ref={isCurrent ? activeTickRef : null}
                title={label}
                onClick={() => onNavigate(index)}
              >
                <span aria-hidden="true">{index}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
