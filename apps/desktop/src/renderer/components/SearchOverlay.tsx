import { useDevHub } from '@devhub/state'
import { useEffect, useRef, useState } from 'react'
import { hostDe, tempoRelativo } from '../api.js'

export function SearchOverlay() {
  const aberta = useDevHub((s) => s.searchOpen)
  const query = useDevHub((s) => s.searchQuery)
  const resultados = useDevHub((s) => s.searchResults)
  const buscando = useDevHub((s) => s.searching)
  const setSearchQuery = useDevHub((s) => s.setSearchQuery)
  const closeSearch = useDevHub((s) => s.closeSearch)
  const navigate = useDevHub((s) => s.navigate)

  const [foco, setFoco] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (aberta) inputRef.current?.focus()
  }, [aberta])

  useEffect(() => { setFoco(0) }, [resultados])

  if (!aberta) return null

  function abrir(id: string) {
    closeSearch()
    void navigate({ name: 'article', id })
  }

  function teclado(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeSearch()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFoco((f) => Math.min(resultados.length - 1, f + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFoco((f) => Math.max(0, f - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const alvo = resultados[foco]
      if (alvo) abrir(alvo.article.id)
    }
  }

  return (
    <div
      className="overlay"
      onClick={closeSearch}
      role="dialog"
      aria-modal="true"
      aria-label="Busca"
    >
      <div className="search-panel" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="search-input"
          value={query}
          onChange={(e) => void setSearchQuery(e.target.value)}
          onKeyDown={teclado}
          placeholder="Buscar por tecnologia, linguagem, framework, empresa…"
          aria-label="Termo de busca"
        />

        <div className="search-results">
          {buscando && <div className="empty"><span className="spin">◌</span></div>}

          {!buscando && query.trim().length >= 2 && resultados.length === 0 && (
            <div className="empty">
              <div className="empty-hint">Nenhum resultado para “{query}”.</div>
            </div>
          )}

          {!buscando && query.trim().length < 2 && (
            <div className="empty">
              <div className="empty-hint">
                Digite ao menos dois caracteres. A busca roda no índice local,
                sem internet.
              </div>
            </div>
          )}

          {resultados.map((r, i) => (
            <button
              key={r.article.id}
              className={`search-hit${i === foco ? ' selected' : ''}`}
              onMouseEnter={() => setFoco(i)}
              onClick={() => abrir(r.article.id)}
            >
              <div className="search-hit-title">{r.article.title}</div>
              <div className="search-hit-meta">
                {hostDe(r.article.url)} · {tempoRelativo(r.article.publishedAt)}
                {r.tags.length > 0 && ` · ${r.tags.slice(0, 3).join(', ')}`}
              </div>
            </button>
          ))}
        </div>

        <div className="search-foot">
          <span><span className="kbd">↑↓</span> navegar</span>
          <span><span className="kbd">↵</span> abrir</span>
          <span><span className="kbd">Esc</span> fechar</span>
          {resultados.length > 0 && (
            <span style={{ marginLeft: 'auto' }}>{resultados.length} resultados</span>
          )}
        </div>
      </div>
    </div>
  )
}
