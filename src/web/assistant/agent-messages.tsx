import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  type ComponentPropsWithoutRef,
} from 'react'
import Markdown, { type Components } from 'react-markdown'

import { createAgentCardReferenceMarkdownPlugin } from './agent-chat.js'
import {
  createCardChangePresentation,
  summarizeCardChanges,
} from '../decks/changes/deck-changes.js'
import { revealImage } from '../shared/image.js'
import {
  proposalActionLabel,
  proposalStatusLabel,
} from './agent-proposals.js'
import type { PreviewEvent } from './use-agent-card-preview.js'
import type { AgentChange, AgentMessage } from '../types/assistant.js'
import type { DeckCard, ReadonlyCardReferenceMap } from '../types/catalog.js'
import type {
  HistoryChangeEntry,
  HistoryReplacementEntry,
} from '../types/history.js'

type PreviewCard = (card: DeckCard, event: PreviewEvent) => void
type VisualChange = HistoryChangeEntry | HistoryReplacementEntry

function AgentChatChangeCard({
  entry,
  onHidePreview,
  onPreviewCard,
}: {
  entry: HistoryChangeEntry | null | undefined
  onHidePreview(): void
  onPreviewCard: PreviewCard
}) {
  const title = [entry?.name, entry?.subtitle].filter(Boolean).join(' — ')
  const isHorizontal = entry?.zone === 'leader' ||
    entry?.zone === 'secondLeader' ||
    entry?.zone === 'base'

  return (
    <div
      className={`agent-chat-change__card${isHorizontal ? ' is-horizontal' : ''}`}
    >
      <button
        type="button"
        data-agent-card-preview="true"
        className={`agent-chat-change__art${isHorizontal ? ' is-horizontal' : ''}`}
        aria-label={`View ${title}`}
        disabled={!entry?.card?.url}
        onBlur={onHidePreview}
        onFocus={(event) => entry?.card && onPreviewCard(entry.card, event)}
        onPointerEnter={(event) =>
          entry?.card && onPreviewCard(entry.card, event)
        }
        onPointerMove={(event) =>
          entry?.card && onPreviewCard(entry.card, event)
        }
        onPointerLeave={(event) => {
          if (event.currentTarget === document.activeElement && entry?.card) {
            onPreviewCard(entry.card, event)
          } else {
            onHidePreview()
          }
        }}
      >
        {entry?.card?.url ? (
          <img
            src={entry.card.url}
            alt={title}
            loading="lazy"
            decoding="async"
            draggable="false"
            onLoad={revealImage}
          />
        ) : (
          <span aria-hidden="true">?</span>
        )}
      </button>
      <span title={title}>{entry?.name ?? entry?.id}</span>
    </div>
  )
}

function AgentChatChangeCards({
  change,
  visualChange,
  onHidePreview,
  onPreviewCard,
}: {
  change: AgentChange
  visualChange: VisualChange | undefined
  onHidePreview(): void
  onPreviewCard: PreviewCard
}) {
  if (change.type === 'replace') {
    const replacement = visualChange && 'from' in visualChange
      ? visualChange
      : undefined
    return (
      <>
        <AgentChatChangeCard
          entry={replacement?.from}
          onHidePreview={onHidePreview}
          onPreviewCard={onPreviewCard}
        />
        <span className="agent-chat-change__arrow" aria-hidden="true">→</span>
        <AgentChatChangeCard
          entry={replacement?.to}
          onHidePreview={onHidePreview}
          onPreviewCard={onPreviewCard}
        />
      </>
    )
  }

  return (
    <AgentChatChangeCard
      entry={visualChange && !('from' in visualChange) ? visualChange : undefined}
      onHidePreview={onHidePreview}
      onPreviewCard={onPreviewCard}
    />
  )
}

function AgentChatChangeRow({
  change,
  disabled,
  visualChange,
  onApply,
  onDismiss,
  onHidePreview,
  onPreviewCard,
}: {
  change: AgentChange
  disabled: boolean
  visualChange: VisualChange | undefined
  onApply(changeId: string): void
  onDismiss(changeId: string): void
  onHidePreview(): void
  onPreviewCard: PreviewCard
}) {
  const status = change.status ?? 'pending'
  const zoneLabel = {
    base: 'Base',
    collection: 'Card library',
    drawDeck: 'Draw deck',
    leader: 'Leader',
    secondLeader: 'Second leader',
    sideboard: 'Sideboard',
  }[change.zone] ?? change.zone

  return (
    <article className={`agent-chat-change is-${change.type} is-${status}`}>
      <div className="agent-chat-change__heading">
        <strong>{change.type}</strong>
        <span>{zoneLabel} · ×{change.count}</span>
      </div>
      <div className="agent-chat-change__cards">
        <AgentChatChangeCards
          change={change}
          visualChange={visualChange}
          onHidePreview={onHidePreview}
          onPreviewCard={onPreviewCard}
        />
      </div>
      {status === 'pending' ? (
        <div className="agent-chat-change__actions">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onApply(change.id)}
          >
            Apply
          </button>
          {change.zone === 'collection' && (
            <button
              className="is-dismiss"
              type="button"
              disabled={disabled}
              onClick={() => onDismiss(change.id)}
            >
              Dismiss
            </button>
          )}
        </div>
      ) : (
        <small>{status === 'applied' ? 'Applied' : 'Dismissed'}</small>
      )}
    </article>
  )
}

export function AgentChatProposal({
  disabled,
  message,
  onApply,
  onApplyChange,
  onDismiss,
  onDismissChange,
  onHidePreview,
  onPreviewCard,
}: {
  disabled: boolean
  message: AgentMessage
  onApply(messageId: string): void
  onApplyChange(messageId: string, changeId: string): void
  onDismiss(messageId: string): void
  onDismissChange(messageId: string, changeId: string): void
  onHidePreview(): void
  onPreviewCard: PreviewCard
}) {
  const proposal = message.proposal
  if (!proposal) return null
  const proposalChanges = proposal.changes ?? []
  const pendingChangeCount =
    proposal.changes?.filter((change) => change.status === 'pending').length ?? 0
  const appliedChangeCount =
    proposal.changes?.filter((change) => change.status === 'applied').length ?? 0
  const visualChanges =
    proposal.visualChanges ??
    createCardChangePresentation(null, proposal.deck, proposal.changes)
  const summary = summarizeCardChanges(visualChanges)
  const visualChangesById = new Map<string, VisualChange>(
    [
      ...(visualChanges?.replacements ?? []),
      ...(visualChanges?.additions ?? []),
      ...(visualChanges?.removals ?? []),
    ]
      .filter((change): change is VisualChange & { changeId: string } =>
        typeof change.changeId === 'string',
      )
      .map((change) => [change.changeId, change]),
  )

  return (
    <div className="agent-chat__proposal">
      <strong>
        {proposal.operation === 'build'
          ? `New deck: ${proposal.name}`
          : proposal.hasDeckChanges && proposal.hasCollectionChanges
            ? `Update ${proposal.targetDeckName} and card library`
            : proposal.hasCollectionChanges
              ? 'Update card library'
              : `Update ${proposal.targetDeckName}`}
      </strong>
      {proposal.operation === 'modify' && (
        <>
          <small>
            {summary.replacements} replacements · {summary.additions} additions ·{' '}
            {summary.removals} removals
          </small>
          <div className="agent-chat-change-list">
            {proposalChanges.map((change) => (
              <AgentChatChangeRow
                change={change}
                disabled={disabled}
                key={change.id}
                visualChange={visualChangesById.get(change.id)}
                onApply={(changeId) => onApplyChange(message.id, changeId)}
                onDismiss={(changeId) =>
                  onDismissChange(message.id, changeId)
                }
                onHidePreview={onHidePreview}
                onPreviewCard={onPreviewCard}
              />
            ))}
          </div>
        </>
      )}
      {proposal.status === 'pending' ? (
        <div className="agent-chat__proposal-actions">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onDismiss(message.id)}
          >
            {appliedChangeCount > 0 ? 'Dismiss remaining' : 'Dismiss'}
          </button>
          <button
            className="is-primary"
            type="button"
            disabled={disabled}
            onClick={() => onApply(message.id)}
          >
            {proposalActionLabel(proposal, pendingChangeCount)}
          </button>
        </div>
      ) : (
        <small className={`is-${proposal.status}`}>
          {proposalStatusLabel(proposal.status)}
        </small>
      )}
    </div>
  )
}

interface AgentMarkdownContextValue {
  cardsById: ReadonlyCardReferenceMap
  onHidePreview(): void
  onPreviewCard: PreviewCard
}

const AgentMarkdownContext = createContext<AgentMarkdownContextValue | null>(null)

const AgentCardReference = memo(function AgentCardReference({
  card,
  cardId,
  onHidePreview,
  onPreviewCard,
}: {
  card: DeckCard
  cardId: string
  onHidePreview(): void
  onPreviewCard: PreviewCard
}) {
  useEffect(() => () => onHidePreview(), [onHidePreview])

  return (
    <button
      className={`agent-chat-card-reference${
        ['Leader', 'Base'].includes(card.type) ? ' is-horizontal' : ''
      }`}
      type="button"
      data-agent-card-preview="true"
      aria-label={`View ${card.name}, ${cardId}`}
      onBlur={onHidePreview}
      onFocus={(event) => onPreviewCard(card, event)}
      onPointerEnter={(event) => onPreviewCard(card, event)}
      onPointerMove={(event) => onPreviewCard(card, event)}
      onPointerLeave={(event) => {
        if (event.currentTarget === document.activeElement) {
          onPreviewCard(card, event)
        } else {
          onHidePreview()
        }
      }}
    >
      <img
        src={card.url ?? undefined}
        alt=""
        loading="lazy"
        decoding="async"
        draggable="false"
        onLoad={revealImage}
      />
    </button>
  )
})

function AgentMarkdownLink({
  children,
  href,
}: ComponentPropsWithoutRef<'a'>) {
  return (
    <a href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  )
}

function AgentMarkdownCardReference({ cardId }: { cardId: string }) {
  const context = useContext(AgentMarkdownContext)
  if (!context) return null
  const card = context.cardsById.get(cardId)
  if (!card) return null

  return (
    <AgentCardReference
      card={card}
      cardId={cardId}
      onHidePreview={context.onHidePreview}
      onPreviewCard={context.onPreviewCard}
    />
  )
}

const AGENT_MARKDOWN_COMPONENTS = {
  a: AgentMarkdownLink,
  'swu-card': AgentMarkdownCardReference,
} as Components

export const AgentMessageText = memo(function AgentMessageText({
  cardsById,
  onHidePreview,
  onPreviewCard,
  text,
}: {
  cardsById: ReadonlyCardReferenceMap
  onHidePreview(): void
  onPreviewCard: PreviewCard
  text: string
}) {
  const cardReferencePlugin = useMemo(
    () => createAgentCardReferenceMarkdownPlugin(cardsById),
    [cardsById],
  )
  const markdownContext = useMemo(
    () => ({ cardsById, onHidePreview, onPreviewCard }),
    [cardsById, onHidePreview, onPreviewCard],
  )
  const remarkPlugins = useMemo(
    () => [cardReferencePlugin],
    [cardReferencePlugin],
  )

  return (
    <AgentMarkdownContext.Provider value={markdownContext}>
      <div className="agent-chat-markdown">
        <Markdown
          components={AGENT_MARKDOWN_COMPONENTS}
          remarkPlugins={remarkPlugins}
          skipHtml
        >
          {text}
        </Markdown>
      </div>
    </AgentMarkdownContext.Provider>
  )
})
