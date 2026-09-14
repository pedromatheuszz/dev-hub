import { describe, expect, it } from 'vitest'
import { isBreaking } from './breaking.js'
import { MEIA_VIDA_HORAS, freshness } from './freshness.js'
import { scoreStory, type ScoreInput } from './score.js'

const HORA = 3_600_000
const AGORA = 1_760_000_000_000

describe('freshness', () => {
  it('vale 1 no instante da publicação', () => {
    expect(freshness(AGORA, AGORA, 18)).toBe(1)
  })

  it('vale exatamente 0.5 após uma meia-vida', () => {
    expect(freshness(AGORA - 18 * HORA, AGORA, 18)).toBeCloseTo(0.5, 6)
  })

  it('vale 0.25 após duas meias-vidas', () => {
    expect(freshness(AGORA - 36 * HORA, AGORA, 18)).toBeCloseTo(0.25, 6)
  })

  it('decai monotonicamente', () => {
    const a = freshness(AGORA - 1 * HORA, AGORA, 18)
    const b = freshness(AGORA - 10 * HORA, AGORA, 18)
    expect(a).toBeGreaterThan(b)
  })

  it('trata data futura como recém-publicada, sem estourar acima de 1', () => {
    expect(freshness(AGORA + 5 * HORA, AGORA, 18)).toBe(1)
  })

  it('Innovation envelhece mais devagar que Technology', () => {
    expect(MEIA_VIDA_HORAS.innovation).toBeGreaterThan(MEIA_VIDA_HORAS.technology)
  })
})

describe('scoreStory', () => {
  function entrada(over: Partial<ScoreInput> = {}): ScoreInput {
    return {
      publishedAt: AGORA, now: AGORA, category: 'technology',
      trustWeight: 0.8, importance: 0.6, followMatches: [], articleCount: 1,
      ...over,
    }
  }

  it('devolve a decomposição completa, para o painel "por que estou vendo isto"', () => {
    const b = scoreStory(entrada())
    expect(Object.keys(b).sort()).toEqual(
      ['affinity', 'dedupPenalty', 'freshness', 'importance', 'total', 'trust'],
    )
  })

  it('o total é o produto dos fatores', () => {
    const b = scoreStory(entrada())
    expect(b.total).toBeCloseTo(
      b.freshness * b.trust * b.importance * b.affinity * b.dedupPenalty, 9,
    )
  })

  it('artigo mais recente pontua mais que o mesmo artigo antigo', () => {
    const novo = scoreStory(entrada()).total
    const velho = scoreStory(entrada({ publishedAt: AGORA - 48 * HORA })).total
    expect(novo).toBeGreaterThan(velho)
  })

  it('fonte mais confiável pontua mais', () => {
    expect(scoreStory(entrada({ trustWeight: 1.0 })).total)
      .toBeGreaterThan(scoreStory(entrada({ trustWeight: 0.5 })).total)
  })

  it('seguir um tópico aumenta a afinidade acima de 1', () => {
    const b = scoreStory(entrada({
      followMatches: [{ weight: 1.0, tagConfidence: 0.9 }],
    }))
    expect(b.affinity).toBeGreaterThan(1)
  })

  it('afinidade satura em 3 mesmo com muitos follows', () => {
    const b = scoreStory(entrada({
      followMatches: Array.from({ length: 20 }, () => ({ weight: 1, tagConfidence: 1 })),
    }))
    expect(b.affinity).toBeLessThanOrEqual(3)
  })

  it('sem follows a afinidade é exatamente 1, neutra', () => {
    expect(scoreStory(entrada()).affinity).toBe(1)
  })

  it('história com muitos artigos duplicados é penalizada', () => {
    const um = scoreStory(entrada({ articleCount: 1 })).dedupPenalty
    const cinco = scoreStory(entrada({ articleCount: 5 })).dedupPenalty
    expect(cinco).toBeLessThan(um)
    expect(um).toBe(1)
  })

  it('importância zero zera o total', () => {
    expect(scoreStory(entrada({ importance: 0 })).total).toBe(0)
  })
})

describe('isBreaking', () => {
  const base = {
    importance: 0.9, articleCount: 3,
    firstSeenAt: AGORA - 2 * HORA, lastArticleAt: AGORA,
    hasTrustedSource: true,
  }

  it('marca quando todas as condições valem', () => {
    expect(isBreaking(base)).toBe(true)
  })

  it('não marca com importância baixa', () => {
    expect(isBreaking({ ...base, importance: 0.5 })).toBe(false)
  })

  it('não marca com menos de 3 artigos', () => {
    expect(isBreaking({ ...base, articleCount: 2 })).toBe(false)
  })

  it('não marca se os artigos se espalharam por mais de 6 horas', () => {
    expect(isBreaking({ ...base, firstSeenAt: AGORA - 10 * HORA })).toBe(false)
  })

  it('não marca sem nenhuma fonte confiável — evita boato replicado', () => {
    expect(isBreaking({ ...base, hasTrustedSource: false })).toBe(false)
  })
})
