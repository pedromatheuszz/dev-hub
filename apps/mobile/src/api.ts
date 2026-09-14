import {
  CHAVE_SECRETA_GEMINI, SOURCES, montarProvider, runIngest,
  type Article, type Category,
} from '@devhub/core'
import {
  ArticlesRepo, FollowsRepo, SearchRepo, SourcesRepo, StoriesRepo, TagsRepo,
  UsageRepo, historico, migrate, tagsMaisUsadas,
} from '@devhub/db'
import { ExpoSqliteDriver } from '@devhub/db/expo'
import type { DevHubApi, FeedItem, SourceInfo } from '@devhub/state'
import { mobilePlatform } from './platform.js'

/**
 * No Android não há processo separado: o mesmo núcleo que roda no processo
 * main do Electron roda aqui dentro do app. Por isso o DevHubApi é
 * implementado por chamada direta, sem IPC.
 */
const driver = new ExpoSqliteDriver('devhub.db')
migrate(driver)

const sources = new SourcesRepo(driver)
for (const s of SOURCES) sources.upsert(s)

const articles = new ArticlesRepo(driver)
const stories = new StoriesRepo(driver)
const tags = new TagsRepo(driver)
const search = new SearchRepo(driver)
const follows = new FollowsRepo(driver)
const usage = new UsageRepo(driver)

const CHAVE_MODELO = 'ai_model'

function lerConfig(k: string): string | null {
  return driver.get<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?', [k],
  )?.value ?? null
}

function gravarConfig(k: string, v: string): void {
  driver.run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [k, v],
  )
}

/** Mesma fábrica do desktop: Gemini com chave, heurística sem. */
async function providerAtual() {
  const agora = Date.now()
  const model = lerConfig(CHAVE_MODELO) ?? ''
  return montarProvider(
    mobilePlatform,
    { model },
    { dia: new Date(agora).toISOString().slice(0, 10), requisicoesHoje: usage.requisicoesHoje(agora) },
    (uso) => usage.registrar('gemini', model || '?', uso, Date.now()),
  )
}

function idsSalvos(): Set<string> {
  return new Set(
    driver.all<{ article_id: string }>('SELECT article_id FROM saved_articles')
      .map((r) => r.article_id),
  )
}

function itemDoArtigo(article: Article, salvo: boolean): FeedItem {
  const h = article.storyId
    ? driver.get<{
      id: string; canonical_title: string; canonical_summary: string | null
      category: string; importance: number; is_breaking: number
      first_seen_at: number; last_updated_at: number; article_count: number
    }>('SELECT * FROM stories WHERE id = ?', [article.storyId])
    : undefined

  return {
    story: h
      ? {
        id: h.id,
        canonicalTitle: h.canonical_title,
        canonicalSummary: h.canonical_summary,
        category: h.category as Category,
        importance: h.importance,
        isBreaking: h.is_breaking === 1,
        firstSeenAt: h.first_seen_at,
        lastUpdatedAt: h.last_updated_at,
        articleCount: h.article_count,
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
    tags: tags.tagsFor(article.id),
    breakdown: {
      freshness: 0, trust: 0, importance: 0, affinity: 1, dedupPenalty: 1, total: 0,
    },
    saved: salvo,
  }
}

export const mobileApi: DevHubApi = {
  async feed(category, limit) {
    const salvos = idsSalvos()
    return stories.topRanked(limit, category, Date.now())
      .map((r) => {
        const a = articles.byId(r.primaryArticleId)
        if (!a) return null
        return {
          story: r.story,
          article: a,
          tags: tags.tagsFor(a.id),
          breakdown: r.breakdown,
          saved: salvos.has(a.id),
        }
      })
      .filter((x): x is FeedItem => x !== null)
  },

  async saved(limit) {
    return driver
      .all<{ article_id: string }>(
        'SELECT article_id FROM saved_articles ORDER BY saved_at DESC LIMIT ?',
        [limit],
      )
      .map((r) => articles.byId(r.article_id))
      .filter((a): a is Article => a !== undefined)
      .map((a) => itemDoArtigo(a, true))
  },

  async search(query, limit) {
    const salvos = idsSalvos()
    return search.query(query, limit)
      .map((id) => articles.byId(id))
      .filter((a): a is Article => a !== undefined)
      .map((a) => itemDoArtigo(a, salvos.has(a.id)))
  },

  async article(id) {
    const a = articles.byId(id)
    return a ? { article: a, tags: tags.tagsFor(a.id) } : null
  },

  async toggleSaved(articleId) {
    const existe = driver.get(
      'SELECT 1 AS x FROM saved_articles WHERE article_id = ?', [articleId],
    )
    if (existe) {
      driver.run('DELETE FROM saved_articles WHERE article_id = ?', [articleId])
      return false
    }
    driver.run(
      'INSERT INTO saved_articles (article_id, saved_at) VALUES (?, ?)',
      [articleId, Date.now()],
    )
    return true
  },

  async recordRead(articleId) {
    driver.run(
      'INSERT INTO reading_history (article_id, opened_at) VALUES (?, ?)',
      [articleId, Date.now()],
    )
  },

  async ingest() {
    const { provider } = await providerAtual()
    return runIngest({
      platform: mobilePlatform,
      sources, articles, stories, tags, search,
      ai: provider,
    })
  },

  async aiState() {
    const agora = Date.now()
    const { governador, motivoHeuristica } = await providerAtual()
    const uso = usage.doDia(agora)
    return {
      temChave: (await mobilePlatform.secrets.get(CHAVE_SECRETA_GEMINI)) !== null,
      provider: motivoHeuristica === null ? ('gemini' as const) : ('heuristic' as const),
      model: lerConfig(CHAVE_MODELO) ?? '',
      motivoHeuristica,
      requisicoesHoje: usage.requisicoesHoje(agora),
      tetoDiario: governador?.tetoDiario ?? 0,
      tokensHoje: uso.reduce((s, u) => s + u.tokensEntrada + u.tokensSaida, 0),
    }
  },

  async aiModels() {
    const { provider, motivoHeuristica } = await providerAtual()
    if (motivoHeuristica === 'sem_chave') return []
    return provider.listModels()
  },

  async setApiKey(chave) {
    if (chave.trim().length === 0) {
      await mobilePlatform.secrets.delete(CHAVE_SECRETA_GEMINI)
      return
    }
    await mobilePlatform.secrets.set(CHAVE_SECRETA_GEMINI, chave.trim())
  },

  async setAiModel(model) {
    gravarConfig(CHAVE_MODELO, model)
  },

  async suggestedTags(limit) {
    return tagsMaisUsadas(driver, limit)
  },

  async toggleFollow(kind, targetId) {
    return follows.toggle(kind, targetId, 1, Date.now())
  },

  async history(limit) {
    const salvos = idsSalvos()
    return historico(driver, limit)
      .map((h) => articles.byId(h.articleId))
      .filter((a): a is Article => a !== undefined)
      .map((a) => itemDoArtigo(a, salvos.has(a.id)))
  },

  async sources(): Promise<SourceInfo[]> {
    return sources.listActive().map((s) => ({
      id: s.id, name: s.name, kind: s.kind,
      trustWeight: s.trustWeight, lastFetchedAt: s.lastFetchedAt, active: s.active,
    }))
  },

  async getSetting(key) {
    return driver.get<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?', [key],
    )?.value ?? null
  },

  async setSetting(key, value) {
    driver.run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    )
  },

  async openExternal(url) {
    const { openBrowserAsync } = await import('expo-web-browser')
    await openBrowserAsync(url)
  },
}

export function tempoRelativo(ts: number, agora = Date.now()): string {
  const min = Math.floor((agora - ts) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function hostDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

const ROTULO_CATEGORIA: Record<string, string> = {
  technology: 'Tecnologia', programming: 'Programação', innovation: 'Inovação',
}
export const rotuloCategoria = (c: string) => ROTULO_CATEGORIA[c] ?? c

const ROTULO_TIPO: Record<string, string> = {
  news: 'Notícia', announcement: 'Anúncio oficial', report: 'Reportagem',
  rumor: 'Rumor', opinion: 'Opinião', analysis: 'Análise',
}
export const rotuloTipo = (t: string) => ROTULO_TIPO[t] ?? t
