import { describe, expect, it } from 'vitest'
import { SOURCES } from './registry.js'

describe('SOURCES', () => {
  it('tem no mínimo 30 fontes, como exige a Fase 1', () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(30)
  })

  it('não tem ids duplicados', () => {
    const ids = SOURCES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('não tem feedUrl duplicada', () => {
    const urls = SOURCES.map((s) => s.feedUrl)
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('toda feedUrl é https', () => {
    for (const s of SOURCES) {
      expect(s.feedUrl.startsWith('https://'), `${s.id}: ${s.feedUrl}`).toBe(true)
    }
  })

  it('os pesos de confiança seguem a escala do spec §4.1', () => {
    const esperado: Record<string, number> = {
      official: 1.0, research: 0.9, news: 0.75, blog: 0.6, aggregator: 0.5,
    }
    for (const s of SOURCES) {
      expect(s.trustWeight, `${s.id}`).toBe(esperado[s.kind])
    }
  })

  it('cobre os cinco tipos de fonte', () => {
    const kinds = new Set(SOURCES.map((s) => s.kind))
    expect(kinds).toEqual(
      new Set(['official', 'news', 'blog', 'aggregator', 'research']),
    )
  })

  it('cobre as três categorias nos hints', () => {
    const hints = new Set(SOURCES.map((s) => s.categoryHint).filter(Boolean))
    expect(hints).toEqual(new Set(['technology', 'programming', 'innovation']))
  })

  it('toda fonte começa ativa e sem estado de fetch', () => {
    for (const s of SOURCES) {
      expect(s.active).toBe(true)
      expect(s.lastFetchedAt).toBeNull()
      expect(s.etag).toBeNull()
    }
  })
})
