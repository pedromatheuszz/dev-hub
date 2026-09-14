import type { Article, Source, Story } from '@devhub/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { NodeSqliteDriver } from '../drivers/node-sqlite.js'
import { migrate } from '../migrate.js'
import { ArticlesRepo } from './articles.js'
import { SearchRepo } from './search.js'
import { SourcesRepo } from './sources.js'
import { StoriesRepo } from './stories.js'
import { TagsRepo } from './tags.js'

let db: NodeSqliteDriver
let sources: SourcesRepo
let articles: ArticlesRepo
let stories: StoriesRepo
let tags: TagsRepo
let search: SearchRepo

const FONTE: Source = {
  id: 's1', name: 'Exemplo', url: 'https://a.dev', feedUrl: 'https://a.dev/feed',
  kind: 'news', trustWeight: 0.8, categoryHint: null, active: true,
  lastFetchedAt: null, etag: null, lastModified: null,
}

function artigo(over: Partial<Article> = {}): Article {
  return {
    id: 'a1', sourceId: 's1', url: 'https://a.dev/p', canonicalUrl: 'https://a.dev/p',
    title: 'Rust 1.90 lançado', subtitle: null, author: 'Ana',
    publishedAt: 1000, fetchedAt: 2000, excerpt: 'resumo',
    contentText: 'borrow checker mais rápido', contentHtml: null, imageUrl: null,
    lang: 'en', simhash: '00ff00ff00ff00ff', wordCount: 4, readingMinutes: 1,
    storyId: null, contentType: 'announcement', aiState: 'pending',
    ...over,
  }
}

beforeEach(() => {
  db = new NodeSqliteDriver(':memory:')
  migrate(db)
  sources = new SourcesRepo(db)
  articles = new ArticlesRepo(db)
  stories = new StoriesRepo(db)
  tags = new TagsRepo(db)
  search = new SearchRepo(db)
  sources.upsert(FONTE)
})

describe('SourcesRepo', () => {
  it('insere e lista fontes ativas', () => {
    expect(sources.listActive().map((s) => s.id)).toEqual(['s1'])
  })

  it('upsert atualiza em vez de duplicar', () => {
    sources.upsert({ ...FONTE, name: 'Renomeada' })
    const lista = sources.listActive()
    expect(lista).toHaveLength(1)
    expect(lista[0]!.name).toBe('Renomeada')
  })

  it('markFetched grava etag e last-modified', () => {
    sources.markFetched('s1', 9999, 'W/"abc"', 'Mon, 08 Sep 2026 00:00:00 GMT')
    const s = sources.listActive()[0]!
    expect(s.lastFetchedAt).toBe(9999)
    expect(s.etag).toBe('W/"abc"')
  })

  it('deactivate tira a fonte da listagem ativa', () => {
    sources.deactivate('s1')
    expect(sources.listActive()).toEqual([])
  })

  it('converte active 0/1 do SQLite para boolean', () => {
    expect(typeof sources.listActive()[0]!.active).toBe('boolean')
  })
})

describe('ArticlesRepo', () => {
  it('insere e recupera por id', () => {
    articles.upsert(artigo())
    expect(articles.byId('a1')!.title).toBe('Rust 1.90 lançado')
  })

  it('upsert do mesmo artigo não duplica', () => {
    articles.upsert(artigo())
    articles.upsert(artigo({ title: 'Título corrigido' }))
    expect(articles.byId('a1')!.title).toBe('Título corrigido')
    expect(db.all('SELECT id FROM articles')).toHaveLength(1)
  })

  it('detecta URL canônica já ingerida', () => {
    expect(articles.existsByCanonicalUrl('https://a.dev/p')).toBe(false)
    articles.upsert(artigo())
    expect(articles.existsByCanonicalUrl('https://a.dev/p')).toBe(true)
  })

  it('pendingAi devolve só os pendentes, respeitando o limite', () => {
    articles.upsert(artigo({ id: 'a1', canonicalUrl: 'https://a.dev/1', aiState: 'pending' }))
    articles.upsert(artigo({ id: 'a2', canonicalUrl: 'https://a.dev/2', aiState: 'classified' }))
    articles.upsert(artigo({ id: 'a3', canonicalUrl: 'https://a.dev/3', aiState: 'pending' }))
    expect(articles.pendingAi(10).map((a) => a.id).sort()).toEqual(['a1', 'a3'])
    expect(articles.pendingAi(1)).toHaveLength(1)
  })

  it('setAiState atualiza o estado', () => {
    articles.upsert(artigo())
    articles.setAiState('a1', 'classified')
    expect(articles.byId('a1')!.aiState).toBe('classified')
  })

  it('byId devolve undefined para id inexistente', () => {
    expect(articles.byId('nao-existe')).toBeUndefined()
  })
})

describe('StoriesRepo', () => {
  const historia: Story = {
    id: 'st1', canonicalTitle: 'Rust 1.90', canonicalSummary: null,
    category: 'programming', importance: 0.9, isBreaking: false,
    firstSeenAt: 1000, lastUpdatedAt: 1000, articleCount: 1,
  }

  it('insere história e vincula artigo', () => {
    articles.upsert(artigo())
    stories.upsert(historia)
    stories.linkArticle('st1', 'a1', true)
    articles.setStory('a1', 'st1')
    expect(articles.byId('a1')!.storyId).toBe('st1')
  })

  it('topRanked ordena por score decrescente', () => {
    articles.upsert(artigo({ id: 'a1', canonicalUrl: 'https://a.dev/1' }))
    articles.upsert(artigo({ id: 'a2', canonicalUrl: 'https://a.dev/2' }))
    stories.upsert({ ...historia, id: 'st1', importance: 0.9, lastUpdatedAt: 5000 })
    stories.upsert({ ...historia, id: 'st2', importance: 0.2, lastUpdatedAt: 5000 })
    stories.linkArticle('st1', 'a1', true)
    stories.linkArticle('st2', 'a2', true)

    const top = stories.topRanked(10, null, 10_000)
    expect(top[0]!.story.importance).toBeGreaterThan(top[1]!.story.importance)
  })

  it('topRanked filtra por categoria', () => {
    articles.upsert(artigo())
    stories.upsert({ ...historia, category: 'programming' })
    stories.linkArticle('st1', 'a1', true)
    expect(stories.topRanked(10, 'technology', 10_000)).toEqual([])
    expect(stories.topRanked(10, 'programming', 10_000)).toHaveLength(1)
  })

  it('converte is_breaking 0/1 para boolean', () => {
    articles.upsert(artigo())
    stories.upsert({ ...historia, isBreaking: true })
    stories.linkArticle('st1', 'a1', true)
    expect(stories.topRanked(10, null, 10_000)[0]!.story.isBreaking).toBe(true)
  })

  it('topRanked devolve a decomposição do score junto', () => {
    articles.upsert(artigo())
    stories.upsert(historia)
    stories.linkArticle('st1', 'a1', true)
    const b = stories.topRanked(10, null, 10_000)[0]!.breakdown
    expect(b.trust).toBe(0.8) // veio do trust_weight da fonte
    expect(b.importance).toBe(0.9)
  })
})

describe('TagsRepo', () => {
  it('ensure cria a tag uma vez e devolve o mesmo id', () => {
    const a = tags.ensure('rust', 'Rust', 'language')
    const b = tags.ensure('rust', 'Rust', 'language')
    expect(a).toBe(b)
    expect(db.all('SELECT id FROM tags')).toHaveLength(1)
  })

  it('attach vincula tag ao artigo e tagsFor devolve os slugs', () => {
    articles.upsert(artigo())
    const id = tags.ensure('rust', 'Rust', 'language')
    tags.attach('a1', id, 0.9, 'rule')
    expect(tags.tagsFor('a1')).toEqual(['rust'])
  })

  it('attach duas vezes não duplica o vínculo', () => {
    articles.upsert(artigo())
    const id = tags.ensure('rust', 'Rust', 'language')
    tags.attach('a1', id, 0.9, 'rule')
    tags.attach('a1', id, 0.5, 'rule')
    expect(tags.tagsFor('a1')).toEqual(['rust'])
  })
})

describe('SearchRepo', () => {
  beforeEach(() => {
    articles.upsert(artigo())
    search.index({
      id: 'a1', title: 'Rust 1.90 lançado',
      excerpt: 'melhorias no compilador',
      contentText: 'o borrow checker ficou mais rápido',
      tags: ['rust', 'programming'],
    })
  })

  it('encontra por termo do corpo', () => {
    expect(search.query('borrow', 10)).toEqual(['a1'])
  })

  it('encontra por tag', () => {
    expect(search.query('rust', 10)).toEqual(['a1'])
  })

  it('não encontra termo ausente', () => {
    expect(search.query('kubernetes', 10)).toEqual([])
  })

  it('reindexar não duplica o resultado', () => {
    search.index({
      id: 'a1', title: 'Rust 1.90 lançado', excerpt: 'outro',
      contentText: 'o borrow checker ficou mais rápido', tags: ['rust'],
    })
    expect(search.query('borrow', 10)).toEqual(['a1'])
  })

  it('consulta vazia devolve lista vazia sem lançar', () => {
    expect(search.query('   ', 10)).toEqual([])
  })

  it('não lança com sintaxe FTS inválida do usuário', () => {
    expect(() => search.query('"aspas sem fechar AND (', 10)).not.toThrow()
  })
})
