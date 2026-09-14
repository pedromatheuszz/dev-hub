import { describe, expect, it } from 'vitest'
import { isRelevant, relevanceScore } from './prefilter.js'

describe('relevanceScore', () => {
  it('pontua alto conteúdo claramente técnico', () => {
    const s = relevanceScore(
      'Rust 1.90 melhora o borrow checker',
      'A nova versão do compilador traz melhorias no borrow checker e no linker.',
    )
    expect(s).toBeGreaterThan(0.3)
  })

  it('pontua baixo conteúdo sem relação com tecnologia', () => {
    const s = relevanceScore(
      'Receita de bolo de cenoura',
      'Bata os ovos com o açúcar e acrescente a farinha aos poucos.',
    )
    expect(s).toBeLessThan(0.1)
  })

  it('dá peso maior a acerto no título do que no corpo', () => {
    const noTitulo = relevanceScore('Kubernetes em produção', 'texto qualquer sem termos')
    const noCorpo = relevanceScore('Texto qualquer sem termos', 'Kubernetes em produção')
    expect(noTitulo).toBeGreaterThan(noCorpo)
  })

  it('devolve 0 para entrada vazia', () => {
    expect(relevanceScore('', '')).toBe(0)
  })

  it('nunca passa de 1', () => {
    const s = relevanceScore(
      'Python JavaScript Rust Kubernetes Docker GPU CPU API',
      'Python JavaScript Rust Kubernetes Docker GPU CPU API compilador servidor',
    )
    expect(s).toBeLessThanOrEqual(1)
  })

  it('nunca é negativo, mesmo com título maior que o corpo', () => {
    expect(relevanceScore('Rust Python Kubernetes Docker GPU', 'oi')).toBeGreaterThanOrEqual(0)
  })

  it('não é enganado por um único termo repetido', () => {
    const repetido = relevanceScore('api', 'api api api api api api api api api api')
    const variado = relevanceScore('API REST em Go', 'Construindo uma API REST com Go e Postgres')
    expect(variado).toBeGreaterThan(repetido)
  })
})

describe('isRelevant', () => {
  it('aceita artigo técnico', () => {
    expect(isRelevant('GPU nova da NVIDIA', 'Arquitetura com mais memória HBM')).toBe(true)
  })
  it('rejeita artigo fora de escopo', () => {
    expect(isRelevant('Resultado do campeonato', 'O time venceu por dois a um')).toBe(false)
  })
})
