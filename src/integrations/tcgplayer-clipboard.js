import { createTcgplayerMassEntry } from './tcgplayer.js'

export function getTcgplayerCopyDisabledReason(deck) {
  return createTcgplayerMassEntry(deck) ? null : 'Add cards to the deck first'
}

function getEmptyTcgplayerCopyMessage({ allDecks, missingOnly }) {
  if (!missingOnly) {
    return 'Add cards to the deck before copying a TCGplayer list.'
  }

  return allDecks
    ? 'Your card library already covers every card across all saved decks.'
    : 'Your card library already covers every card in this deck.'
}

function getSuccessfulTcgplayerCopyMessage({ allDecks, missingOnly }) {
  if (missingOnly) {
    return allDecks
      ? 'Missing cards across all saved decks copied for TCGplayer Mass Entry.'
      : 'Missing cards copied for TCGplayer Mass Entry.'
  }

  return allDecks
    ? 'All saved decks copied for TCGplayer Mass Entry.'
    : 'Full deck copied for TCGplayer Mass Entry.'
}

export async function copyTcgplayerDeckToClipboard({
  additionalDecks,
  allDecks,
  cardsById,
  collection,
  deck,
  missingOnly,
}) {
  try {
    const payload = createTcgplayerMassEntry(deck, {
      additionalDecks,
      collection,
      cardsById,
      missingOnly,
    })

    if (!payload) {
      throw new Error(getEmptyTcgplayerCopyMessage({ allDecks, missingOnly }))
    }
    if (!navigator.clipboard?.writeText) {
      throw new Error('Clipboard access is unavailable in this browser.')
    }

    await navigator.clipboard.writeText(payload)
    return {
      type: 'success',
      message: getSuccessfulTcgplayerCopyMessage({ allDecks, missingOnly }),
      autoDismiss: true,
      source: 'tcgplayer',
    }
  } catch (copyError) {
    return {
      type: 'error',
      message:
        copyError instanceof Error
          ? copyError.message
          : 'The TCGplayer Mass Entry list could not be copied.',
      autoDismiss: true,
      source: 'tcgplayer',
    }
  }
}
