import { NodeSqliteDriver } from '@devhub/db/node'
import {
  ArticlesRepo, SearchRepo, SourcesRepo, StoriesRepo, TagsRepo, migrate,
} from '@devhub/db'
import { describe, expect, it } from 'vitest'
import { HeuristicProvider } from '../ai/heuristic.js'
import { fakeClock, fakeHttp, fakeSecrets, silentLogger } from '../testing/fakes.js'
import type { Source } from '../types.js'
import { runIngest, type IngestDeps } from './pipeline.js'

const AGORA = 1_789_000_000_000

function feedRss(itens: Array<{ t: string; u: string; d: string }>): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>F</title>${
    itens.map((i) =>
      `<item><title>${i.t}</title><link>${i.u}</link>`
      + '<pubDate>Mon, 08 Sep 2026 12:00:00 GMT</pubDate>'
      + `<description>${i.d}</description></item>`).join('')
  }</channel></rss>`
}

function fonte(id: string, feedUrl: string): Source {
  return {
    id, name: id, url: 'https://x.dev', feedUrl, kind: 'official',
    trustWeight: 1.0, categoryHint: null, active: true,
    lastFetchedAt: null, etag: null, lastModified: null,
  }
}

function montar(
  rotas: Record<string, { body: string; status?: number }>,
  fontes: Source[],
) {
  const db = new NodeSqliteDriver(':memory:')
  migrate(db)
  const sources = new SourcesRepo(db)
  for (const f of fontes) sources.upsert(f)

  const deps: IngestDeps = {
    platform: {
      http: fakeHttp(rotas),
      clock: fakeClock(AGORA),
      logger: silentLogger,
      secrets: fakeSecrets(),
    },
    sources,
    articles: new ArticlesRepo(db),
    stories: new StoriesRepo(db),
    tags: new TagsRepo(db),
    search: new SearchRepo(db),
    ai: new HeuristicProvider(),
  }
  return { db, deps }
}

describe('runIngest', () => {
  it('ingere artigos de um feed e os persiste', async () => {
    const { db, deps } = montar(
      { 'https://f/1': { body: feedRss([
        { t: 'Rust 1.90 released with borrow checker fixes', u: 'https://x.dev/rust', d: 'compiler and cargo improvements' },
      ]) } },
      [fonte('s1', 'https://f/1')],
    )

    const r = await runIngest(deps)
    expect(r.itensNovos).toBe(1)
    expect(db.all('SELECT id FROM articles')).toHaveLength(1)
    db.close()
  })

  it('filtra artigos fora de escopo antes de gastar IA', async () => {
    const { db, deps } = montar(
      { 'https://f/1': { body: feedRss([
        { t: 'Receita de bolo de cenoura', u: 'https://x.dev/bolo', d: 'bata os ovos com acucar e farinha' },
      ]) } },
      [fonte('s1', 'https://f/1')],
    )

    const r = await runIngest(deps)
    expect(r.itensFiltrados).toBe(1)
    expect(r.itensNovos).toBe(0)
    db.close()
  })

  it('não reingere o mesmo artigo na segunda rodada', async () => {
    const body = feedRss([
      { t: 'Kubernetes 1.35 released with scheduler changes', u: 'https://x.dev/k8s', d: 'container orchestration' },
    ])
    const { db, deps } = montar({ 'https://f/1': { body } }, [fonte('s1', 'https://f/1')])

    await runIngest(deps)
    const segunda = await runIngest(deps)
    expect(segunda.itensNovos).toBe(0)
    expect(db.all('SELECT id FROM articles')).toHaveLength(1)
    db.close()
  })

  it('agrupa artigos duplicados de fontes diferentes numa história só', async () => {
    const titulo = 'NVIDIA announces new GPU architecture for data centers'
    const { db, deps } = montar(
      {
        'https://f/1': { body: feedRss([{ t: titulo, u: 'https://a.dev/gpu', d: 'gpu memory bandwidth cuda' }]) },
        'https://f/2': { body: feedRss([{ t: titulo, u: 'https://b.dev/gpu', d: 'gpu memory bandwidth cuda' }]) },
      },
      [fonte('s1', 'https://f/1'), fonte('s2', 'https://f/2')],
    )

    const r = await runIngest(deps)
    expect(r.itensNovos).toBe(2)
    expect(r.historiasCriadas).toBe(1)
    expect(db.all('SELECT id FROM stories')).toHaveLength(1)
    db.close()
  })

  it('uma fonte quebrada não impede as outras de serem ingeridas', async () => {
    const { db, deps } = montar(
      {
        'https://f/1': { body: '<<< xml quebrado' },
        'https://f/2': { body: feedRss([
          { t: 'Go 1.26 released with faster garbage collector', u: 'https://b.dev/go', d: 'golang runtime compiler' },
        ]) },
      },
      [fonte('s1', 'https://f/1'), fonte('s2', 'https://f/2')],
    )

    const r = await runIngest(deps)
    expect(r.itensNovos).toBe(1)
    db.close()
  })

  it('erro de rede numa fonte é contado, não propagado', async () => {
    const { db, deps } = montar(
      { 'https://f/2': { body: feedRss([
        { t: 'Python 3.15 released with free-threading', u: 'https://b.dev/py', d: 'cpython interpreter gil' },
      ]) } },
      [fonte('s1', 'https://f/INEXISTENTE'), fonte('s2', 'https://f/2')],
    )

    const r = await runIngest(deps)
    expect(r.fontesComErro).toBe(1)
    expect(r.itensNovos).toBe(1)
    db.close()
  })

  it('respeita 304 Not Modified sem criar artigos', async () => {
    const { db, deps } = montar(
      { 'https://f/1': { body: '', status: 304 } },
      [fonte('s1', 'https://f/1')],
    )

    const r = await runIngest(deps)
    expect(r.itensNovos).toBe(0)
    expect(r.fontesComErro).toBe(0)
    db.close()
  })

  it('indexa o artigo na busca FTS', async () => {
    const { db, deps } = montar(
      { 'https://f/1': { body: feedRss([
        { t: 'Rust 1.90 released with borrow checker fixes', u: 'https://x.dev/rust', d: 'compiler improvements' },
      ]) } },
      [fonte('s1', 'https://f/1')],
    )

    await runIngest(deps)
    const search = new SearchRepo(db)
    expect(search.query('borrow', 10)).toHaveLength(1)
    db.close()
  })

  it('grava as tags derivadas da taxonomia', async () => {
    const { db, deps } = montar(
      { 'https://f/1': { body: feedRss([
        { t: 'Rust 1.90 released with borrow checker fixes', u: 'https://x.dev/rust', d: 'compiler and cargo' },
      ]) } },
      [fonte('s1', 'https://f/1')],
    )

    await runIngest(deps)
    const slugs = db.all<{ slug: string }>('SELECT slug FROM tags').map((r) => r.slug)
    expect(slugs).toContain('rust')
    db.close()
  })

  it('marca o artigo como classificado após o passe heurístico', async () => {
    const { db, deps } = montar(
      { 'https://f/1': { body: feedRss([
        { t: 'Docker improves layer build cache performance', u: 'https://x.dev/d', d: 'container image build' },
      ]) } },
      [fonte('s1', 'https://f/1')],
    )

    await runIngest(deps)
    const estados = db.all<{ ai_state: string }>('SELECT ai_state FROM articles')
    expect(estados[0]!.ai_state).toBe('classified')
    db.close()
  })

  it('sem fontes ativas devolve relatório zerado sem lançar', async () => {
    const { db, deps } = montar({}, [])
    const r = await runIngest(deps)
    expect(r).toEqual({
      fontesLidas: 0, fontesComErro: 0, itensVistos: 0,
      itensNovos: 0, itensFiltrados: 0, historiasCriadas: 0,
    })
    db.close()
  })

  it('o mesmo link repetido dentro da mesma rodada entra uma vez só', async () => {
    const { db, deps } = montar(
      { 'https://f/1': { body: feedRss([
        { t: 'Rust 1.90 released with borrow checker', u: 'https://x.dev/r', d: 'compiler cargo' },
        { t: 'Rust 1.90 released with borrow checker', u: 'https://x.dev/r', d: 'compiler cargo' },
      ]) } },
      [fonte('s1', 'https://f/1')],
    )

    const r = await runIngest(deps)
    expect(r.itensNovos).toBe(1)
    db.close()
  })
})
