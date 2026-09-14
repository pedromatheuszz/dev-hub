import { useDevHub, type Route } from '@devhub/state'
import { useEffect, useState } from 'react'
import { api, rotuloCategoria } from './api.js'
import { FeedView } from './components/FeedView.js'
import { Reader } from './components/Reader.js'
import { SearchOverlay } from './components/SearchOverlay.js'
import { Settings } from './components/Settings.js'
import { Sidebar } from './components/Sidebar.js'
import { aplicarTema } from './theme.js'

const TITULOS: Record<string, string> = {
  home: 'Início',
  latest: 'Mais recentes',
  trending: 'Em alta',
  saved: 'Salvos',
  following: 'Seguindo',
  settings: 'Configurações',
  article: 'Artigo',
}

function tituloDe(r: Route): string {
  if (r.name === 'category') return rotuloCategoria(r.category)
  return TITULOS[r.name] ?? 'Dev Hub'
}

/** Atalhos numéricos da barra lateral, na mesma ordem em que aparecem. */
const ATALHOS_NUMERICOS: Route[] = [
  { name: 'home' },
  { name: 'latest' },
  { name: 'trending' },
  { name: 'category', category: 'technology' },
  { name: 'category', category: 'programming' },
  { name: 'category', category: 'innovation' },
  { name: 'saved' },
  { name: 'following' },
  { name: 'settings' },
]

export function App() {
  const rota = useDevHub((s) => s.route)
  const themePref = useDevHub((s) => s.themePref)
  const fontScale = useDevHub((s) => s.fontScale)
  const ingesting = useDevHub((s) => s.ingesting)
  const loading = useDevHub((s) => s.loading)
  const items = useDevHub((s) => s.items)

  const init = useDevHub((s) => s.init)
  const navigate = useDevHub((s) => s.navigate)
  const goBack = useDevHub((s) => s.goBack)
  const refresh = useDevHub((s) => s.refresh)
  const runIngest = useDevHub((s) => s.runIngest)
  const openSearch = useDevHub((s) => s.openSearch)
  const searchOpen = useDevHub((s) => s.searchOpen)
  const moveSelection = useDevHub((s) => s.moveSelection)
  const openSelected = useDevHub((s) => s.openSelected)
  const toggleSavedSelected = useDevHub((s) => s.toggleSavedSelected)
  const setFontScale = useDevHub((s) => s.setFontScale)

  const [recolhida, setRecolhida] = useState(false)
  const [pronto, setPronto] = useState(false)

  useEffect(() => { void init(api).then(() => setPronto(true)) }, [init])

  // Tema: reaplica quando a preferência muda e quando o Windows troca de tema.
  useEffect(() => {
    aplicarTema(themePref, fontScale)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const aoMudar = () => aplicarTema(themePref, fontScale)
    mq.addEventListener('change', aoMudar)
    return () => mq.removeEventListener('change', aoMudar)
  }, [themePref, fontScale])

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null
      const digitando = alvo?.tagName === 'INPUT' || alvo?.tagName === 'TEXTAREA'

      // Ctrl+K abre a busca de qualquer lugar, inclusive de dentro de um campo.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openSearch()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        void navigate({ name: 'settings' })
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        void setFontScale(useDevHub.getState().fontScale + 0.1)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault()
        void setFontScale(useDevHub.getState().fontScale - 0.1)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setRecolhida((v) => !v)
        return
      }

      if (digitando || searchOpen || e.ctrlKey || e.metaKey || e.altKey) return

      switch (e.key) {
        case 'j': case 'ArrowDown':
          e.preventDefault(); moveSelection(1); break
        case 'k': case 'ArrowUp':
          e.preventDefault(); moveSelection(-1); break
        case 'Enter':
          e.preventDefault(); void openSelected(); break
        case 's': case 'S':
          e.preventDefault(); void toggleSavedSelected(); break
        case 'r': case 'R':
          e.preventDefault(); void refresh(); break
        case 'Escape':
          e.preventDefault(); void goBack(); break
        default: {
          const n = Number(e.key)
          if (n >= 1 && n <= 9) {
            e.preventDefault()
            const alvoRota = ATALHOS_NUMERICOS[n - 1]
            if (alvoRota) void navigate(alvoRota)
          }
        }
      }
    }

    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [
    searchOpen, openSearch, navigate, goBack, refresh,
    moveSelection, openSelected, toggleSavedSelected, setFontScale,
  ])

  return (
    <div className="app">
      <Sidebar collapsed={recolhida} />

      <div className="main">
        <header className="topbar">
          <h1>{tituloDe(rota)}</h1>
          {loading && items.length > 0 && <span className="spin" aria-hidden="true">◌</span>}

          <div className="topbar-spacer" />

          <button className="search-trigger" onClick={openSearch} aria-label="Abrir busca">
            <span aria-hidden="true">⌕</span>
            <span>Buscar…</span>
            <span className="kbd">Ctrl K</span>
          </button>

          <button
            className="btn"
            onClick={() => void runIngest()}
            disabled={ingesting}
            title="Buscar novidades (R recarrega a lista)"
          >
            {ingesting ? <><span className="spin">◌</span> Buscando…</> : '↻ Atualizar'}
          </button>
        </header>

        <main className="content">
          {!pronto ? (
            <div className="empty"><span className="spin" aria-hidden="true">◌</span></div>
          ) : rota.name === 'settings' ? (
            <Settings />
          ) : rota.name === 'article' ? (
            <Reader id={rota.id} />
          ) : rota.name === 'following' ? (
            <div className="empty">
              <div className="empty-icon" aria-hidden="true">◎</div>
              <div className="empty-title">Seguir tópicos chega na Fase 4</div>
              <p className="empty-hint">
                Aqui você vai escolher linguagens, frameworks, empresas e hardware
                para priorizar no seu feed. O fator de afinidade do ranking já
                está no lugar, esperando esses dados.
              </p>
            </div>
          ) : (
            <FeedView />
          )}
        </main>
      </div>

      <SearchOverlay />
    </div>
  )
}
