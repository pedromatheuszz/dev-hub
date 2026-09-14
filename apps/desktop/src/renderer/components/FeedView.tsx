import { useDevHub, type FeedItem } from '@devhub/state'
import { StoryCard } from './StoryCard.js'

function Vazio({ rota, aoIngerir, ingerindo }: {
  rota: string; aoIngerir(): void; ingerindo: boolean
}) {
  if (rota === 'saved') {
    return (
      <div className="empty">
        <div className="empty-icon" aria-hidden="true">★</div>
        <div className="empty-title">Nenhum artigo salvo ainda</div>
        <p className="empty-hint">
          Clique na estrela de qualquer card, ou pressione <span className="kbd">S</span> com
          o card em foco, para guardar um artigo aqui.
        </p>
      </div>
    )
  }
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">◈</div>
      <div className="empty-title">Nada no feed ainda</div>
      <p className="empty-hint">
        Busque as notícias das 37 fontes configuradas. A primeira vez leva cerca
        de um minuto; depois só o que mudou é baixado.
      </p>
      <button className="btn btn-primary" onClick={aoIngerir} disabled={ingerindo}>
        {ingerindo ? <><span className="spin">◌</span> Buscando…</> : 'Buscar notícias agora'}
      </button>
    </div>
  )
}

function Esqueletos() {
  return (
    <div className="grid">
      {Array.from({ length: 9 }, (_, i) => <div key={i} className="skeleton" />)}
    </div>
  )
}

function Secao({ titulo, itens, offset }: {
  titulo: string; itens: FeedItem[]; offset: number
}) {
  const selectedIndex = useDevHub((s) => s.selectedIndex)
  const setSelection = useDevHub((s) => s.setSelection)
  const navigate = useDevHub((s) => s.navigate)
  const toggleSaved = useDevHub((s) => s.toggleSaved)
  const mostrarScore = useDevHub((s) => s.route.name !== 'saved')

  if (itens.length === 0) return null

  return (
    <>
      <div className="section-head">
        <h2>{titulo}</h2>
        <span className="section-count">{itens.length}</span>
      </div>
      <div className="grid">
        {itens.map((item, i) => (
          <StoryCard
            key={item.article.id}
            item={item}
            selecionado={selectedIndex === offset + i}
            mostrarScore={mostrarScore}
            onSelecionar={() => setSelection(offset + i)}
            onAbrir={() => void navigate({ name: 'article', id: item.article.id })}
            onSalvar={() => void toggleSaved(item.article.id)}
          />
        ))}
      </div>
    </>
  )
}

/**
 * A home segue a hierarquia do briefing: última hora no topo, depois
 * destaques, depois as três categorias. As demais rotas são uma lista só.
 */
export function FeedView() {
  const rota = useDevHub((s) => s.route)
  const items = useDevHub((s) => s.items)
  const loading = useDevHub((s) => s.loading)
  const error = useDevHub((s) => s.error)
  const ingesting = useDevHub((s) => s.ingesting)
  const runIngest = useDevHub((s) => s.runIngest)

  if (loading && items.length === 0) return <Esqueletos />

  if (error) {
    return (
      <div className="banner banner-error" role="alert">
        <span aria-hidden="true">⚠</span>
        <span>{error}</span>
      </div>
    )
  }

  if (items.length === 0) {
    return <Vazio rota={rota.name} aoIngerir={() => void runIngest()} ingerindo={ingesting} />
  }

  if (rota.name !== 'home') {
    return <Secao titulo={tituloDaRota(rota.name)} itens={items} offset={0} />
  }

  // Monta as seções da home sem repetir artigo entre elas.
  const usados = new Set<string>()
  const pegar = (fn: (i: FeedItem) => boolean, max: number) => {
    const saida: FeedItem[] = []
    for (const i of items) {
      if (saida.length >= max) break
      if (usados.has(i.article.id) || !fn(i)) continue
      usados.add(i.article.id)
      saida.push(i)
    }
    return saida
  }

  const ultimaHora = pegar((i) => i.story.isBreaking, 6)
  const destaques = pegar((i) => i.story.importance >= 0.6, 6)
  const tecnologia = pegar((i) => i.story.category === 'technology', 6)
  const programacao = pegar((i) => i.story.category === 'programming', 6)
  const inovacao = pegar((i) => i.story.category === 'innovation', 6)
  const resto = pegar(() => true, 12)

  let n = 0
  const secoes: Array<[string, FeedItem[]]> = [
    ['Última hora', ultimaHora],
    ['Destaques', destaques],
    ['Tecnologia', tecnologia],
    ['Programação', programacao],
    ['Inovação', inovacao],
    ['Mais notícias', resto],
  ]

  return (
    <>
      {secoes.map(([titulo, lista]) => {
        const offset = n
        n += lista.length
        return <Secao key={titulo} titulo={titulo} itens={lista} offset={offset} />
      })}
    </>
  )
}

function tituloDaRota(nome: string): string {
  const mapa: Record<string, string> = {
    latest: 'Mais recentes',
    trending: 'Em alta',
    saved: 'Artigos salvos',
    category: 'Categoria',
  }
  return mapa[nome] ?? 'Feed'
}
