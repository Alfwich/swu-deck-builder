import { createDeckHistoryVisualStack } from '../deck-history.js'

export function agentDeckChangeHistoryLabel(change) {
  const count = change?.count ?? 1
  const zone = String(change?.zoneLabel ?? change?.zone ?? 'deck').toLowerCase()
  if (change?.type === 'replace') {
    const from = change.from?.name ?? change.from?.id ?? 'a card'
    const to = change.to?.name ?? change.to?.id ?? 'a card'
    return `AI replaced ${from} with ${to} in the ${zone}`
  }

  const card = change?.card?.name ?? change?.card?.id ?? 'a card'
  const quantity = count > 1 ? `${count} copies of ` : ''
  return change?.type === 'remove'
    ? `AI removed ${quantity}${card} from the ${zone}`
    : `AI added ${quantity}${card} to the ${zone}`
}

export function agentProposalHistoryLabel(changeCount) {
  const noun = changeCount === 1 ? 'change' : 'changes'
  return `Applied ${changeCount} AI deck ${noun}`
}

export function deckHistoryCardVisual(card, kind) {
  return card?.url ? { card, kind } : null
}

export function agentDeckChangeHistoryVisual(change, proposal) {
  const visualChanges = proposal?.visualChanges
  const visualChange = [
    ...(visualChanges?.replacements ?? []),
    ...(visualChanges?.additions ?? []),
    ...(visualChanges?.removals ?? []),
  ].find((candidate) => candidate.changeId === change?.id)
  const card = change?.type === 'replace'
    ? visualChange?.to?.card
    : visualChange?.card
  const kind = change?.type === 'remove'
    ? 'removal'
    : change?.type === 'replace'
      ? 'replacement'
      : 'addition'
  const visual = deckHistoryCardVisual(card, kind)
  return visual ? { ...visual, count: change?.count ?? 1 } : null
}

export function agentProposalHistoryVisual(changes, proposal) {
  const deckChanges = changes.filter((change) => change.zone !== 'collection')
  const visual = createDeckHistoryVisualStack(
    deckChanges.map((change) =>
      agentDeckChangeHistoryVisual(change, proposal),
    ),
  )
  if (!visual) return null

  const changeIds = new Set(deckChanges.map(({ id }) => id))
  const visualChanges = proposal?.visualChanges
  return {
    ...visual,
    details: {
      name: visualChanges?.name ?? null,
      replacements: (visualChanges?.replacements ?? []).filter(
        ({ changeId }) => changeIds.has(changeId),
      ),
      additions: (visualChanges?.additions ?? []).filter(
        ({ changeId }) => changeIds.has(changeId),
      ),
      removals: (visualChanges?.removals ?? []).filter(
        ({ changeId }) => changeIds.has(changeId),
      ),
    },
  }
}
