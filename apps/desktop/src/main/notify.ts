import {
  PREFERENCIAS_PADRAO, selecionarNotificacoes,
  type CandidataNotificacao, type PreferenciasNotificacao,
} from '@devhub/core'
import { BrowserWindow, Notification } from 'electron'
import type { Contexto } from './db.js'
import { gravarConfig, lerConfig } from './queries.js'

const CHAVE_PREFS = 'notificacoes'
const CHAVE_ESTADO = 'notif_estado'

interface EstadoPersistido {
  dia: string
  enviadasHoje: number
  ultimaEnvioAt: number | null
  jaNotificados: string[]
}

function hoje(agora: number): string {
  return new Date(agora).toISOString().slice(0, 10)
}

export function lerPreferencias(ctx: Contexto): PreferenciasNotificacao {
  const bruto = lerConfig(ctx, CHAVE_PREFS)
  if (!bruto) return PREFERENCIAS_PADRAO
  try {
    return { ...PREFERENCIAS_PADRAO, ...JSON.parse(bruto) as Partial<PreferenciasNotificacao> }
  } catch {
    return PREFERENCIAS_PADRAO
  }
}

export function gravarPreferencias(ctx: Contexto, p: Partial<PreferenciasNotificacao>): void {
  gravarConfig(ctx, CHAVE_PREFS, JSON.stringify({ ...lerPreferencias(ctx), ...p }))
}

function lerEstado(ctx: Contexto, agora: number): EstadoPersistido {
  const vazio: EstadoPersistido = {
    dia: hoje(agora), enviadasHoje: 0, ultimaEnvioAt: null, jaNotificados: [],
  }
  const bruto = lerConfig(ctx, CHAVE_ESTADO)
  if (!bruto) return vazio
  try {
    const e = JSON.parse(bruto) as EstadoPersistido
    // Virou o dia: zera o contador mas guarda o histórico para não repetir.
    return e.dia === hoje(agora) ? e : { ...vazio, jaNotificados: e.jaNotificados.slice(-200) }
  } catch {
    return vazio
  }
}

/**
 * Dispara as notificações que as regras do núcleo aprovarem.
 *
 * As regras são puras e testadas em packages/core; aqui só ficam o acesso
 * ao banco e a API nativa do Electron. Clicar na notificação abre o artigo.
 */
export function notificarApos(ctx: Contexto, idsNovos: string[]): number {
  if (idsNovos.length === 0) return 0
  if (!Notification.isSupported()) return 0

  const agora = Date.now()
  const prefs = lerPreferencias(ctx)
  const estado = lerEstado(ctx, agora)

  const seguidas = new Set(
    ctx.driver.all<{ target_id: string }>(
      "SELECT target_id FROM follows WHERE target_kind = 'tag'",
    ).map((r) => r.target_id),
  )

  const candidatas: CandidataNotificacao[] = []
  for (const id of idsNovos) {
    const artigo = ctx.articles.byId(id)
    if (!artigo?.storyId) continue

    const linha = ctx.driver.get<{
      id: string; canonical_title: string; canonical_summary: string | null
      category: string; importance: number; is_breaking: number
      first_seen_at: number; last_updated_at: number; article_count: number
    }>('SELECT * FROM stories WHERE id = ?', [artigo.storyId])
    if (!linha) continue

    candidatas.push({
      story: {
        id: linha.id,
        canonicalTitle: linha.canonical_title,
        canonicalSummary: linha.canonical_summary,
        category: linha.category as 'technology' | 'programming' | 'innovation',
        importance: linha.importance,
        isBreaking: linha.is_breaking === 1,
        firstSeenAt: linha.first_seen_at,
        lastUpdatedAt: linha.last_updated_at,
        articleCount: linha.article_count,
      },
      articleId: id,
      tagsSeguidas: ctx.tags.tagsFor(id).filter((t) => seguidas.has(t)),
    })
  }

  const escolhidas = selecionarNotificacoes(
    candidatas, prefs,
    {
      enviadasHoje: estado.enviadasHoje,
      ultimaEnvioAt: estado.ultimaEnvioAt,
      jaNotificados: new Set(estado.jaNotificados),
    },
    agora,
  )

  for (const n of escolhidas) {
    const notif = new Notification({ title: n.titulo, body: n.corpo, silent: false })
    notif.on('click', () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (!win) return
      if (win.isMinimized()) win.restore()
      win.focus()
      void win.webContents.send('abrirArtigo', n.articleId)
    })
    notif.show()
  }

  if (escolhidas.length > 0) {
    gravarConfig(ctx, CHAVE_ESTADO, JSON.stringify({
      dia: hoje(agora),
      enviadasHoje: estado.enviadasHoje + escolhidas.length,
      ultimaEnvioAt: agora,
      jaNotificados: [...estado.jaNotificados, ...escolhidas.map((n) => n.storyId)].slice(-200),
    } satisfies EstadoPersistido))
  }

  return escolhidas.length
}
