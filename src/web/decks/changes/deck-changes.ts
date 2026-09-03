import type {
  AgentChange,
  AgentAddChange,
  AgentRemoveChange,
  AgentReplaceChange,
  CardChangePresentation,
} from '../../types/assistant.js'
import type { DeckCard } from '../../types/catalog.js'
import type { Deck, DeckZone } from '../../types/deck.js'
import type {
  HistoryChangeEntry,
  HistoryReplacementEntry,
} from '../../types/history.js'

const SINGLETON_ZONES = [
  ['leader', 'Leader'],
  ['secondLeader', 'Second leader'],
  ['base', 'Base'],
] as const

const ZONE_LABELS: Record<DeckZone, string> = {
  leader: 'Leader',
  secondLeader: 'Second leader',
  base: 'Base',
  collection: 'Card library',
  drawDeck: 'Draw deck',
  sideboard: 'Sideboard',
}

interface LegacyChangeEntry {
  id: string
  name?: string
  subtitle?: string | null
  zone: DeckZone
  count: number
}

interface LegacySingletonChange {
  from?: LegacyChangeEntry | null
  to?: LegacyChangeEntry | null
}

interface LegacyDeckChanges {
  leader?: LegacySingletonChange | null
  secondLeader?: LegacySingletonChange | null
  base?: LegacySingletonChange | null
  added?: LegacyChangeEntry[]
  removed?: LegacyChangeEntry[]
  name?: string | { from: string; to: string } | null
}

type ChangePresentationInput = AgentChange[] | LegacyDeckChanges
type HydratedEntry = Omit<HistoryChangeEntry, 'count'>

function toSwudbAlias(card: Partial<DeckCard> | null | undefined) {
  const setCode = String(card?.setCode ?? '').trim().toUpperCase()
  const cardNumber = String(card?.cardNumber ?? '').trim()

  if (!setCode || !/^\d+$/.test(cardNumber)) {
    return null
  }

  const formattedNumber =
    setCode === 'TS26'
      ? cardNumber.replace(/^0+(?=\d)/, '')
      : cardNumber.padStart(3, '0')

  return `${setCode}_${formattedNumber}`
}

function indexDeckCards(...decks: Array<Deck | null | undefined>) {
  const cards = new Map<string, DeckCard>()

  decks.forEach((deck) => {
    if (!deck) return
    const deckCards = [
      deck.leader,
      deck.secondLeader,
      deck.base,
      ...(deck.drawDeck ?? []),
      ...(deck.sideboard ?? []),
    ]
    deckCards.forEach((card) => {
      if (!card) return
      cards.set(card.id, card)
      const swudbAlias = toSwudbAlias(card)
      if (swudbAlias) cards.set(swudbAlias, card)
    })
  })

  return cards
}

function hydrateEntry(
  entry: (Pick<DeckCard, 'id'> & Partial<DeckCard>) | null | undefined,
  zone: DeckZone,
  cards: ReadonlyMap<string, DeckCard>,
): HydratedEntry | null {
  if (!entry) {
    return null
  }

  return {
    id: entry.id,
    name: entry.name ?? cards.get(entry.id)?.name ?? entry.id,
    subtitle: entry.subtitle ?? cards.get(entry.id)?.subtitle ?? null,
    zone,
    zoneLabel: ZONE_LABELS[zone] ?? zone,
    card: cards.get(entry.id) ?? null,
  }
}

export function createCardChangePresentation(
  beforeDeck: Deck | null,
  afterDeck: Deck,
  changes: ChangePresentationInput | null | undefined,
  cardReferences: ReadonlyMap<string, DeckCard> | null = null,
): CardChangePresentation | null {
  if (!changes) {
    return null
  }

  const cards = indexDeckCards(beforeDeck, afterDeck)
  cardReferences?.forEach((card, cardId) => cards.set(cardId, card))
  const replacements: HistoryReplacementEntry[] = []
  const additions: HistoryChangeEntry[] = []
  const removals: HistoryChangeEntry[] = []

  if (Array.isArray(changes)) {
    changes.forEach((change) => {
      const common = {
        changeId: change.id,
        status: change.status ?? 'pending',
        zone: change.zone,
        zoneLabel: ZONE_LABELS[change.zone] ?? change.zone,
        count: change.count,
      }

      if (change.type === 'add') {
        additions.push({
          ...hydrateEntry(change.card, change.zone, cards)!,
          ...common,
        })
      } else if (change.type === 'remove') {
        removals.push({
          ...hydrateEntry(change.card, change.zone, cards)!,
          ...common,
        })
      } else if (change.type === 'replace') {
        replacements.push({
          ...common,
          from: hydrateEntry(change.from, change.zone, cards)!,
          to: hydrateEntry(change.to, change.zone, cards)!,
        })
      }
    })

    return { replacements, additions, removals, name: null }
  }

  SINGLETON_ZONES.forEach(([zone, zoneLabel]) => {
    const change = changes[zone]
    if (!change) {
      return
    }

    const from = hydrateEntry(change.from, zone, cards)
    const to = hydrateEntry(change.to, zone, cards)

    if (from && to) {
      replacements.push({ zone, zoneLabel, count: 1, from, to })
    } else if (to) {
      additions.push({ ...to, count: 1 })
    } else if (from) {
      removals.push({ ...from, count: 1 })
    }
  })

  const remainingAdded = (changes.added ?? []).map((entry) => ({
    ...hydrateEntry(entry, entry.zone, cards)!,
    remaining: entry.count,
  }))
  const remainingRemoved = (changes.removed ?? []).map((entry) => ({
    ...hydrateEntry(entry, entry.zone, cards)!,
    remaining: entry.count,
  }))

  remainingRemoved.forEach((removed) => {
    remainingAdded.forEach((added) => {
      if (removed.zone !== added.zone || removed.remaining === 0 || added.remaining === 0) {
        return
      }

      const count = Math.min(removed.remaining, added.remaining)
      replacements.push({
        zone: removed.zone,
        zoneLabel: removed.zoneLabel,
        count,
        from: removed,
        to: added,
      })
      removed.remaining -= count
      added.remaining -= count
    })
  })

  remainingAdded.forEach((entry) => {
    if (entry.remaining > 0) {
      additions.push({ ...entry, count: entry.remaining })
    }
  })
  remainingRemoved.forEach((entry) => {
    if (entry.remaining > 0) {
      removals.push({ ...entry, count: entry.remaining })
    }
  })

  return {
    replacements,
    additions,
    removals,
    name: changes.name ?? null,
  }
}

function cardMatchesId(card: DeckCard | null | undefined, cardId: string) {
  return card?.id === cardId || toSwudbAlias(card) === cardId
}

function removeCards(cards: DeckCard[], cardId: string, count: number) {
  let remaining = count
  const next = cards.filter((card) => {
    if (remaining > 0 && cardMatchesId(card, cardId)) {
      remaining -= 1
      return false
    }
    return true
  })

  if (remaining > 0) {
    throw new Error(
      `Cannot remove ${count} copies of ${cardId}; the deck changed after this proposal was created.`,
    )
  }

  return next
}

function addedCards(referenceDeck: Deck, cardId: string, count: number) {
  const card = indexDeckCards(referenceDeck).get(cardId)
  if (!card) {
    throw new Error(`Cannot resolve ${cardId} from the proposed deck.`)
  }

  return Array.from({ length: count }, () => ({ ...card }))
}

function addSecondLeader(deck: Deck, change: AgentAddChange, referenceDeck: Deck) {
  if (deck.secondLeader) {
    throw new Error('This deck already has two leaders; replace the second leader instead.')
  }
  const nextLeader = addedCards(referenceDeck, change.card.id, 1)[0]
  if (!nextLeader || nextLeader.type !== 'Leader') {
    throw new Error(`${change.card.id} is not a leader.`)
  }
  return { ...deck, secondLeader: nextLeader }
}

function removeSecondLeader(deck: Deck, change: AgentRemoveChange) {
  if (!cardMatchesId(deck.secondLeader, change.card.id)) {
    throw new Error(
      `Cannot remove ${change.card.id}; the second leader changed after this proposal was created.`,
    )
  }
  return { ...deck, secondLeader: null }
}

function replaceSecondLeader(
  deck: Deck,
  change: AgentReplaceChange,
  referenceDeck: Deck,
) {
  if (!cardMatchesId(deck.secondLeader, change.from.id)) {
    throw new Error(
      `Cannot replace ${change.from.id}; the second leader changed after this proposal was created.`,
    )
  }
  const nextLeader = addedCards(referenceDeck, change.to.id, 1)[0]
  if (!nextLeader || nextLeader.type !== 'Leader') {
    throw new Error(`${change.to.id} is not a leader.`)
  }
  return { ...deck, secondLeader: nextLeader }
}

function applyPrimaryIdentityChange(
  deck: Deck,
  change: AgentChange,
  referenceDeck: Deck,
) {
  if (change.count !== 1) {
    throw new Error(`A ${change.zone} change must use a quantity of one.`)
  }
  if (change.type === 'remove') {
    throw new Error(`The primary ${change.zone} can only be replaced.`)
  }

  const zone = change.zone === 'leader' ? 'leader' : 'base'
  const expectedType = zone === 'leader' ? 'Leader' : 'Base'
  const currentCard = deck[zone]
  const nextId = change.type === 'add' ? change.card.id : change.to.id
  const nextCard = addedCards(referenceDeck, nextId, 1)[0]

  if (!nextCard || nextCard.type !== expectedType) {
    throw new Error(`${nextId} is not a ${expectedType.toLocaleLowerCase()}.`)
  }
  if (change.type === 'add') {
    if (currentCard) {
      throw new Error(`This deck already has a ${change.zone}; replace it instead.`)
    }
    return { ...deck, [zone]: nextCard }
  }
  if (change.type === 'replace') {
    if (!cardMatchesId(currentCard, change.from.id)) {
      throw new Error(
        `Cannot replace ${change.from.id}; the ${change.zone} changed after this proposal was created.`,
      )
    }
    return { ...deck, [zone]: nextCard }
  }

  throw new Error('Unsupported deck change type.')
}

function applySecondLeaderChange(
  deck: Deck,
  change: AgentChange,
  referenceDeck: Deck,
) {
  if (change.count !== 1) {
    throw new Error('A second-leader change must use a quantity of one.')
  }

  if (change.type === 'add') {
    return addSecondLeader(deck, change, referenceDeck)
  }
  if (change.type === 'remove') return removeSecondLeader(deck, change)
  return replaceSecondLeader(deck, change, referenceDeck)
}

function applyCardZoneChange(
  deck: Deck,
  change: AgentChange,
  referenceDeck: Deck,
) {
  const zone = change.zone === 'drawDeck' ? 'drawDeck' : 'sideboard'
  const currentCards = [...deck[zone]]
  let nextCards: DeckCard[]

  if (change.type === 'add') {
    nextCards = [
      ...currentCards,
      ...addedCards(referenceDeck, change.card.id, change.count),
    ]
  } else if (change.type === 'remove') {
    nextCards = removeCards(currentCards, change.card.id, change.count)
  } else if (change.type === 'replace') {
    nextCards = [
      ...removeCards(currentCards, change.from.id, change.count),
      ...addedCards(referenceDeck, change.to.id, change.count),
    ]
  } else {
    throw new Error('Unsupported deck change type.')
  }

  return { ...deck, [zone]: nextCards }
}

export function applyCardChange(
  deck: Deck,
  change: AgentChange,
  referenceDeck: Deck,
) {
  if (change.zone === 'collection') {
    throw new Error('The proposed change targets an unsupported deck zone.')
  }

  if (change.zone === 'secondLeader') {
    return applySecondLeaderChange(deck, change, referenceDeck)
  }
  if (change.zone === 'leader' || change.zone === 'base') {
    return applyPrimaryIdentityChange(deck, change, referenceDeck)
  }
  if (change.zone === 'drawDeck' || change.zone === 'sideboard') {
    return applyCardZoneChange(deck, change, referenceDeck)
  }
  throw new Error('The proposed change targets an unsupported deck zone.')
}

export function applyCardChanges(
  deck: Deck,
  changes: AgentChange[],
  referenceDeck: Deck,
) {
  return changes.reduce<Deck>(
    (currentDeck, change) =>
      applyCardChange(currentDeck, change, referenceDeck),
    deck,
  )
}

export function summarizeCardChanges(presentation: CardChangePresentation | null) {
  if (!presentation) {
    return { replacements: 0, additions: 0, removals: 0 }
  }

  const total = (entries: Array<{ count?: number }>) =>
    entries.reduce((sum, entry) => sum + (entry.count ?? 1), 0)

  return {
    replacements: total(presentation.replacements),
    additions: total(presentation.additions),
    removals: total(presentation.removals),
  }
}
