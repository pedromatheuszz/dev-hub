import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HeuristicProvider, SOURCES, runIngest, type Category } from '@devhub/core'
import {
  ArticlesRepo, NodeSqliteDriver, SearchRepo, SourcesRepo, StoriesRepo, TagsRepo, migrate,
} from '@devhub/db'
import { nodePlatform } from './platform-node.js'

/**
 * Ancorado na raiz do repositório, não em process.cwd(): `npm run -w`
 * executa com o cwd do workspace, o que criava o banco em tools/cli/data.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const CAMINHO_DB = resolve(RAIZ, 'data/devhub.db')
const CATEGORIAS: Category[] = ['technology', 'programming', 'innovation']

function abrir() {
  mkdirSync(dirname(CAMINHO_DB), { recursive: true })
  const db = new NodeSqliteDriver(CAMINHO_DB)
  migrate(db)
  return db
}

function quandoFoi(ts: number, agora: number): string {
  const h = Math.floor((agora - ts) / 3_600_000)
  if (h < 1) return 'agora'
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

async function cmdIngest() {
  const db = abrir()
  const sources = new SourcesRepo(db)
  for (const s of SOURCES) sources.upsert(s)

  console.log(`Ingerindo ${sources.listActive().length} fontes…\n`)
  const inicio = Date.now()

  const r = await runIngest({
    platform: nodePlatform,
    sources,
    articles: new ArticlesRepo(db),
    stories: new StoriesRepo(db),
    tags: new TagsRepo(db),
    search: new SearchRepo(db),
    ai: new HeuristicProvider(),
  })

  console.log(`Fontes lidas ......... ${r.fontesLidas}`)
  console.log(`Fontes com erro ...... ${r.fontesComErro}`)
  console.log(`Itens vistos ......... ${r.itensVistos}`)
  console.log(`Filtrados (sem IA) ... ${r.itensFiltrados}`)
  console.log(`Artigos novos ........ ${r.itensNovos}`)
  console.log(`Histórias criadas .... ${r.historiasCriadas}`)
  console.log(`\nConcluído em ${((Date.now() - inicio) / 1000).toFixed(1)}s`)
  db.close()
}

function cmdFeed(categoria: Category | null, limite: number) {
  const db = abrir()
  const stories = new StoriesRepo(db)
  const articles = new ArticlesRepo(db)
  const tags = new TagsRepo(db)
  const agora = Date.now()

  const top = stories.topRanked(limite, categoria, agora)
  if (top.length === 0) {
    console.log('Nada no feed ainda. Rode:  npm run dev -w @devhub/cli -- ingest')
    db.close()
    return
  }

  console.log(`\nDEV HUB — ${categoria ?? 'todas as categorias'}\n${'─'.repeat(76)}`)

  for (const [i, item] of top.entries()) {
    const a = articles.byId(item.primaryArticleId)
    const b = item.breakdown
    const selo = item.story.isBreaking ? ' [ÚLTIMA HORA]' : ''
    const slugs = tags.tagsFor(item.primaryArticleId).slice(0, 4)

    console.log(`\n${String(i + 1).padStart(2)}. ${item.story.canonicalTitle}${selo}`)
    console.log(
      `    ${item.story.category} · ${a ? quandoFoi(a.publishedAt, agora) : '?'}`
      + ` · ${a?.contentType ?? '?'}`
      + `${item.story.articleCount > 1 ? ` · ${item.story.articleCount} fontes` : ''}`
      + `${slugs.length ? ` · ${slugs.join(', ')}` : ''}`,
    )
    // O spec exige que o ranking seja inspecionável, não caixa-preta.
    console.log(
      `    score ${b.total.toFixed(4)}  =  fresc ${b.freshness.toFixed(2)}`
      + ` × conf ${b.trust.toFixed(2)} × imp ${b.importance.toFixed(2)}`
      + ` × afin ${b.affinity.toFixed(2)} × dedup ${b.dedupPenalty.toFixed(2)}`,
    )
    if (a) console.log(`    ${a.url}`)
  }
  console.log()
  db.close()
}

function cmdSearch(termo: string, limite: number) {
  const db = abrir()
  const ids = new SearchRepo(db).query(termo, limite)
  const articles = new ArticlesRepo(db)
  const agora = Date.now()

  if (ids.length === 0) {
    console.log(`Nenhum resultado para "${termo}".`)
    db.close()
    return
  }

  console.log(`\n${ids.length} resultado(s) para "${termo}"\n${'─'.repeat(76)}`)
  for (const id of ids) {
    const a = articles.byId(id)
    if (!a) continue
    console.log(`\n  ${a.title}`)
    console.log(`  ${quandoFoi(a.publishedAt, agora)} · ${a.readingMinutes} min · ${a.contentType}`)
    console.log(`  ${a.url}`)
  }
  console.log()
  db.close()
}

function cmdSources() {
  const db = abrir()
  const sources = new SourcesRepo(db)
  for (const s of SOURCES) sources.upsert(s)

  const ativas = sources.listActive()
  console.log(`\n${ativas.length} fontes ativas\n${'─'.repeat(76)}`)
  for (const s of ativas) {
    const quando = s.lastFetchedAt ? quandoFoi(s.lastFetchedAt, Date.now()) : 'nunca'
    console.log(
      `  ${s.id.padEnd(22)} ${s.kind.padEnd(11)} peso ${s.trustWeight.toFixed(2)}  lido: ${quando}`,
    )
  }
  console.log()
  db.close()
}

function ajuda() {
  console.log(`
DEV HUB — CLI da Fase 1

  ingest                      Busca todas as fontes e processa o pipeline
  feed [categoria] [limite]   Mostra o feed ranqueado (padrão: todas, 20)
                              categoria: technology | programming | innovation
  search <termo> [limite]     Busca no índice FTS5 (padrão: 20)
  sources                     Lista as fontes e quando foram lidas

Exemplos:
  npm run dev -w @devhub/cli -- ingest
  npm run dev -w @devhub/cli -- feed programming 10
  npm run dev -w @devhub/cli -- search "rust compiler"
`)
}

const [comando, ...args] = process.argv.slice(2)

try {
  switch (comando) {
    case 'ingest':
      await cmdIngest()
      break
    case 'feed': {
      const cat = CATEGORIAS.includes(args[0] as Category) ? (args[0] as Category) : null
      const lim = Number(args[cat ? 1 : 0]) || 20
      cmdFeed(cat, lim)
      break
    }
    case 'search':
      if (!args[0]) {
        console.error('Informe o termo de busca.')
        process.exit(1)
      }
      cmdSearch(args[0], Number(args[1]) || 20)
      break
    case 'sources':
      cmdSources()
      break
    default:
      ajuda()
  }
} catch (e) {
  console.error('[erro fatal]', e)
  process.exit(1)
}
