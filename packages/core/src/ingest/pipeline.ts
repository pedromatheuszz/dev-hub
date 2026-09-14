import type { AIProvider, ArticleForAI, Classification } from '../ai/provider.js'
import { clusterArticles, type ClusterInput } from '../dedup/cluster.js'
import { simhash } from '../dedup/simhash.js'
import { parseFeed } from '../feeds/index.js'
import { isRelevant } from '../filter/prefilter.js'
import { normalizeItem } from '../normalize/article.js'
import type { Platform } from '../platform.js'
import { isBreaking } from '../rank/breaking.js'
import { TAG_DICTIONARY } from '../taxonomy/dictionary.js'
import type { Article, ArticleTag, Source, Story, TagKind } from '../types.js'

/**
 * Portas de persistência de que o pipeline precisa.
 *
 * Declaradas aqui como interfaces estruturais em vez de importadas de
 * @devhub/db: o core não pode depender de nenhum outro pacote, senão a
 * regra de dependência cai e ele deixa de rodar no React Native. Os
 * repositórios reais satisfazem estas formas sem saber que elas existem.
 */
export interface SourcesPort {
  listActive(): Source[]
  markFetched(
    id: string, at: number, etag: string | null, lastModified: string | null,
  ): void
}

export interface ArticlesPort {
  upsert(a: Article): void
  existsByCanonicalUrl(url: string): boolean
  setStory(articleId: string, storyId: string): void
}

export interface StoriesPort {
  upsert(s: Story): void
  linkArticle(storyId: string, articleId: string, isPrimary: boolean): void
}

export interface TagsPort {
  ensure(slug: string, name: string, kind: TagKind): string
  attach(
    articleId: string, tagId: string, confidence: number, source: ArticleTag['source'],
  ): void
}

export interface SearchPort {
  index(a: {
    id: string; title: string; excerpt: string; contentText: string; tags: string[]
  }): void
}

export interface IngestDeps {
  platform: Platform
  sources: SourcesPort
  articles: ArticlesPort
  stories: StoriesPort
  tags: TagsPort
  search: SearchPort
  ai: AIProvider
}

export interface IngestReport {
  fontesLidas: number
  fontesComErro: number
  itensVistos: number
  itensNovos: number
  itensFiltrados: number
  historiasCriadas: number
  /** Ids dos artigos criados nesta rodada — as notificações consomem isto. */
  idsNovos: string[]
}

const POR_SLUG = new Map(TAG_DICTIONARY.map((t) => [t.slug, t]))
const TRUST_CONFIAVEL = 0.8
const LOTE_IA = 12

/**
 * Executa o pipeline do spec §4 de ponta a ponta. Cada fonte é isolada:
 * uma exceção em qualquer etapa dela é contada e a ingestão segue nas
 * demais (constraint global do plano).
 */
export async function runIngest(deps: IngestDeps): Promise<IngestReport> {
  const { platform, sources, articles, stories, tags, search, ai } = deps
  const agora = platform.clock.now()

  const rel: IngestReport = {
    fontesLidas: 0, fontesComErro: 0, itensVistos: 0,
    itensNovos: 0, itensFiltrados: 0, historiasCriadas: 0, idsNovos: [],
  }

  const ativas = sources.listActive()
  const porFonte = new Map(ativas.map((s) => [s.id, s]))
  const novos: Article[] = []
  const jaVistosNestaRodada = new Set<string>()

  // ---- Etapas 1 a 6: buscar, parsear, normalizar, filtrar, fingerprint ----
  for (const fonte of ativas) {
    try {
      const res = await platform.http.get({
        url: fonte.feedUrl,
        etag: fonte.etag,
        lastModified: fonte.lastModified,
        timeoutMs: 20_000,
      })

      rel.fontesLidas++
      sources.markFetched(
        fonte.id,
        agora,
        res.headers['etag'] ?? fonte.etag,
        res.headers['last-modified'] ?? fonte.lastModified,
      )

      if (res.status === 304) continue // nada mudou: custo zero
      if (res.status >= 400) {
        rel.fontesComErro++
        continue
      }

      for (const item of parseFeed(res.body)) {
        rel.itensVistos++

        const base = normalizeItem(item, fonte, agora)
        if (jaVistosNestaRodada.has(base.canonicalUrl)) continue
        if (articles.existsByCanonicalUrl(base.canonicalUrl)) continue
        jaVistosNestaRodada.add(base.canonicalUrl)

        // Mecanismo 3 de proteção de cota: cortar antes de gastar IA.
        if (!isRelevant(base.title, base.contentText || base.excerpt)) {
          rel.itensFiltrados++
          continue
        }

        novos.push({
          ...base,
          simhash: simhash(`${base.title} ${base.contentText.slice(0, 500)}`),
          storyId: null,
          contentType: 'news', // definido pela classificação abaixo
          aiState: 'pending',
        })
      }
    } catch (e) {
      rel.fontesComErro++
      platform.logger.warn(`falha na fonte ${fonte.id}`, e)
    }
  }

  if (novos.length === 0) return rel

  // Persiste antes de classificar: se a IA falhar, os artigos ficam
  // gravados como 'pending' e são reprocessados na próxima rodada.
  for (const a of novos) articles.upsert(a)
  rel.itensNovos = novos.length
  rel.idsNovos = novos.map((a) => a.id)

  // ---- Etapa 7: classificação em lote ----
  const classificacoes = new Map<string, Classification>()

  for (let i = 0; i < novos.length; i += LOTE_IA) {
    const lote: ArticleForAI[] = novos.slice(i, i + LOTE_IA).map((a) => {
      const f = porFonte.get(a.sourceId)
      return {
        id: a.id,
        title: a.title,
        excerpt: a.excerpt,
        contentText: a.contentText,
        sourceTrust: f?.trustWeight ?? 0.5,
        categoryHint: f?.categoryHint ?? null,
      }
    })

    try {
      for (const c of await ai.classifyBatch(lote)) classificacoes.set(c.articleId, c)
    } catch (e) {
      platform.logger.warn('lote de classificação falhou; artigos seguem pendentes', e)
    }
  }

  for (const a of novos) {
    const c = classificacoes.get(a.id)
    if (!c) continue

    articles.upsert({ ...a, contentType: c.contentType, aiState: 'classified' })

    for (const t of c.tags) {
      const def = POR_SLUG.get(t.slug)
      if (!def) continue
      tags.attach(a.id, tags.ensure(def.slug, def.name, def.kind), t.confidence, 'rule')
    }

    search.index({
      id: a.id,
      title: a.title,
      excerpt: a.excerpt,
      contentText: a.contentText,
      tags: c.tags.map((t) => t.slug),
    })
  }

  // ---- Etapas 8 e 9: agrupar em histórias, pontuar, marcar breaking ----
  const entradas: ClusterInput[] = novos.map((a) => ({
    id: a.id, title: a.title, simhash: a.simhash, publishedAt: a.publishedAt,
  }))
  const porId = new Map(novos.map((a) => [a.id, a]))

  for (const cluster of clusterArticles(entradas)) {
    const primario = porId.get(cluster.primaryId)!
    const membros = cluster.members.map((id) => porId.get(id)!)
    const cPrimario = classificacoes.get(primario.id)

    const datas = membros.map((m) => m.publishedAt)
    const importancia = cPrimario?.importance ?? 0.5
    const confiavel = membros.some((m) => {
      const f = porFonte.get(m.sourceId)
      return f !== undefined && (f.kind === 'official' || f.trustWeight >= TRUST_CONFIAVEL)
    })

    const historia: Story = {
      id: `st_${primario.id}`,
      canonicalTitle: primario.title,
      canonicalSummary: primario.excerpt || null,
      category: cPrimario?.category ?? 'technology',
      importance: importancia,
      isBreaking: isBreaking({
        importance: importancia,
        articleCount: membros.length,
        firstSeenAt: Math.min(...datas),
        lastArticleAt: Math.max(...datas),
        hasTrustedSource: confiavel,
      }),
      firstSeenAt: Math.min(...datas),
      lastUpdatedAt: agora,
      articleCount: membros.length,
    }

    stories.upsert(historia)
    for (const m of membros) {
      stories.linkArticle(historia.id, m.id, m.id === primario.id)
      articles.setStory(m.id, historia.id)
    }
    rel.historiasCriadas++
  }

  return rel
}
