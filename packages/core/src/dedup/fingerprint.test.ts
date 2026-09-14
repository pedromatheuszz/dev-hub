import { describe, expect, it } from 'vitest'
import { jaccard, trigrams } from './jaccard.js'
import { hamming, simhash } from './simhash.js'

describe('simhash', () => {
  it('produz 16 caracteres hexadecimais', () => {
    expect(simhash('Rust 1.90 lançado hoje')).toMatch(/^[0-9a-f]{16}$/)
  })

  it('é determinístico', () => {
    expect(simhash('mesmo texto aqui')).toBe(simhash('mesmo texto aqui'))
  })

  it('ignora ordem de palavras (é um saco de palavras)', () => {
    expect(simhash('alpha beta gama')).toBe(simhash('gama beta alpha'))
  })

  it('textos quase idênticos ficam a distância pequena', () => {
    const a = simhash('NVIDIA anuncia nova GPU para data centers com mais memória')
    const b = simhash('NVIDIA anuncia nova GPU para data centers com mais memoria HBM')
    expect(hamming(a, b)).toBeLessThanOrEqual(12)
  })

  it('textos sem relação ficam a distância grande', () => {
    const a = simhash('NVIDIA anuncia nova GPU para data centers')
    const b = simhash('Receita de bolo de cenoura com cobertura de chocolate')
    expect(hamming(a, b)).toBeGreaterThan(12)
  })

  it('devolve zeros em texto vazio', () => {
    expect(simhash('')).toBe('0000000000000000')
  })
})

describe('hamming', () => {
  it('é zero para hashes iguais', () => {
    expect(hamming('ffffffffffffffff', 'ffffffffffffffff')).toBe(0)
  })
  it('conta bits diferentes', () => {
    expect(hamming('0000000000000000', '0000000000000003')).toBe(2)
  })
  it('é 64 para complementos', () => {
    expect(hamming('0000000000000000', 'ffffffffffffffff')).toBe(64)
  })
})

describe('trigrams e jaccard', () => {
  it('gera trigramas de palavras normalizadas', () => {
    expect(trigrams('abcd')).toEqual(new Set(['abc', 'bcd']))
  })

  it('jaccard de conjuntos idênticos é 1', () => {
    expect(jaccard(trigrams('rust lancado'), trigrams('rust lancado'))).toBe(1)
  })

  it('jaccard de conjuntos disjuntos é 0', () => {
    expect(jaccard(new Set(['abc']), new Set(['xyz']))).toBe(0)
  })

  it('títulos parecidos passam de 0.7', () => {
    const a = trigrams('Rust 1.90 lancado com melhorias no borrow checker')
    const b = trigrams('Rust 1.90 lancado com melhorias no borrow checker hoje')
    expect(jaccard(a, b)).toBeGreaterThan(0.7)
  })

  it('dois conjuntos vazios dão 0, sem divisão por zero', () => {
    expect(jaccard(new Set(), new Set())).toBe(0)
  })
})
