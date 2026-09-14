import type { Category } from '../types.js'
import { MEIA_VIDA_HORAS, freshness } from './freshness.js'

export interface FollowMatch {
  weight: number // peso do follow definido pelo usuário
  tagConfidence: number // confiança da tag no artigo
}

export interface ScoreInput {
  publishedAt: number
  now: number
  category: Category
  trustWeight: number
  importance: number
  followMatches: FollowMatch[]
  articleCount: number
}

export interface ScoreBreakdown {
  freshness: number
  trust: number
  importance: number
  affinity: number
  dedupPenalty: number
  total: number
}

const AFINIDADE_MAX = 3
const FATOR_DUPLICATA = 0.15

/**
 * Spec §7.1. Devolve a decomposição inteira, não só o total: a interface
 * mostra ao usuário por que um item está no topo. Nada de caixa-preta.
 */
export function scoreStory(input: ScoreInput): ScoreBreakdown {
  const f = freshness(input.publishedAt, input.now, MEIA_VIDA_HORAS[input.category])
  const trust = input.trustWeight
  const importance = input.importance

  const soma = input.followMatches.reduce(
    (acc, m) => acc + m.weight * m.tagConfidence,
    0,
  )
  const affinity = Math.min(AFINIDADE_MAX, 1 + soma)

  const dedupPenalty = 1 / (1 + FATOR_DUPLICATA * Math.max(0, input.articleCount - 1))

  return {
    freshness: f,
    trust,
    importance,
    affinity,
    dedupPenalty,
    total: f * trust * importance * affinity * dedupPenalty,
  }
}
