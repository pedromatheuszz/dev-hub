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
