import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { detectFormat, parseFeed } from './index.js'

const fx = (n: string) =>
  readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url), 'utf8')

describe('detectFormat', () => {
  it('reconhece RSS', () => expect(detectFormat(fx('rss.xml'))).toBe('rss'))
  it('reconhece Atom', () => expect(detectFormat(fx('atom.xml'))).toBe('atom'))
  it('reconhece JSON Feed', () => expect(detectFormat(fx('jsonfeed.json'))).toBe('jsonfeed'))
})

describe('parseFeed — RSS', () => {
  const itens = parseFeed(fx('rss.xml'))

  it('extrai todos os itens', () => expect(itens).toHaveLength(2))

  it('extrai título, link, autor e data', () => {
    const a = itens[0]!
    expect(a.title).toBe('Rust 1.90 lançado')
    expect(a.link).toBe('https://exemplo.dev/rust-190?utm_source=rss')
    expect(a.author).toBe('Ana Lima')
    expect(a.publishedAt).toBe('Mon, 08 Sep 2026 14:30:00 GMT')
    expect(a.contentHtml).toContain('borrow checker')
  })

  it('usa null nos campos ausentes em vez de undefined ou string vazia', () => {
    const b = itens[1]!
    expect(b.author).toBeNull()
    expect(b.publishedAt).toBeNull()
  })
})

describe('parseFeed — Atom', () => {
  const itens = parseFeed(fx('atom.xml'))

  it('extrai o href do link alternate', () => {
    expect(itens[0]!.link).toBe('https://go.exemplo/1-26')
  })

  it('extrai autor aninhado e data ISO', () => {
    expect(itens[0]!.author).toBe('Bruno Reis')
    expect(itens[0]!.publishedAt).toBe('2026-09-07T10:00:00Z')
  })
})

describe('parseFeed — JSON Feed', () => {
  const itens = parseFeed(fx('jsonfeed.json'))

  it('extrai item, autor e imagem', () => {
    const a = itens[0]!
    expect(a.title).toBe('TypeScript 6 em beta')
    expect(a.author).toBe('Carla Souza')
    expect(a.imageUrl).toBe('https://json.exemplo/capa.png')
  })
})

describe('parseFeed — robustez', () => {
  // Constraint global: falha em uma fonte nunca derruba o pipeline.
  it('devolve lista vazia em XML malformado, sem lançar', () => {
    expect(parseFeed(fx('malformado.xml'))).toEqual([])
  })

  it('devolve lista vazia em string vazia', () => {
    expect(parseFeed('')).toEqual([])
  })

  it('devolve lista vazia em JSON inválido', () => {
    expect(parseFeed('{ isto não é json')).toEqual([])
  })

  it('descarta itens sem título ou sem link', () => {
    const semLink = '<rss><channel><item><title>Só título</title></item></channel></rss>'
    expect(parseFeed(semLink)).toEqual([])
  })
})
