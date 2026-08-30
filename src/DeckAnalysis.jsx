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
} from 'chart.js'
import { analyzeDeck } from './deck-analysis.js'

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  PieController,
  Tooltip,
)

const CARD_TYPE_COLORS = {
  units: '#22d3ee',
  events: '#facc15',
  equipment: '#a78bfa',
  other: '#94a3b8',
}

const costCountLabels = {
  id: 'costCountLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    const values = chart.data.datasets[0].data

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

function pluralizeCards(count) {
  return `${count} card${count === 1 ? '' : 's'}`
}

function CardTypeChart({ distribution }) {
  const canvasRef = useRef(null)
  const total = distribution.reduce(
    (sum, category) => sum + category.count,
    0,
  )
  const chartSummary = distribution
    .map((category) => `${category.label}: ${category.count}`)
    .join(', ')

  useEffect(() => {
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
              ? distribution.map((category) => CARD_TYPE_COLORS[category.id])
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
  }, [distribution, total])

  return (
    <section className="card-type-distribution" aria-labelledby="card-types-title">
      <div className="deck-analysis__heading">
        <h3 id="card-types-title">Card types</h3>
        <span>{pluralizeCards(total)} in main deck</span>
      </div>
      <div className="card-type-distribution__content">
        <div className="card-type-distribution__chart">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Main deck card type distribution. ${chartSummary}.`}
          >
            {chartSummary}
          </canvas>
        </div>
        <ul className="card-type-distribution__legend" aria-label="Card type counts">
          {distribution.map((category) => (
            <li key={category.id}>
              <span
                className={`card-type-distribution__swatch is-${category.id}`}
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

function CostCurveChart({ averageCost, costBuckets, nominalValue }) {
  const canvasRef = useRef(null)
  const chartSummary = costBuckets
    .map((bucket) => `cost ${bucket.label}: ${bucket.count}`)
    .join(', ')

  useEffect(() => {
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
                return `Cost ${items[0].label}`
              },
              label(context) {
                return pluralizeCards(context.parsed.y)
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
          <strong aria-label={`Nominal value ${nominalValue}`}>
            {nominalValue}
          </strong>
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

export default function DeckAnalysis({ currencyFormatter, deck }) {
  const analysis = useMemo(() => analyzeDeck(deck), [deck])
  const nominalValue = currencyFormatter.format(analysis.nominalValue)

  return (
    <aside
      className="deck-analysis"
      aria-label="Deck composition, cost, and value summary"
    >
      <div className="deck-analysis__layout">
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
