import type { Article, Category } from '@devhub/core'
import { historico, tagsMaisUsadas, type FollowKind } from '@devhub/db'
import type { FeedItem, SourceInfo, TagSugerida } from '@devhub/state'
import type { Contexto } from './db.js'

/**
 * Monta os FeedItem completos que a interface consome. Fica no processo
 * main porque é aqui que o SQLite vive; o renderer só recebe JSON.
 */
export function montarFeed(
  ctx: Contexto,
  category: Category | null,
  limit: number,
): FeedItem[] {
  const agora = Date.now()
  const salvos = idsSalvos(ctx)

  return ctx.stories
    .topRanked(limit, category, agora)
    .map((r) => {
      const article = ctx.articles.byId(r.primaryArticleId)
      if (!article) return null
      return {
        story: r.story,
        article,
        tags: ctx.tags.tagsFor(article.id),
        breakdown: r.breakdown,
        saved: salvos.has(article.id),
      }
    })
    .filter((x): x is FeedItem => x !== null)
}

function idsSalvos(ctx: Contexto): Set<string> {
  return new Set(
    ctx.driver
      .all<{ article_id: string }>('SELECT article_id FROM saved_articles')
      .map((r) => r.article_id),
  )
}

/** Constrói um FeedItem a partir de um artigo avulso (busca e salvos). */
function itemDoArtigo(ctx: Contexto, article: Article, salvo: boolean): FeedItem {
  const historia = article.storyId
    ? ctx.driver.get<{
      id: string; canonical_title: string; canonical_summary: string | null
      category: string; importance: number; is_breaking: number
      first_seen_at: number; last_updated_at: number; article_count: number
    }>('SELECT * FROM stories WHERE id = ?', [article.storyId])
    : undefined

  return {
    story: historia
      ? {
        id: historia.id,
        canonicalTitle: historia.canonical_title,
        canonicalSummary: historia.canonical_summary,
        category: historia.category as Category,
        importance: historia.importance,
        isBreaking: historia.is_breaking === 1,
        firstSeenAt: historia.first_seen_at,
        lastUpdatedAt: historia.last_updated_at,
        articleCount: historia.article_count,
      }
      : {
        id: `solo_${article.id}`,
        canonicalTitle: article.title,
        canonicalSummary: article.excerpt || null,
        category: 'technology',
        importance: 0.5,
        isBreaking: false,
        firstSeenAt: article.publishedAt,
        lastUpdatedAt: article.publishedAt,
        articleCount: 1,
      },
    article,
    tags: ctx.tags.tagsFor(article.id),
    breakdown: {
      freshness: 0, trust: 0, importance: 0, affinity: 1, dedupPenalty: 1, total: 0,
    },
    saved: salvo,
  }
}

export function buscar(ctx: Contexto, query: string, limit: number): FeedItem[] {
  const salvos = idsSalvos(ctx)
  return ctx.search
    .query(query, limit)
    .map((id) => ctx.articles.byId(id))
    .filter((a): a is Article => a !== undefined)
    .map((a) => itemDoArtigo(ctx, a, salvos.has(a.id)))
}

export function listarSalvos(ctx: Contexto, limit: number): FeedItem[] {
  return ctx.driver
    .all<{ article_id: string }>(
      'SELECT article_id FROM saved_articles ORDER BY saved_at DESC LIMIT ?',
      [limit],
    )
    .map((r) => ctx.articles.byId(r.article_id))
    .filter((a): a is Article => a !== undefined)
    .map((a) => itemDoArtigo(ctx, a, true))
}

/** Devolve o novo estado: true se passou a estar salvo. */
export function alternarSalvo(ctx: Contexto, articleId: string): boolean {
  const existe = ctx.driver.get(
    'SELECT 1 AS x FROM saved_articles WHERE article_id = ?',
    [articleId],
  )
  if (existe) {
    ctx.driver.run('DELETE FROM saved_articles WHERE article_id = ?', [articleId])
    return false
  }
  ctx.driver.run(
    'INSERT INTO saved_articles (article_id, saved_at) VALUES (?, ?)',
    [articleId, Date.now()],
  )
  return true
}

export function registrarLeitura(ctx: Contexto, articleId: string): void {
  ctx.driver.run(
    'INSERT INTO reading_history (article_id, opened_at) VALUES (?, ?)',
    [articleId, Date.now()],
  )
}

export function listarFontes(ctx: Contexto): SourceInfo[] {
  return ctx.sources.listActive().map((s) => ({
    id: s.id, name: s.name, kind: s.kind,
    trustWeight: s.trustWeight, lastFetchedAt: s.lastFetchedAt, active: s.active,
  }))
}

export function sugerirTags(ctx: Contexto, limite: number): TagSugerida[] {
  return tagsMaisUsadas(ctx.driver, limite)
}

/** Devolve o novo estado: true se passou a seguir. */
export function alternarFollow(
  ctx: Contexto, kind: FollowKind, targetId: string,
): boolean {
  return ctx.follows.toggle(kind, targetId, 1, Date.now())
}

export function lerHistorico(ctx: Contexto, limite: number): FeedItem[] {
  const salvos = idsSalvos(ctx)
  return historico(ctx.driver, limite)
    .map((h) => ctx.articles.byId(h.articleId))
    .filter((a): a is Article => a !== undefined)
    .map((a) => itemDoArtigo(ctx, a, salvos.has(a.id)))
}

export function lerConfig(ctx: Contexto, key: string): string | null {
  return ctx.driver.get<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?', [key],
  )?.value ?? null
}

export function gravarConfig(ctx: Contexto, key: string, value: string): void {
  ctx.driver.run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  )
}
