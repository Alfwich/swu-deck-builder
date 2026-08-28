const SINGLETON_ZONES = [
  ['leader', 'Leader'],
  ['secondLeader', 'Second leader'],
  ['base', 'Base'],
]

const ZONE_LABELS = {
  leader: 'Leader',
  secondLeader: 'Second leader',
  base: 'Base',
  drawDeck: 'Draw deck',
  sideboard: 'Sideboard',
}

function toSwudbAlias(card) {
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

function indexDeckCards(...decks) {
  const cards = new Map()

  decks.filter(Boolean).forEach((deck) => {
    ;[
      deck.leader,
      deck.secondLeader,
      deck.base,
      ...(deck.drawDeck ?? []),
      ...(deck.sideboard ?? []),
    ]
      .filter(Boolean)
      .forEach((card) => {
        cards.set(card.id, card)
        const swudbAlias = toSwudbAlias(card)
        if (swudbAlias) {
          cards.set(swudbAlias, card)
        }
      })
  })

  return cards
}

function hydrateEntry(entry, zone, cards) {
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

export function createCardChangePresentation(beforeDeck, afterDeck, changes) {
  if (!changes) {
    return null
  }

  const cards = indexDeckCards(beforeDeck, afterDeck)
  const replacements = []
  const additions = []
  const removals = []

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
          ...hydrateEntry(change.card, change.zone, cards),
          ...common,
        })
      } else if (change.type === 'remove') {
        removals.push({
          ...hydrateEntry(change.card, change.zone, cards),
          ...common,
        })
      } else if (change.type === 'replace') {
        replacements.push({
          ...common,
          from: hydrateEntry(change.from, change.zone, cards),
          to: hydrateEntry(change.to, change.zone, cards),
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
    ...hydrateEntry(entry, entry.zone, cards),
    remaining: entry.count,
  }))
  const remainingRemoved = (changes.removed ?? []).map((entry) => ({
    ...hydrateEntry(entry, entry.zone, cards),
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

function cardMatchesId(card, cardId) {
  return card?.id === cardId || toSwudbAlias(card) === cardId
}

function removeCards(cards, cardId, count) {
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

function addedCards(referenceDeck, cardId, count) {
  const card = indexDeckCards(referenceDeck).get(cardId)
  if (!card) {
    throw new Error(`Cannot resolve ${cardId} from the proposed deck.`)
  }

  return Array.from({ length: count }, () => ({ ...card }))
}

export function applyCardChange(deck, change, referenceDeck) {
  if (!['secondLeader', 'drawDeck', 'sideboard'].includes(change?.zone)) {
    throw new Error('The proposed change targets an unsupported deck zone.')
  }

  if (change.zone === 'secondLeader') {
    if (change.count !== 1) {
      throw new Error('A second-leader change must use a quantity of one.')
    }

    const currentLeader = deck.secondLeader ?? null
    if (change.type === 'add') {
      if (currentLeader) {
        throw new Error('This deck already has two leaders; replace the second leader instead.')
      }
      const nextLeader = addedCards(referenceDeck, change.card.id, 1)[0]
      if (nextLeader.type !== 'Leader') {
        throw new Error(`${change.card.id} is not a leader.`)
      }
      return { ...deck, secondLeader: nextLeader }
    }

    if (change.type === 'remove') {
      if (!cardMatchesId(currentLeader, change.card.id)) {
        throw new Error(
          `Cannot remove ${change.card.id}; the second leader changed after this proposal was created.`,
        )
      }
      return { ...deck, secondLeader: null }
    }

    if (change.type === 'replace') {
      if (!cardMatchesId(currentLeader, change.from.id)) {
        throw new Error(
          `Cannot replace ${change.from.id}; the second leader changed after this proposal was created.`,
        )
      }
      const nextLeader = addedCards(referenceDeck, change.to.id, 1)[0]
      if (nextLeader.type !== 'Leader') {
        throw new Error(`${change.to.id} is not a leader.`)
      }
      return { ...deck, secondLeader: nextLeader }
    }

    throw new Error(`Unsupported deck change type: ${change?.type ?? '(missing)'}.`)
  }

  const currentCards = [...(deck[change.zone] ?? [])]
  let nextCards

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
    throw new Error(`Unsupported deck change type: ${change?.type ?? '(missing)'}.`)
  }

  return { ...deck, [change.zone]: nextCards }
}

export function applyCardChanges(deck, changes, referenceDeck) {
  return changes.reduce(
    (currentDeck, change) =>
      applyCardChange(currentDeck, change, referenceDeck),
    deck,
  )
}

export function summarizeCardChanges(presentation) {
  if (!presentation) {
    return { replacements: 0, additions: 0, removals: 0 }
  }

  const total = (entries) =>
    entries.reduce((sum, entry) => sum + (entry.count ?? 1), 0)

  return {
    replacements: total(presentation.replacements),
    additions: total(presentation.additions),
    removals: total(presentation.removals),
  }
}
