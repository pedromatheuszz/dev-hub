import { useDevHub } from '@devhub/state'
import { useEffect } from 'react'
import { rotuloCategoria } from '../api.js'

const ROTULO_KIND: Record<string, string> = {
  language: 'Linguagens',
  framework: 'Frameworks e ferramentas',
  hardware: 'Hardware',
  company: 'Empresas',
  topic: 'Tópicos',
  product: 'Produtos',
}

const ORDEM_KIND = ['language', 'framework', 'hardware', 'company', 'topic', 'product']

const CATEGORIAS = ['technology', 'programming', 'innovation'] as const

/**
 * Tela de personalização. Seguir um tópico eleva o fator de afinidade do
 * ranking, que a própria interface mostra na decomposição de cada card —
 * então o efeito de seguir é visível, não mágico.
 */
export function Following() {
  const suggested = useDevHub((s) => s.suggested)
  const loading = useDevHub((s) => s.loadingSuggested)
  const loadSuggested = useDevHub((s) => s.loadSuggested)
  const toggleFollow = useDevHub((s) => s.toggleFollow)

  useEffect(() => { void loadSuggested() }, [loadSuggested])

  const seguindo = suggested.filter((t) => t.seguindo)

  const porKind = new Map<string, typeof suggested>()
  for (const t of suggested) {
    const lista = porKind.get(t.kind)
    if (lista) lista.push(t)
    else porKind.set(t.kind, [t])
  }

  if (loading && suggested.length === 0) {
    return (
      <div className="grid">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 90 }} />
        ))}
      </div>
    )
  }

  if (suggested.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon" aria-hidden="true">◎</div>
        <div className="empty-title">Nada para seguir ainda</div>
        <p className="empty-hint">
          Busque as notícias primeiro. As sugestões aqui vêm das tecnologias que
          realmente aparecem nos seus artigos, não de uma lista fixa.
        </p>
      </div>
    )
  }

  return (
    <div className="settings">
      <div className="banner banner-info">
        <span aria-hidden="true">ℹ</span>
        <span>
          {seguindo.length === 0
            ? 'Você ainda não segue nada. O que você seguir sobe no feed — e o '
              + 'aumento fica visível no fator "A" da decomposição de cada card.'
            : `Seguindo ${seguindo.length} ${seguindo.length === 1 ? 'tópico' : 'tópicos'}. `
              + 'Eles sobem no feed via o fator de afinidade.'}
        </span>
      </div>

      <div className="section-head"><h2>Categorias</h2></div>
      <div className="follow-grid">
        {CATEGORIAS.map((c) => (
          <button
            key={c}
            className="follow-chip"
            style={{ ['--cat' as string]: `var(--${c})` }}
            onClick={() => void toggleFollow('category', c)}
          >
            <span className="follow-nome">{rotuloCategoria(c)}</span>
            <span className="follow-acao">+ seguir</span>
          </button>
        ))}
      </div>

      {ORDEM_KIND.filter((k) => porKind.has(k)).map((kind) => (
        <div key={kind}>
          <div className="section-head">
            <h2>{ROTULO_KIND[kind] ?? kind}</h2>
            <span className="section-count">{porKind.get(kind)!.length}</span>
          </div>
          <div className="follow-grid">
            {porKind.get(kind)!.map((t) => (
              <button
                key={t.slug}
                className={`follow-chip${t.seguindo ? ' on' : ''}`}
                onClick={() => void toggleFollow('tag', t.slug)}
                aria-pressed={t.seguindo}
              >
                <span className="follow-nome">{t.name}</span>
                <span className="follow-contagem">{t.artigos}</span>
                <span className="follow-acao">{t.seguindo ? '✓ seguindo' : '+ seguir'}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
