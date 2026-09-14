export interface BreakingInput {
  importance: number
  articleCount: number
  firstSeenAt: number
  lastArticleAt: number
  /** Alguma fonte do grupo é oficial ou tem trustWeight >= 0.8. */
  hasTrustedSource: boolean
}

export const IMPORTANCIA_MINIMA = 0.85
export const ARTIGOS_MINIMOS = 3
export const JANELA_HORAS = 6

const MS_POR_HORA = 3_600_000

/**
 * Spec §7.2. As três condições valem em conjunto — a exigência de fonte
 * confiável é o que impede um boato replicado por agregadores de virar
 * manchete de "última hora".
 */
export function isBreaking(input: BreakingInput): boolean {
  if (input.importance <= IMPORTANCIA_MINIMA) return false
  if (input.articleCount < ARTIGOS_MINIMOS) return false
  if (!input.hasTrustedSource) return false

  const janela = (input.lastArticleAt - input.firstSeenAt) / MS_POR_HORA
  return janela <= JANELA_HORAS
}
