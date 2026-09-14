import {
  CHAVE_SECRETA_GEMINI, montarProvider, type AIProvider, type ModelInfo,
} from '@devhub/core'
import type { Contexto } from './db.js'
import { criarPlatform } from './platform.js'
import { gravarConfig, lerConfig } from './queries.js'

export interface EstadoIA {
  temChave: boolean
  provider: 'gemini' | 'heuristic'
  model: string
  motivoHeuristica: 'sem_chave' | 'sem_modelo' | null
  requisicoesHoje: number
  tetoDiario: number
  tokensHoje: number
  aTraduzir: number
  traduzidos: number
}

const CHAVE_MODELO = 'ai_model'

/**
 * Monta o provedor de IA para uma rodada de ingestão, restaurando o
 * contador diário de cota do banco — assim reiniciar o app não zera o
 * consumo e não fura o limite do provedor.
 */
export async function providerParaIngestao(ctx: Contexto): Promise<AIProvider> {
  const platform = criarPlatform(ctx)
  const agora = Date.now()

  const { provider } = await montarProvider(
    platform,
    { model: lerConfig(ctx, CHAVE_MODELO) ?? '' },
    { dia: new Date(agora).toISOString().slice(0, 10), requisicoesHoje: ctx.usage.requisicoesHoje(agora) },
    (uso) => {
      ctx.usage.registrar('gemini', lerConfig(ctx, CHAVE_MODELO) ?? '?', uso, Date.now())
    },
  )
  return provider
}

/**
 * Traduz o corpo completo de um artigo, sob demanda ao abrir.
 *
 * O título e o resumo já vieram traduzidos de carona no lote de
 * classificação; aqui completamos o texto. Devolve false quando não há
 * como traduzir — sem chave, sem cota ou sem internet.
 */
export async function traduzirArtigo(ctx: Contexto, articleId: string): Promise<boolean> {
  const artigo = ctx.articles.byId(articleId)
  if (!artigo) return false
  if (artigo.lang === 'pt' || artigo.lang === 'desconhecido') return false
  if (ctx.translations.temCorpo(articleId, 'pt')) return true

  const provider = await providerParaIngestao(ctx)
  const t = await provider.translate({
    id: artigo.id,
    title: artigo.title,
    excerpt: artigo.excerpt,
    contentText: artigo.contentText,
    sourceTrust: 1,
    categoryHint: null,
    lang: artigo.lang,
  })
  if (!t) return false

  ctx.translations.upsert({
    articleId,
    targetLang: 'pt',
    sourceLang: artigo.lang,
    title: t.title,
    excerpt: t.excerpt,
    contentText: t.contentText,
    provider: t.provider,
    model: t.model,
    translatedAt: Date.now(),
  })
  return true
}

export async function lerEstadoIA(ctx: Contexto): Promise<EstadoIA> {
  const platform = criarPlatform(ctx)
  const agora = Date.now()
  const model = lerConfig(ctx, CHAVE_MODELO) ?? ''

  const { governador, motivoHeuristica } = await montarProvider(
    platform, { model }, undefined, () => {},
  )

  const uso = ctx.usage.doDia(agora)

  return {
    temChave: (await platform.secrets.get(CHAVE_SECRETA_GEMINI)) !== null,
    provider: motivoHeuristica === null ? 'gemini' : 'heuristic',
    model,
    motivoHeuristica,
    requisicoesHoje: ctx.usage.requisicoesHoje(agora),
    tetoDiario: governador?.tetoDiario ?? 0,
    tokensHoje: uso.reduce((s, u) => s + u.tokensEntrada + u.tokensSaida, 0),
    aTraduzir: ctx.translations.pendentes('pt', 100_000).length,
    traduzidos: ctx.translations.contar('pt'),
  }
}

export async function gravarChave(ctx: Contexto, chave: string): Promise<void> {
  const platform = criarPlatform(ctx)
  if (chave.trim().length === 0) {
    await platform.secrets.delete(CHAVE_SECRETA_GEMINI)
    return
  }
  await platform.secrets.set(CHAVE_SECRETA_GEMINI, chave.trim())
}

export function gravarModelo(ctx: Contexto, model: string): void {
  gravarConfig(ctx, CHAVE_MODELO, model)
}

/**
 * Lista os modelos que a chave configurada consegue usar. Sem chave,
 * devolve lista vazia — a interface então pede a chave primeiro.
 */
export async function listarModelos(ctx: Contexto): Promise<ModelInfo[]> {
  const { provider, motivoHeuristica } = await montarProvider(
    criarPlatform(ctx),
    // Modelo fictício só para instanciar o provedor e conseguir listar.
    { model: lerConfig(ctx, CHAVE_MODELO) || 'listagem' },
    undefined,
    () => {},
  )
  if (motivoHeuristica === 'sem_chave') return []
  return provider.listModels()
}
