import type { Article, Source, Story } from '@devhub/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { NodeSqliteDriver } from '../drivers/node-sqlite.js'
import { migrate } from '../migrate.js'
import { ArticlesRepo } from './articles.js'
import { FollowsRepo, historico, tagsMaisUsadas } from './follows.js'
import { SourcesRepo } from './sources.js'
import { StoriesRepo } from './stories.js'
import { TagsRepo } from './tags.js'

let db: NodeSqliteDriver
let follows: FollowsRepo
let articles: ArticlesRepo
let stories: StoriesRepo
let tags: TagsRepo

const AGORA = 1_789_000_000_000

function artigo(id: string, over: Partial<Article> = {}): Article {
  return {
    id, sourceId: 's1', url: `https://a.dev/${id}`, canonicalUrl: `https://a.dev/${id}`,
    title: `Artigo ${id}`, subtitle: null, author: null,
    publishedAt: AGORA, fetchedAt: AGORA, excerpt: '', contentText: '',
    contentHtml: null, imageUrl: null, lang: 'en', simhash: '0'.repeat(16),
    wordCount: 0, readingMinutes: 1, storyId: null,
    contentType: 'news', aiState: 'classified',
    ...over,
  }
}

function historia(id: string, over: Partial<Story> = {}): Story {
  return {
    id, canonicalTitle: `Historia ${id}`, canonicalSummary: null,
    category: 'programming', importance: 0.5, isBreaking: false,
    firstSeenAt: AGORA, lastUpdatedAt: AGORA, articleCount: 1,
    ...over,
  }
}

beforeEach(() => {
  db = new NodeSqliteDriver(':memory:')
  migrate(db)
  const fonte: Source = {
    id: 's1', name: 'F', url: 'https://a.dev', feedUrl: 'https://a.dev/f',
    kind: 'news', trustWeight: 0.8, categoryHint: null, active: true,
    lastFetchedAt: null, etag: null, lastModified: null,
  }
  new SourcesRepo(db).upsert(fonte)
  follows = new FollowsRepo(db)
  articles = new ArticlesRepo(db)
  stories = new StoriesRepo(db)
  tags = new TagsRepo(db)
})

describe('FollowsRepo', () => {
  it('adiciona e lista', () => {
    follows.add('tag', 'rust', 1, AGORA)
    expect(follows.list().map((f) => f.targetId)).toEqual(['rust'])
  })

  it('seguir duas vezes não duplica', () => {
    follows.add('tag', 'rust', 1, AGORA)
    follows.add('tag', 'rust', 0.5, AGORA)
    const lista = follows.list()
    expect(lista).toHaveLength(1)
    expect(lista[0]!.weight).toBe(0.5)
  })

  it('toggle liga e desliga', () => {
    expect(follows.toggle('tag', 'rust', 1, AGORA)).toBe(true)
    expect(follows.isFollowing('tag', 'rust')).toBe(true)
    expect(follows.toggle('tag', 'rust', 1, AGORA)).toBe(false)
    expect(follows.isFollowing('tag', 'rust')).toBe(false)
  })

  it('remove o que não existe sem lançar', () => {
    expect(() => follows.remove('tag', 'inexistente')).not.toThrow()
  })

  it('separa tags de categorias', () => {
    follows.add('tag', 'rust', 1, AGORA)
    follows.add('category', 'programming', 0.8, AGORA)
    expect([...follows.pesosPorTag().keys()]).toEqual(['rust'])
    expect([...follows.pesosPorCategoria().keys()]).toEqual(['programming'])
  })

  it('rejeita peso fora de 0..1', () => {
    expect(() => follows.add('tag', 'x', 2, AGORA)).toThrow()
  })
})

describe('tagsMaisUsadas', () => {
  beforeEach(() => {
    articles.upsert(artigo('a1'))
    articles.upsert(artigo('a2'))
    const rust = tags.ensure('rust', 'Rust', 'language')
    const go = tags.ensure('go', 'Go', 'language')
    tags.attach('a1', rust, 1, 'rule')
    tags.attach('a2', rust, 1, 'rule')
    tags.attach('a1', go, 1, 'rule')
  })

  it('ordena por número de artigos', () => {
    const t = tagsMaisUsadas(db, 10)
    expect(t[0]!.slug).toBe('rust')
    expect(t[0]!.artigos).toBe(2)
    expect(t[1]!.slug).toBe('go')
  })

  it('marca quais já são seguidas', () => {
    follows.add('tag', 'go', 1, AGORA)
    const t = tagsMaisUsadas(db, 10)
    expect(t.find((x) => x.slug === 'go')!.seguindo).toBe(true)
    expect(t.find((x) => x.slug === 'rust')!.seguindo).toBe(false)
  })

  it('omite tag sem nenhum artigo', () => {
    tags.ensure('orfa', 'Órfã', 'topic')
    expect(tagsMaisUsadas(db, 10).map((t) => t.slug)).not.toContain('orfa')
  })
})

describe('afinidade no ranking', () => {
  beforeEach(() => {
    articles.upsert(artigo('a1'))
    articles.upsert(artigo('a2'))
    stories.upsert(historia('st1'))
    stories.upsert(historia('st2'))
    stories.linkArticle('st1', 'a1', true)
    stories.linkArticle('st2', 'a2', true)
    articles.setStory('a1', 'st1')
    articles.setStory('a2', 'st2')

    const rust = tags.ensure('rust', 'Rust', 'language')
    tags.attach('a1', rust, 0.9, 'rule')
  })

  it('sem follows a afinidade de todos é 1.0', () => {
    for (const r of stories.topRanked(10, null, AGORA)) {
      expect(r.breakdown.affinity).toBe(1)
    }
  })

  it('seguir uma tag eleva a afinidade só de quem a tem', () => {
    follows.add('tag', 'rust', 1, AGORA)
    const top = stories.topRanked(10, null, AGORA)
    const comTag = top.find((r) => r.primaryArticleId === 'a1')!
    const semTag = top.find((r) => r.primaryArticleId === 'a2')!
    expect(comTag.breakdown.affinity).toBeCloseTo(1.9, 5)
    expect(semTag.breakdown.affinity).toBe(1)
  })

  it('seguir uma tag muda a ordem do feed', () => {
    follows.add('tag', 'rust', 1, AGORA)
    expect(stories.topRanked(10, null, AGORA)[0]!.primaryArticleId).toBe('a1')
  })

  it('seguir a categoria eleva a afinidade de todas dela', () => {
    follows.add('category', 'programming', 1, AGORA)
    for (const r of stories.topRanked(10, null, AGORA)) {
      expect(r.breakdown.affinity).toBeGreaterThan(1)
    }
  })

  it('deixar de seguir devolve a afinidade para 1.0', () => {
    follows.add('tag', 'rust', 1, AGORA)
    follows.remove('tag', 'rust')
    for (const r of stories.topRanked(10, null, AGORA)) {
      expect(r.breakdown.affinity).toBe(1)
    }
  })
})

describe('historico', () => {
  beforeEach(() => {
    articles.upsert(artigo('a1'))
    articles.upsert(artigo('a2'))
  })

  it('devolve o mais recente primeiro', () => {
    db.run('INSERT INTO reading_history (article_id, opened_at) VALUES (?,?)', ['a1', 100])
    db.run('INSERT INTO reading_history (article_id, opened_at) VALUES (?,?)', ['a2', 200])
    expect(historico(db, 10).map((h) => h.articleId)).toEqual(['a2', 'a1'])
  })

  it('agrupa releituras do mesmo artigo numa entrada só', () => {
    db.run('INSERT INTO reading_history (article_id, opened_at) VALUES (?,?)', ['a1', 100])
    db.run('INSERT INTO reading_history (article_id, opened_at) VALUES (?,?)', ['a1', 300])
    const h = historico(db, 10)
    expect(h).toHaveLength(1)
    expect(h[0]!.openedAt).toBe(300)
  })

  it('devolve vazio sem histórico', () => {
    expect(historico(db, 10)).toEqual([])
  })
})
