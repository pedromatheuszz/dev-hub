import { describe, expect, it } from 'vitest'
import { HeuristicProvider } from './heuristic.js'
import type { ArticleForAI } from './provider.js'

const provider = new HeuristicProvider()

function artigo(over: Partial<ArticleForAI> = {}): ArticleForAI {
  return {
    id: 'a1',
    title: 'Rust 1.90 lançado com melhorias no borrow checker',
    excerpt: 'A nova versão do compilador melhora mensagens de erro.',
    contentText:
      'A equipe do Rust lançou a versão 1.90 nesta semana. O compilador agora ' +
      'produz mensagens de erro mais claras no borrow checker. O cargo ganhou ' +
      'suporte a builds incrementais bem mais rápidos. A comunidade recebeu bem.',
    sourceTrust: 0.9,
    categoryHint: null,
    ...over,
  }
}

describe('HeuristicProvider — identidade', () => {
  it('se identifica', () => expect(provider.name).toBe('heuristic'))
  it('anuncia um modelo sintético', async () => {
    const modelos = await provider.listModels()
    expect(modelos).toHaveLength(1)
    expect(modelos[0]!.id).toBe('heuristic-v1')
  })
})

describe('HeuristicProvider.classifyBatch', () => {
  it('devolve uma classificação por artigo, na mesma ordem', async () => {
    const r = await provider.classifyBatch([artigo({ id: 'x' }), artigo({ id: 'y' })])
    expect(r.map((c) => c.articleId)).toEqual(['x', 'y'])
  })

  it('classifica categoria e tipo de conteúdo', async () => {
    const [c] = await provider.classifyBatch([artigo()])
    expect(c!.category).toBe('programming')
    expect(c!.contentType).toBe('announcement')
  })

  it('extrai tags relevantes', async () => {
    const [c] = await provider.classifyBatch([artigo()])
    expect(c!.tags.map((t) => t.slug)).toContain('rust')
  })

  it('importância fica entre 0 e 1', async () => {
    const [c] = await provider.classifyBatch([artigo()])
    expect(c!.importance).toBeGreaterThanOrEqual(0)
    expect(c!.importance).toBeLessThanOrEqual(1)
  })

  it('fonte mais confiável produz importância maior', async () => {
    const [alta] = await provider.classifyBatch([artigo({ sourceTrust: 1.0 })])
    const [baixa] = await provider.classifyBatch([artigo({ sourceTrust: 0.4 })])
    expect(alta!.importance).toBeGreaterThan(baixa!.importance)
  })

  it('marca a saída como gerada automaticamente', async () => {
    const [c] = await provider.classifyBatch([artigo()])
    expect(c!.isAiGenerated).toBe(true)
  })

  it('lote vazio devolve lista vazia', async () => {
    expect(await provider.classifyBatch([])).toEqual([])
  })

  it('não lança com artigo de conteúdo vazio', async () => {
    const [c] = await provider.classifyBatch([
      artigo({ title: '', excerpt: '', contentText: '' }),
    ])
    expect(c!.articleId).toBe('a1')
  })
})

describe('HeuristicProvider.summarize', () => {
  it('produz resumo extrativo não vazio', async () => {
    const s = await provider.summarize(artigo(), 'short')
    expect(s.text.length).toBeGreaterThan(0)
  })

  it('toda frase do resumo existe no artigo original', async () => {
    const a = artigo()
    const s = await provider.summarize(a, 'short')
    for (const frase of s.keyPoints) {
      expect(a.contentText).toContain(frase)
    }
  })

  it('o resumo profundo é maior ou igual ao curto', async () => {
    const curto = await provider.summarize(artigo(), 'short')
    const fundo = await provider.summarize(artigo(), 'deep')
    expect(fundo.text.length).toBeGreaterThanOrEqual(curto.text.length)
  })

  it('marca como gerado automaticamente e identifica o gerador', async () => {
    const s = await provider.summarize(artigo(), 'short')
    expect(s.isAiGenerated).toBe(true)
    expect(s.provider).toBe('heuristic')
    expect(s.model).toBe('heuristic-v1')
  })

  it('devolve texto vazio sem lançar quando não há conteúdo', async () => {
    const s = await provider.summarize(artigo({ contentText: '', excerpt: '' }), 'short')
    expect(s.text).toBe('')
    expect(s.keyPoints).toEqual([])
  })
})
