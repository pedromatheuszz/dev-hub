import type { Story } from '../types.js'

/**
 * Decide o que merece notificação — spec §Notificações.
 *
 * O princípio é ser silencioso por padrão. Uma notificação que o usuário
 * aprende a ignorar não vale nada, então o critério é estreito: última
 * hora, ou algo muito relevante sobre um tópico que ele explicitamente
 * escolheu seguir.
 */

export interface PreferenciasNotificacao {
  ativadas: boolean
  ultimaHora: boolean
  topicosSeguidos: boolean
  /** Teto diário de notificações, para nunca virar spam. */
  maxPorDia: number
  /** Intervalo mínimo entre duas notificações, em ms. */
  intervaloMinimoMs: number
}

export const PREFERENCIAS_PADRAO: PreferenciasNotificacao = {
  ativadas: true,
  ultimaHora: true,
  topicosSeguidos: true,
  maxPorDia: 8,
  intervaloMinimoMs: 20 * 60_000,
}

/** Importância mínima para notificar sobre um tópico seguido. */
export const IMPORTANCIA_PARA_SEGUIDO = 0.75

export interface CandidataNotificacao {
  story: Story
  articleId: string
  /** Tags do artigo que o usuário segue. Vazio se nenhuma. */
  tagsSeguidas: string[]
}

export interface Notificacao {
  storyId: string
  articleId: string
  titulo: string
  corpo: string
  motivo: 'ultima_hora' | 'topico_seguido'
}

export interface EstadoNotificacao {
  enviadasHoje: number
  ultimaEnvioAt: number | null
  /** Ids de história já notificados, para não repetir o mesmo evento. */
  jaNotificados: Set<string>
}

function motivoDe(
  c: CandidataNotificacao,
  prefs: PreferenciasNotificacao,
): Notificacao['motivo'] | null {
  if (prefs.ultimaHora && c.story.isBreaking) return 'ultima_hora'
  if (
    prefs.topicosSeguidos
    && c.tagsSeguidas.length > 0
    && c.story.importance >= IMPORTANCIA_PARA_SEGUIDO
  ) {
    return 'topico_seguido'
  }
  return null
}

/**
 * Seleciona o que notificar respeitando teto diário, intervalo mínimo e
 * histórico. Função pura: quem chama decide como de fato exibir.
 */
export function selecionarNotificacoes(
  candidatas: CandidataNotificacao[],
  prefs: PreferenciasNotificacao,
  estado: EstadoNotificacao,
  agora: number,
): Notificacao[] {
  if (!prefs.ativadas) return []
  if (estado.enviadasHoje >= prefs.maxPorDia) return []
  if (
    estado.ultimaEnvioAt !== null
    && agora - estado.ultimaEnvioAt < prefs.intervaloMinimoMs
  ) {
    return []
  }

  const saida: Notificacao[] = []
  let restantes = prefs.maxPorDia - estado.enviadasHoje

  // Mais importante primeiro: se só cabe uma, que seja a que mais importa.
  const ordenadas = [...candidatas].sort((a, b) => {
    if (a.story.isBreaking !== b.story.isBreaking) return a.story.isBreaking ? -1 : 1
    return b.story.importance - a.story.importance
  })

  for (const c of ordenadas) {
    if (restantes <= 0) break
    if (estado.jaNotificados.has(c.story.id)) continue

    const motivo = motivoDe(c, prefs)
    if (!motivo) continue

    saida.push({
      storyId: c.story.id,
      articleId: c.articleId,
      titulo: motivo === 'ultima_hora' ? 'Última hora' : c.tagsSeguidas[0]!,
      corpo: c.story.canonicalTitle,
      motivo,
    })
    restantes--
  }

  return saida
}
