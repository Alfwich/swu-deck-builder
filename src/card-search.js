import { getCatalogCards, toDeckCard } from './catalog.js'

const SEARCHABLE_CARD_TYPES = new Set([
  'unit',
  'event',
  'upgrade',
  'leader',
  'base',
])

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
    }
    previous.splice(0, previous.length, ...current)
  }

  return previous[right.length]
}

function subsequenceScore(query, candidate) {
  let queryIndex = 0
  let firstMatch = -1
  let lastMatch = -1

  for (let index = 0; index < candidate.length && queryIndex < query.length; index += 1) {
    if (candidate[index] === query[queryIndex]) {
      firstMatch = firstMatch === -1 ? index : firstMatch
      lastMatch = index
      queryIndex += 1
    }
  }

  if (queryIndex !== query.length) {
    return null
  }

  return 10 + firstMatch + (lastMatch - firstMatch + 1 - query.length) * 0.5
}

function scoreToken(term, token) {
  if (token === term) {
    return 0
  }

  const scores = []
  if (token.startsWith(term)) {
    scores.push(1 + (token.length - term.length) * 0.05)
  }

  const substringIndex = token.indexOf(term)
  if (substringIndex > 0) {
    scores.push(3 + substringIndex * 0.1)
  }

  const maximumDistance =
    term.length <= 4 ? 1 : Math.max(1, Math.floor(term.length * 0.34))
  const distance = editDistance(term, token)
  if (distance <= maximumDistance) {
    scores.push(
      5 +
        distance * 1.5 +
        Math.abs(token.length - term.length) * 0.1,
    )
  }

  const sequence = subsequenceScore(term, token)
  if (sequence !== null) {
    scores.push(sequence)
  }

  return scores.length > 0 ? Math.min(...scores) : null
}

function scoreTerm(term, candidateTokens) {
  const scores = candidateTokens
    .map((token) => scoreToken(term, token))
    .filter((score) => score !== null)

  return scores.length > 0 ? Math.min(...scores) : null
}

function scoreCard(entry, normalizedQuery) {
  if (entry.normalizedTitle === normalizedQuery) {
    return -10
  }
  if (entry.normalizedTitle.startsWith(normalizedQuery)) {
    return -5 + (entry.normalizedTitle.length - normalizedQuery.length) * 0.01
  }
  if (entry.normalizedTitle.includes(normalizedQuery)) {
    return -2 + entry.normalizedTitle.indexOf(normalizedQuery) * 0.01
  }

  let score = 0
  for (const term of normalizedQuery.split(' ')) {
    const termScore = scoreTerm(term, entry.tokens)
    if (termScore === null) {
      return null
    }
    score += termScore
  }

  return score
}

export function createCardSearchIndex(catalog) {
  const seenIds = new Set()

  return getCatalogCards(catalog)
    .filter(
      (card) =>
        card?.FrontArt &&
        SEARCHABLE_CARD_TYPES.has(String(card.Type).toLocaleLowerCase()) &&
        (!card.VariantType || card.VariantType === 'Normal'),
    )
    .map(toDeckCard)
    .filter((card) => {
      if (seenIds.has(card.id)) {
        return false
      }
      seenIds.add(card.id)
      return true
    })
    .map((card) => {
      const normalizedTitle = normalizeSearchText(
        [card.name, card.subtitle].filter(Boolean).join(' '),
      )
      const searchableText = normalizeSearchText(
        [normalizedTitle, card.type, card.setCode, card.cardNumber]
          .filter(Boolean)
          .join(' '),
      )

      return {
        card,
        normalizedTitle,
        tokens: searchableText.split(' ').filter(Boolean),
      }
    })
}

export function fuzzySearchCards(index, query, limit = 12) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) {
    return []
  }

  return index
    .map((entry) => ({ entry, score: scoreCard(entry, normalizedQuery) }))
    .filter((result) => result.score !== null)
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.entry.normalizedTitle.localeCompare(right.entry.normalizedTitle) ||
        String(left.entry.card.setCode).localeCompare(String(right.entry.card.setCode)) ||
        String(left.entry.card.cardNumber).localeCompare(String(right.entry.card.cardNumber)),
    )
    .slice(0, limit)
    .map((result) => result.entry.card)
}
