import {
  CHAVE_SECRETA_GEMINI, PREFERENCIAS_PADRAO, SOURCES, montarProvider, runIngest,
  type Article, type Category, type PreferenciasNotificacao, type Story,
} from '@devhub/core'
import {
  ArticlesRepo, FollowsRepo, SearchRepo, SourcesRepo, StoriesRepo, TagsRepo,
  TranslationsRepo, UsageRepo, historico, migrate, tagsMaisUsadas,
} from '@devhub/db'
import { ExpoSqliteDriver } from '@devhub/db/expo'
import type { DevHubApi, FeedItem, SourceInfo } from '@devhub/state'
import { dispararNotificacoes, estadoVazio, type EstadoNotifMobile } from './notify.js'
import { mobilePlatform } from './platform.js'
import {
  cancelarTarefaDeFundo, msAteProximaJanela, registrarTarefaDeFundo, verificarAoAbrir,
} from './scheduler.js'

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
const translations = new TranslationsRepo(driver)

const CHAVE_MODELO = 'ai_model'
const CHAVE_NOTIF_PREFS = 'notificacoes'
const CHAVE_NOTIF_ESTADO = 'notif_estado'
const CHAVE_ULTIMA_INGESTAO = 'ultima_ingestao'
const CHAVE_AUTO = 'ingestao_automatica'

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
  const trad = translations.get(article.id, 'pt')
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
    ...(trad ? {
      traducao: {
        title: trad.title, excerpt: trad.excerpt,
        sourceLang: trad.sourceLang, model: trad.model,
      },
    } : {}),
  }
}

export const mobileApi: DevHubApi = {
  async feed(category, limit) {
    const salvos = idsSalvos()
    const ranqueadas = stories.topRanked(limit, category, Date.now())
    const trads = translations.paraArtigos(
      ranqueadas.map((r) => r.primaryArticleId), 'pt',
    )
    return ranqueadas
      .map((r) => {
        const a = articles.byId(r.primaryArticleId)
        if (!a) return null
        const t = trads.get(a.id)
        return {
          story: r.story,
          article: a,
          tags: tags.tagsFor(a.id),
          breakdown: r.breakdown,
          saved: salvos.has(a.id),
          ...(t ? {
            traducao: {
              title: t.title, excerpt: t.excerpt,
              sourceLang: t.sourceLang, model: t.model,
            },
          } : {}),
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
    if (!a) return null
    const t = translations.get(a.id, 'pt')
    return {
      article: a,
      tags: tags.tagsFor(a.id),
      ...(t ? {
        traducao: {
          title: t.title, excerpt: t.excerpt, sourceLang: t.sourceLang,
          model: t.model, contentText: t.contentText,
        },
      } : {}),
    }
  },

  async translateArticle(articleId) {
    const a = articles.byId(articleId)
    if (!a || a.lang === 'pt' || a.lang === 'desconhecido') return false
    if (translations.temCorpo(articleId, 'pt')) return true

    const { provider } = await providerAtual()
    const t = await provider.translate({
      id: a.id, title: a.title, excerpt: a.excerpt, contentText: a.contentText,
      sourceTrust: 1, categoryHint: null, lang: a.lang,
    })
    if (!t) return false

    translations.upsert({
      articleId, targetLang: 'pt', sourceLang: a.lang,
      title: t.title, excerpt: t.excerpt, contentText: t.contentText,
      provider: t.provider, model: t.model, translatedAt: Date.now(),
    })
    return true
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
    const relatorio = await runIngest({
      platform: mobilePlatform,
      sources, articles, stories, tags, search, translations,
      ai: provider,
    })
    gravarConfig(CHAVE_ULTIMA_INGESTAO, String(Date.now()))
    await notificar(relatorio.idsNovos)
    return relatorio
  },

  async scheduleStatus() {
    const bruto = lerConfig(CHAVE_ULTIMA_INGESTAO)
    const n = bruto ? Number(bruto) : NaN
    return {
      automatica: lerConfig(CHAVE_AUTO) !== 'off',
      ultimaIngestao: Number.isFinite(n) ? n : null,
      proximaEm: msAteProximaJanela(Date.now()),
      horaDaJanela: 5,
    }
  },

  async setAutoIngest(ligada) {
    gravarConfig(CHAVE_AUTO, ligada ? 'on' : 'off')
    if (ligada) {
      await registrarTarefaDeFundo(
        async () => mobileApi.ingest(),
        () => {
          const b = lerConfig(CHAVE_ULTIMA_INGESTAO)
          const v = b ? Number(b) : NaN
          return Number.isFinite(v) ? v : null
        },
      )
    } else {
      await cancelarTarefaDeFundo()
    }
  },

  async notifPrefs() {
    const bruto = lerConfig(CHAVE_NOTIF_PREFS)
    if (!bruto) return PREFERENCIAS_PADRAO
    try {
      return { ...PREFERENCIAS_PADRAO, ...JSON.parse(bruto) as Partial<PreferenciasNotificacao> }
    } catch {
      return PREFERENCIAS_PADRAO
    }
  },

  async setNotifPrefs(p) {
    const atual = await mobileApi.notifPrefs()
    gravarConfig(CHAVE_NOTIF_PREFS, JSON.stringify({ ...atual, ...p }))
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
      aTraduzir: translations.pendentes('pt', 100_000).length,
      traduzidos: translations.contar('pt'),
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

/**
 * Liga a ingestão automática: registra a tarefa de fundo e verifica na hora
 * se a janela das 5h passou sem ela rodar.
 */
export async function iniciarAgendamento(): Promise<boolean> {
  const lerUltima = () => {
    const b = lerConfig(CHAVE_ULTIMA_INGESTAO)
    const v = b ? Number(b) : NaN
    return Number.isFinite(v) ? v : null
  }

  if (lerConfig(CHAVE_AUTO) === 'off') return false

  await registrarTarefaDeFundo(async () => mobileApi.ingest(), lerUltima)
  return verificarAoAbrir(async () => mobileApi.ingest(), lerUltima())
}

/** Dispara as notificações locais depois de uma ingestão. */
async function notificar(idsNovos: string[]): Promise<void> {
  if (idsNovos.length === 0) return

  const agora = Date.now()
  const prefs = await mobileApi.notifPrefs()

  const seguidas = new Set(
    driver.all<{ target_id: string }>(
      "SELECT target_id FROM follows WHERE target_kind = 'tag'",
    ).map((r) => r.target_id),
  )

  const candidatas: Array<{ story: Story; articleId: string; tagsSeguidas: string[] }> = []
  for (const id of idsNovos) {
    const a = articles.byId(id)
    if (!a?.storyId) continue
    const item = itemDoArtigo(a, false)
    candidatas.push({
      story: item.story,
      articleId: id,
      tagsSeguidas: tags.tagsFor(id).filter((t) => seguidas.has(t)),
    })
  }

  let anterior: EstadoNotifMobile = estadoVazio(agora)
  const bruto = lerConfig(CHAVE_NOTIF_ESTADO)
  if (bruto) {
    try { anterior = JSON.parse(bruto) as EstadoNotifMobile } catch { /* usa o vazio */ }
  }

  const { enviadas, estado } = await dispararNotificacoes(candidatas, prefs, anterior, agora)
  if (enviadas > 0) gravarConfig(CHAVE_NOTIF_ESTADO, JSON.stringify(estado))
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
