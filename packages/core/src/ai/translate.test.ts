import { describe, expect, it } from 'vitest'
import { fakeClock, fakeHttp, silentLogger } from '../testing/fakes.js'
import { GeminiProvider, interpretarClassificacao } from './gemini.js'
import { HeuristicProvider } from './heuristic.js'
import type { ArticleForAI } from './provider.js'
import { GovernadorDeCota } from './quota.js'

const URL_GERAR =
  'POST https://generativelanguage.googleapis.com/v1beta/models/gemini-teste:generateContent?key=chave-de-teste'

const EM_INGLES: ArticleForAI = {
  id: 'a1',
  title: 'Rust 1.90 released with borrow checker fixes',
  excerpt: 'The new version improves compiler error messages.',
  contentText: 'The Rust team shipped 1.90 this week with faster builds.',
  sourceTrust: 1,
  categoryHint: null,
  lang: 'en',
}

const EM_PORTUGUES: ArticleForAI = {
  ...EM_INGLES,
  id: 'a2',
  title: 'Rust 1.90 lancado com melhorias no borrow checker',
  lang: 'pt',
}

function provedor(rotas: Record<string, { body: string; status?: number }>) {
  return new GeminiProvider({
    http: fakeHttp(rotas),
    logger: silentLogger,
    apiKey: 'chave-de-teste',
    model: 'gemini-teste',
    governador: new GovernadorDeCota(fakeClock()),
    backoffBaseMs: 1,
  })
}

function resposta(payload: unknown) {
  return JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    usageMetadata: { promptTokenCount: 400, candidatesTokenCount: 200 },
  })
}

describe('tradução no lote de classificação', () => {
  it('lê a tradução quando o modelo devolve', () => {
    const r = interpretarClassificacao(JSON.stringify({
      itens: [{
        i: 0, categoria: 'programming', tipo: 'announcement', importancia: 0.8,
        tags: ['rust'],
        titulo_pt: 'Rust 1.90 chega com correções no borrow checker',
        resumo_pt: 'A nova versão melhora as mensagens de erro do compilador.',
      }],
    }), [EM_INGLES])

    expect(r[0]!.translation).toEqual({
      title: 'Rust 1.90 chega com correções no borrow checker',
      excerpt: 'A nova versão melhora as mensagens de erro do compilador.',
    })
  })

  it('não marca tradução quando o modelo devolve o original em inglês', () => {
    const r = interpretarClassificacao(JSON.stringify({
      itens: [{
        i: 0, categoria: 'programming', tipo: 'news', importancia: 0.5, tags: [],
        titulo_pt: EM_INGLES.title,
        resumo_pt: EM_INGLES.excerpt,
      }],
    }), [EM_INGLES])
    expect(r[0]!.translation).toBeUndefined()
  })

  it('não marca tradução quando o título traduzido vem vazio', () => {
    const r = interpretarClassificacao(JSON.stringify({
      itens: [{
        i: 0, categoria: 'programming', tipo: 'news', importancia: 0.5, tags: [],
        titulo_pt: '   ', resumo_pt: 'algo',
      }],
    }), [EM_INGLES])
    expect(r[0]!.translation).toBeUndefined()
  })

  it('a classificação continua válida sem os campos de tradução', () => {
    const r = interpretarClassificacao(JSON.stringify({
      itens: [{ i: 0, categoria: 'programming', tipo: 'news', importancia: 0.5, tags: ['rust'] }],
    }), [EM_INGLES])
    expect(r[0]!.category).toBe('programming')
    expect(r[0]!.translation).toBeUndefined()
  })

  it('classifica e traduz num lote só, sem requisição extra', async () => {
    const p = provedor({
      [URL_GERAR]: {
        body: resposta({
          itens: [{
            i: 0, categoria: 'programming', tipo: 'announcement', importancia: 0.9,
            tags: ['rust'], titulo_pt: 'Rust 1.90 chega com correções',
            resumo_pt: 'Mensagens de erro melhores.',
          }],
        }),
      },
    })
    const r = await p.classifyBatch([EM_INGLES])
    expect(r[0]!.translation?.title).toBe('Rust 1.90 chega com correções')
  })
})

describe('GeminiProvider.translate', () => {
  it('traduz o artigo completo', async () => {
    const p = provedor({
      [URL_GERAR]: {
        body: resposta({
          titulo: 'Rust 1.90 chega com correções no borrow checker',
          resumo: 'A nova versão melhora o compilador.',
          texto: 'A equipe do Rust publicou a 1.90 nesta semana.',
        }),
      },
    })
    const t = await p.translate(EM_INGLES)
    expect(t?.title).toBe('Rust 1.90 chega com correções no borrow checker')
    expect(t?.contentText).toBe('A equipe do Rust publicou a 1.90 nesta semana.')
    expect(t?.provider).toBe('gemini')
  })

  it('devolve null quando a resposta vem sem título', async () => {
    const p = provedor({ [URL_GERAR]: { body: resposta({ texto: 'algo' }) } })
    expect(await p.translate(EM_INGLES)).toBeNull()
  })

  it('devolve null em erro de rede, sem lançar', async () => {
    const p = provedor({ [URL_GERAR]: { body: 'erro', status: 500 } })
    expect(await p.translate(EM_INGLES)).toBeNull()
  })

  it('devolve null quando a resposta não é JSON', async () => {
    const p = provedor({
      [URL_GERAR]: {
        body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'nao e json' }] } }] }),
      },
    })
    expect(await p.translate(EM_INGLES)).toBeNull()
  })
})

describe('HeuristicProvider.translate', () => {
  // Traduzir de verdade exige um modelo. Um dicionário palavra-a-palavra
  // daria ao usuário a impressão de estar lendo tradução confiável.
  it('não traduz, e diz isso devolvendo null', async () => {
    expect(await new HeuristicProvider().translate(EM_INGLES)).toBeNull()
  })

  it('não inventa tradução na classificação', async () => {
    const [c] = await new HeuristicProvider().classifyBatch([EM_INGLES])
    expect(c!.translation).toBeUndefined()
  })
})

describe('artigo já em português', () => {
  it('não entra na lista de tradução do prompt', async () => {
    // Sem itens para traduzir, o modelo não recebe instrução de tradução e
    // a resposta não traz titulo_pt — o artigo segue com o texto original.
    const p = provedor({
      [URL_GERAR]: {
        body: resposta({
          itens: [{ i: 0, categoria: 'programming', tipo: 'news', importancia: 0.5, tags: [] }],
        }),
      },
    })
    const r = await p.classifyBatch([EM_PORTUGUES])
    expect(r[0]!.translation).toBeUndefined()
  })
})
