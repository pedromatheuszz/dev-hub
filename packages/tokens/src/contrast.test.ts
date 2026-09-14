import { describe, expect, it } from 'vitest'
import { contraste, dark, light, palettes, type Palette } from './index.js'

/** WCAG AA: 4.5:1 para texto corrido, 3:1 para texto grande e UI. */
const AA_TEXTO = 4.5
const AA_GRANDE = 3

describe('contraste', () => {
  it('preto sobre branco é o máximo de 21', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
  })
  it('a mesma cor dá 1', () => {
    expect(contraste('#2F6FED', '#2F6FED')).toBeCloseTo(1, 5)
  })
  it('é simétrico', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(contraste('#FFFFFF', '#000000'), 5)
  })
})

// Esta suíte é a garantia de acessibilidade do spec §13. Se alguém mexer
// na paleta e quebrar o contraste, o build falha antes de chegar ao usuário.
describe.each([['claro', light], ['escuro', dark]])(
  'paleta %s — WCAG AA',
  (_nome, p: Palette) => {
    const fundos: Array<[string, string]> = [
      ['bg', p.bg], ['surface', p.surface], ['surfaceAlt', p.surfaceAlt],
    ]

    it.each(fundos)('texto principal sobre %s passa em 4.5:1', (_f, fundo) => {
      expect(contraste(p.text, fundo)).toBeGreaterThanOrEqual(AA_TEXTO)
    })

    it.each(fundos)('texto secundário sobre %s passa em 4.5:1', (_f, fundo) => {
      expect(contraste(p.textMuted, fundo)).toBeGreaterThanOrEqual(AA_TEXTO)
    })

    it.each(fundos)('texto tênue sobre %s passa em 3:1 (texto grande)', (_f, fundo) => {
      expect(contraste(p.textFaint, fundo)).toBeGreaterThanOrEqual(AA_GRANDE)
    })

    it('o destaque passa em 3:1 sobre o fundo (elemento de UI)', () => {
      expect(contraste(p.accent, p.bg)).toBeGreaterThanOrEqual(AA_GRANDE)
    })

    it.each([
      ['technology', p.technology], ['programming', p.programming],
      ['innovation', p.innovation], ['breaking', p.breaking],
    ])('a cor de %s passa em 3:1 sobre a superfície', (_c, cor) => {
      expect(contraste(cor, p.surface)).toBeGreaterThanOrEqual(AA_GRANDE)
    })

    it('a borda é visível contra a superfície', () => {
      expect(contraste(p.border, p.surface)).toBeGreaterThan(1.05)
    })
  },
)

describe('paletas', () => {
  it('as duas têm exatamente as mesmas chaves', () => {
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort())
  })
  it('o mapa de paletas expõe as duas', () => {
    expect(Object.keys(palettes).sort()).toEqual(['dark', 'light'])
  })
  it('toda cor é hex de 6 dígitos', () => {
    for (const p of [light, dark]) {
      for (const [chave, valor] of Object.entries(p)) {
        expect(valor, chave).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    }
  })
})
