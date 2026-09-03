import { useEffect, useMemo, useRef } from 'react'
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  PieController,
  Tooltip,
  type Plugin,
} from 'chart.js'
import { analyzeDeck } from './deck-analysis.js'
import type { Deck } from '../types/deck.js'

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  PieController,
  Tooltip,
)

type DeckAnalysisResult = ReturnType<typeof analyzeDeck>
type CardTypeDistribution = DeckAnalysisResult['cardTypeDistribution']
type SetDistribution = DeckAnalysisResult['setDistribution']
type CostBuckets = DeckAnalysisResult['costBuckets']
type PieDistribution = ReadonlyArray<{
  id: string
  label: string
  count: number
}>

const CARD_TYPE_COLORS: Record<CardTypeDistribution[number]['id'], string> = {
  units: '#22d3ee',
  events: '#facc15',
  equipment: '#a78bfa',
  other: '#94a3b8',
}

const SET_DISTRIBUTION_COLORS = [
  '#38bdf8',
  '#facc15',
  '#a78bfa',
  '#fb7185',
  '#34d399',
  '#f97316',
  '#60a5fa',
  '#e879f9',
  '#a3e635',
  '#2dd4bf',
  '#f472b6',
  '#f59e0b',
]

const costCountLabels: Plugin<'bar'> = {
  id: 'costCountLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    const values = chart.data.datasets[0]?.data ?? []

    ctx.save()
    ctx.fillStyle = '#e7edf7'
    ctx.font = '800 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    chart.getDatasetMeta(0).data.forEach((bar, index) => {
      ctx.fillText(
        String(values[index]),
        bar.x,
        Math.max(bar.y - 4, chart.chartArea.top + 10),
      )
    })
    ctx.restore()
  },
}

function pluralizeCards(count: number) {
  return `${count} card${count === 1 ? '' : 's'}`
}

function cardTypeColor(category: PieDistribution[number]) {
  return CARD_TYPE_COLORS[category.id as CardTypeDistribution[number]['id']]
}

function setDistributionColor(
  _category: PieDistribution[number],
  index: number,
) {
  return SET_DISTRIBUTION_COLORS[index % SET_DISTRIBUTION_COLORS.length] ??
    '#94a3b8'
}

function PieDistributionChart({
  ariaLabel,
  className,
  colorFor,
  distribution,
  headingId,
  title,
}: {
  ariaLabel: string
  className: string
  colorFor(category: PieDistribution[number], index: number): string
  distribution: PieDistribution
  headingId: string
  title: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const total = distribution.reduce(
    (sum, category) => sum + category.count,
    0,
  )
  const chartSummary = distribution
    .map((category) => `${category.label}: ${category.count}`)
    .join(', ')

  useEffect(() => {
    if (!canvasRef.current) return undefined
    const hasCards = total > 0
    const chart = new Chart(canvasRef.current, {
      type: 'pie',
      data: {
        labels: hasCards
          ? distribution.map((category) => category.label)
          : ['No cards'],
        datasets: [
          {
            data: hasCards
              ? distribution.map((category) => category.count)
              : [1],
            backgroundColor: hasCards
              ? distribution.map(colorFor)
              : ['#334155'],
            borderColor: '#0b1728',
            borderWidth: 2,
            hoverOffset: 4,
          },
        ],
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: hasCards,
            callbacks: {
              label(context) {
                const count = context.parsed
                const percentage = Math.round((count / total) * 100)
                return `${context.label}: ${pluralizeCards(count)} (${percentage}%)`
              },
            },
          },
        },
      },
    })

    return () => chart.destroy()
  }, [colorFor, distribution, total])

  return (
    <section className={`pie-distribution ${className}`} aria-labelledby={headingId}>
      <div className="deck-analysis__heading">
        <h3 id={headingId}>{title}</h3>
        <span>{pluralizeCards(total)} in main deck</span>
      </div>
      <div className="pie-distribution__content">
        <div className="pie-distribution__chart">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${ariaLabel}. ${chartSummary}.`}
          >
            {chartSummary}
          </canvas>
        </div>
        <ul className="pie-distribution__legend" aria-label={`${title} counts`}>
          {distribution.map((category, index) => (
            <li key={category.id}>
              <span
                className="pie-distribution__swatch"
                style={{ backgroundColor: colorFor(category, index) }}
                aria-hidden="true"
              />
              <span>{category.label}</span>
              <strong>{category.count}</strong>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function SetDistributionChart({ distribution }: { distribution: SetDistribution }) {
  return (
    <PieDistributionChart
      ariaLabel="Main deck set distribution"
      className="set-distribution"
      colorFor={setDistributionColor}
      distribution={distribution}
      headingId="set-distribution-title"
      title="Sets"
    />
  )
}

function CardTypeChart({ distribution }: { distribution: CardTypeDistribution }) {
  return (
    <PieDistributionChart
      ariaLabel="Main deck card type distribution"
      className="card-type-distribution"
      colorFor={cardTypeColor}
      distribution={distribution}
      headingId="card-types-title"
      title="Card types"
    />
  )
}

function CostCurveChart({
  averageCost,
  costBuckets,
  nominalValue,
}: {
  averageCost: number | null
  costBuckets: CostBuckets
  nominalValue: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const chartSummary = costBuckets
    .map((bucket) => `cost ${bucket.label}: ${bucket.count}`)
    .join(', ')

  useEffect(() => {
    if (!canvasRef.current) return undefined
    const chart = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: costBuckets.map((bucket) => bucket.label),
        datasets: [
          {
            data: costBuckets.map((bucket) => bucket.count),
            backgroundColor: '#fbbf24',
            hoverBackgroundColor: '#fde047',
            borderRadius: 4,
            borderSkipped: false,
            barPercentage: 0.72,
            categoryPercentage: 0.84,
          },
        ],
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        responsive: true,
        layout: { padding: { top: 15 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              title(items) {
                return `Cost ${items[0]?.label ?? ''}`
              },
              label(context) {
                return pluralizeCards(context.parsed.y ?? 0)
              },
            },
          },
        },
        scales: {
          x: {
            border: { color: '#475569' },
            grid: { display: false },
            ticks: {
              color: '#cbd5e1',
              font: { size: 11, weight: 700 },
            },
          },
          y: {
            beginAtZero: true,
            border: { display: false },
            grace: '20%',
            grid: { color: 'rgba(71, 85, 105, 0.3)' },
            ticks: { display: false, precision: 0 },
          },
        },
      },
      plugins: [costCountLabels],
    })

    return () => chart.destroy()
  }, [costBuckets])

  return (
    <section className="cost-curve" aria-labelledby="cost-curve-title">
      <div className="deck-analysis__header">
        <div className="deck-analysis__heading">
          <h3 id="cost-curve-title">Cost curve</h3>
          <span>
            {averageCost === null
              ? 'No cost data'
              : `${averageCost.toFixed(1)} average cost`}
          </span>
        </div>
        <div className="deck-value">
          <strong aria-label={`Estimated value ${nominalValue}`}>
            {nominalValue}
          </strong>
          <small
            className="deck-value__estimate"
            title="This is an estimated value."
          >
            * estimated
          </small>
        </div>
      </div>
      <div className="cost-curve__chart">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Main deck cost curve. ${chartSummary}.`}
        >
          {chartSummary}
        </canvas>
      </div>
    </section>
  )
}

export default function DeckAnalysis({
  currencyFormatter,
  deck,
}: {
  currencyFormatter: Intl.NumberFormat
  deck: Deck
}) {
  const analysis = useMemo(() => analyzeDeck(deck), [deck])
  const nominalValue = currencyFormatter.format(analysis.nominalValue)

  return (
    <aside
      className="deck-analysis"
      aria-label="Deck composition, cost, and value summary"
    >
      <div className="deck-analysis__layout">
        <SetDistributionChart distribution={analysis.setDistribution} />
        <CardTypeChart distribution={analysis.cardTypeDistribution} />
        <CostCurveChart
          averageCost={analysis.averageCost}
          costBuckets={analysis.costBuckets}
          nominalValue={nominalValue}
        />
      </div>
    </aside>
  )
}
