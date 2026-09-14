import type { Platform } from '../platform.js'
import { GeminiProvider } from './gemini.js'
import { HeuristicProvider } from './heuristic.js'
import type { AIProvider } from './provider.js'
import { GovernadorDeCota, LIMITES_PADRAO, type EstadoCota, type LimitesCota } from './quota.js'

export const CHAVE_SECRETA_GEMINI = 'gemini_api_key'

export interface UsoIA {
  requisicoes: number
  tokensEntrada: number
  tokensSaida: number
}

export interface ConfigIA {
  /** Modelo escolhido pelo usuário na lista que o provedor anuncia. */
  model: string
  limites?: LimitesCota
}

export interface ProviderMontado {
  provider: AIProvider
  governador: GovernadorDeCota | null
  /** Por que caiu na heurística, quando caiu. Vai para a interface. */
  motivoHeuristica: 'sem_chave' | 'sem_modelo' | null
}

/**
 * Escolhe o provedor conforme a configuração e a presença de chave.
 *
 * Sem chave configurada, devolve o HeuristicProvider — e o app funciona
 * normalmente, só com resumos extrativos. É o que mantém a promessa do
 * spec de que nada quebra por falta de IA.
 */
export async function montarProvider(
  platform: Platform,
  config: ConfigIA,
  estadoCota: EstadoCota | undefined,
  aoUsar: (uso: UsoIA) => void,
): Promise<ProviderMontado> {
  const chave = await platform.secrets.get(CHAVE_SECRETA_GEMINI)

  if (!chave) {
    return { provider: new HeuristicProvider(), governador: null, motivoHeuristica: 'sem_chave' }
  }
  if (!config.model) {
    return { provider: new HeuristicProvider(), governador: null, motivoHeuristica: 'sem_modelo' }
  }

  const governador = new GovernadorDeCota(
    platform.clock,
    config.limites ?? LIMITES_PADRAO,
    estadoCota,
  )

  return {
    provider: new GeminiProvider({
      http: platform.http,
      logger: platform.logger,
      apiKey: chave,
      model: config.model,
      governador,
      aoUsar,
    }),
    governador,
    motivoHeuristica: null,
  }
}
