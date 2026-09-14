import type { FeedItem } from '@devhub/state'
import { hostDe, rotuloCategoria, rotuloIdioma, rotuloTipo, tempoRelativo } from '../api.js'

interface Props {
  item: FeedItem
  selecionado: boolean
  mostrarScore: boolean
  onAbrir(): void
  onSelecionar(): void
  onSalvar(): void
}

/**
 * Card de história. O selo de tipo (rumor/opinião/análise) e a decomposição
 * do score são exigências de transparência do spec, não enfeite.
 */
export function StoryCard({
  item, selecionado, mostrarScore, onAbrir, onSelecionar, onSalvar,
}: Props) {
  const { story, article, tags, breakdown, saved, traducao } = item
  const b = breakdown

  // Quando há tradução, ela é o que se lê; o original fica no title do
  // elemento, a um passar de mouse. O selo deixa claro que é automática.
  const titulo = traducao?.title ?? story.canonicalTitle
  const resumo = traducao?.excerpt || article.excerpt

  return (
    <div
      className={`card${selecionado ? ' selected' : ''}`}
      style={{ ['--cat' as string]: `var(--${story.category})` }}
      onMouseEnter={onSelecionar}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onAbrir()
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={story.canonicalTitle}
    >
      <div className="card-foot">
        <span className="chip chip-cat">{rotuloCategoria(story.category)}</span>
        {story.isBreaking && <span className="chip chip-breaking">Última hora</span>}
        {article.contentType !== 'news' && (
          <span className="chip chip-type">{rotuloTipo(article.contentType)}</span>
        )}
        {traducao && (
          <span
            className="chip chip-trad"
            title={`Traduzido automaticamente do ${rotuloIdioma(traducao.sourceLang)}.

Original: ${story.canonicalTitle}`}
          >
            ⇄ Traduzido
          </span>
        )}
        <button
          className={`icon-btn${saved ? ' on' : ''}`}
          style={{ marginLeft: 'auto' }}
          onClick={(e) => {
            e.stopPropagation()
            onSalvar()
          }}
          title={saved ? 'Remover dos salvos (S)' : 'Salvar (S)'}
          aria-pressed={saved}
        >
          {saved ? '★' : '☆'}
        </button>
      </div>

      <h3 className="card-title" title={traducao ? story.canonicalTitle : undefined}>
        {titulo}
      </h3>

      {resumo && <p className="card-excerpt">{resumo}</p>}

      <div className="card-meta">
        <span>{hostDe(article.url)}</span>
        <span className="dot-sep">·</span>
        <span>{tempoRelativo(article.publishedAt)}</span>
        <span className="dot-sep">·</span>
        <span>{article.readingMinutes} min</span>
        {story.articleCount > 1 && (
          <>
            <span className="dot-sep">·</span>
            <span>{story.articleCount} fontes</span>
          </>
        )}
      </div>

      {tags.length > 0 && (
        <div className="card-foot" style={{ flexWrap: 'wrap' }}>
          {tags.slice(0, 4).map((t) => (
            <span key={t} className="chip chip-tag">{t}</span>
          ))}
        </div>
      )}

      {mostrarScore && (
        <div
          className="score"
          title={
            'Por que estou vendo isto — o score é o produto destes cinco fatores:\n'
            + `F  frescor ............ ${b.freshness.toFixed(3)}\n`
            + `C  confiança da fonte . ${b.trust.toFixed(3)}\n`
            + `I  importância ........ ${b.importance.toFixed(3)}\n`
            + `A  afinidade .......... ${b.affinity.toFixed(3)}\n`
            + `D  penalidade de dup .. ${b.dedupPenalty.toFixed(3)}\n`
            + `=  total .............. ${b.total.toFixed(4)}`
          }
        >
          <span className="score-total">{b.total.toFixed(3)}</span>
          <span className="score-x">·</span>
          <span>F{b.freshness.toFixed(2).slice(1)}</span>
          <span>C{b.trust.toFixed(2).slice(1)}</span>
          <span>I{b.importance.toFixed(2).slice(1)}</span>
          <span>A{b.affinity.toFixed(1)}</span>
          <span>D{b.dedupPenalty.toFixed(1)}</span>
        </div>
      )}
    </div>
  )
}
