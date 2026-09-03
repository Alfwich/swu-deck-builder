import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
} from 'react'
import Markdown from 'react-markdown'

import { createAgentCardReferenceMarkdownPlugin } from '../agent-chat.js'
import {
  createCardChangePresentation,
  summarizeCardChanges,
} from '../deck-changes.js'
import { revealImage } from '../shared/image.js'
import {
  proposalActionLabel,
  proposalStatusLabel,
} from './agent-proposals.js'

function AgentChatChangeCard({ entry, onHidePreview, onPreviewCard }) {
  const title = [entry?.name, entry?.subtitle].filter(Boolean).join(' — ')
  const isHorizontal = ['leader', 'secondLeader', 'base'].includes(entry?.zone)

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
          if (event.currentTarget === document.activeElement) {
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

function AgentChatChangeRow({
  change,
  disabled,
  visualChange,
  onApply,
  onDismiss,
  onHidePreview,
  onPreviewCard,
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
        {change.type === 'replace' ? (
          <>
            <AgentChatChangeCard
              entry={visualChange?.from}
              onHidePreview={onHidePreview}
              onPreviewCard={onPreviewCard}
            />
            <span className="agent-chat-change__arrow" aria-hidden="true">→</span>
            <AgentChatChangeCard
              entry={visualChange?.to}
              onHidePreview={onHidePreview}
              onPreviewCard={onPreviewCard}
            />
          </>
        ) : (
          <AgentChatChangeCard
            entry={visualChange}
            onHidePreview={onHidePreview}
            onPreviewCard={onPreviewCard}
          />
        )}
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
}) {
  const proposal = message.proposal
  const pendingChangeCount =
    proposal.changes?.filter((change) => change.status === 'pending').length ?? 0
  const appliedChangeCount =
    proposal.changes?.filter((change) => change.status === 'applied').length ?? 0
  const visualChanges =
    proposal.visualChanges ??
    createCardChangePresentation(null, proposal.deck, proposal.changes)
  const summary = summarizeCardChanges(visualChanges)
  const visualChangesById = new Map(
    [
      ...(visualChanges?.replacements ?? []),
      ...(visualChanges?.additions ?? []),
      ...(visualChanges?.removals ?? []),
    ].map((change) => [change.changeId, change]),
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
            {proposal.changes.map((change) => (
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

const AgentMarkdownContext = createContext(null)

const AgentCardReference = memo(function AgentCardReference({
  card,
  cardId,
  onHidePreview,
  onPreviewCard,
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
        src={card.url}
        alt=""
        loading="lazy"
        decoding="async"
        draggable="false"
        onLoad={revealImage}
      />
    </button>
  )
})

function AgentMarkdownLink({ children, href }) {
  return (
    <a href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  )
}

function AgentMarkdownCardReference({ cardId }) {
  const context = useContext(AgentMarkdownContext)

  return (
    <AgentCardReference
      card={context.cardsById.get(cardId)}
      cardId={cardId}
      onHidePreview={context.onHidePreview}
      onPreviewCard={context.onPreviewCard}
    />
  )
}

const AGENT_MARKDOWN_COMPONENTS = {
  a: AgentMarkdownLink,
  'swu-card': AgentMarkdownCardReference,
}

export const AgentMessageText = memo(function AgentMessageText({
  cardsById,
  onHidePreview,
  onPreviewCard,
  text,
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
