import { describe, expect, it, vi } from 'vitest'
import { fakeClock, fakeHttp, silentLogger } from '../testing/fakes.js'
import {
  GeminiProvider, interpretarClassificacao, limparCercaDeCodigo,
} from './gemini.js'
import type { ArticleForAI } from './provider.js'
import { GovernadorDeCota, atrasoBackoff } from './quota.js'

const ARTIGOS: ArticleForAI[] = [
  {
    id: 'a1', title: 'Rust 1.90 released with borrow checker fixes',
    excerpt: 'compiler improvements', contentText: 'cargo e rustc mais rapidos',
    sourceTrust: 1, categoryHint: null,
  },
  {
    id: 'a2', title: 'NVIDIA announces new GPU',
    excerpt: 'more memory', contentText: 'cuda e vram',
    sourceTrust: 0.75, categoryHint: null,
  },
]

function provedor(rotas: Record<string, { body: string; status?: number }>, gov?: GovernadorDeCota) {
  const clock = fakeClock()
  return new GeminiProvider({
    http: fakeHttp(rotas),
    logger: silentLogger,
    apiKey: 'chave-de-teste',
    model: 'gemini-teste',
    governador: gov ?? new GovernadorDeCota(clock),
    backoffBaseMs: 1,
  })
}

function respostaGemini(payload: unknown) {
  return JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 100 },
  })
}

describe('GovernadorDeCota', () => {
  it('aplica margem de segurança sobre os limites anunciados', () => {
    const g = new GovernadorDeCota(fakeClock(), { porMinuto: 15, porDia: 200, margem: 0.8 })
    expect(g.tetoPorMinuto).toBe(12)
    expect(g.tetoDiario).toBe(160)
  })

  it('permite até o teto por minuto e então nega', () => {
    const g = new GovernadorDeCota(fakeClock(), { porMinuto: 5, porDia: 100, margem: 1 })
    for (let i = 0; i < 5; i++) {
      expect(g.podeRequisitar().permitido).toBe(true)
      g.registrar()
    }
    const r = g.podeRequisitar()
    expect(r.permitido).toBe(false)
    expect(r.motivo).toBe('limite_por_minuto')
    expect(r.esperarMs).toBeGreaterThan(0)
  })

  it('a janela por minuto desliza', () => {
    const clock = fakeClock()
    const g = new GovernadorDeCota(clock, { porMinuto: 2, porDia: 100, margem: 1 })
    g.registrar(); g.registrar()
    expect(g.podeRequisitar().permitido).toBe(false)
    clock.advance(61_000)
    expect(g.podeRequisitar().permitido).toBe(true)
  })

  it('nega ao bater o teto diário', () => {
    const g = new GovernadorDeCota(fakeClock(), { porMinuto: 1000, porDia: 3, margem: 1 })
    for (let i = 0; i < 3; i++) g.registrar()
    const r = g.podeRequisitar()
    expect(r.permitido).toBe(false)
    expect(r.motivo).toBe('limite_diario')
  })

  it('zera o contador diário na virada do dia', () => {
    const clock = fakeClock(Date.UTC(2026, 8, 14, 23, 0))
    const g = new GovernadorDeCota(clock, { porMinuto: 1000, porDia: 2, margem: 1 })
    g.registrar(); g.registrar()
    expect(g.podeRequisitar().permitido).toBe(false)
    clock.advance(2 * 3_600_000) // passa da meia-noite UTC
    expect(g.podeRequisitar().permitido).toBe(true)
  })

  it('restaura o contador de um estado salvo do mesmo dia', () => {
    const clock = fakeClock(Date.UTC(2026, 8, 14, 10, 0))
    const dia = new Date(clock.now()).toISOString().slice(0, 10)
    const g = new GovernadorDeCota(
      clock, { porMinuto: 1000, porDia: 10, margem: 1 },
      { dia, requisicoesHoje: 7 },
    )
    expect(g.restantesHoje).toBe(3)
  })

  it('ignora estado salvo de um dia anterior', () => {
    const clock = fakeClock(Date.UTC(2026, 8, 14, 10, 0))
    const g = new GovernadorDeCota(
      clock, { porMinuto: 1000, porDia: 10, margem: 1 },
      { dia: '2020-01-01', requisicoesHoje: 9 },
    )
    expect(g.restantesHoje).toBe(10)
  })
})

describe('atrasoBackoff', () => {
  it('cresce a cada tentativa', () => {
    const medias = [0, 1, 2, 3].map((t) => {
      let soma = 0
      for (let i = 0; i < 50; i++) soma += atrasoBackoff(t)
      return soma / 50
    })
    for (let i = 1; i < medias.length; i++) {
      expect(medias[i]!).toBeGreaterThan(medias[i - 1]!)
    }
  })
  it('respeita o teto', () => {
    for (let i = 0; i < 30; i++) expect(atrasoBackoff(20, 1000, 5000)).toBeLessThanOrEqual(5000)
  })
  it('tem jitter — duas chamadas raramente coincidem', () => {
    const valores = new Set(Array.from({ length: 30 }, () => atrasoBackoff(5)))
    expect(valores.size).toBeGreaterThan(1)
  })
})

describe('limparCercaDeCodigo', () => {
  it('remove cerca com marcador json', () => {
    expect(limparCercaDeCodigo('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })
  it('remove cerca sem marcador', () => {
    expect(limparCercaDeCodigo('```\n{"a":1}\n```')).toBe('{"a":1}')
  })
  it('deixa JSON puro intacto', () => {
    expect(limparCercaDeCodigo('{"a":1}')).toBe('{"a":1}')
  })
})

describe('interpretarClassificacao', () => {
  it('lê a resposta bem formada', () => {
    const r = interpretarClassificacao(JSON.stringify({
      itens: [
        { i: 0, categoria: 'programming', tipo: 'announcement', importancia: 0.8, tags: ['rust'] },
        { i: 1, categoria: 'technology', tipo: 'announcement', importancia: 0.7, tags: ['gpu', 'nvidia'] },
      ],
    }), ARTIGOS)

    expect(r).toHaveLength(2)
    expect(r[0]!.articleId).toBe('a1')
    expect(r[0]!.category).toBe('programming')
    expect(r[0]!.tags.map((t) => t.slug)).toEqual(['rust'])
    expect(r[0]!.isAiGenerated).toBe(true)
  })

  it('descarta tag inventada que não existe na taxonomia', () => {
    const r = interpretarClassificacao(JSON.stringify({
      itens: [{ i: 0, categoria: 'programming', tipo: 'news', importancia: 0.5, tags: ['rust', 'tag-inventada-pelo-modelo'] }],
    }), ARTIGOS)
    expect(r[0]!.tags.map((t) => t.slug)).toEqual(['rust'])
  })

  it('cai no padrão quando a categoria é inválida', () => {
    const r = interpretarClassificacao(JSON.stringify({
      itens: [{ i: 0, categoria: 'culinaria', tipo: 'receita', importancia: 0.5, tags: [] }],
    }), ARTIGOS)
    expect(r[0]!.category).toBe('technology')
    expect(r[0]!.contentType).toBe('news')
  })

  it('limita a importância a 0..1', () => {
    const r = interpretarClassificacao(JSON.stringify({
      itens: [
        { i: 0, categoria: 'programming', tipo: 'news', importancia: 99, tags: [] },
        { i: 1, categoria: 'programming', tipo: 'news', importancia: -5, tags: [] },
      ],
    }), ARTIGOS)
    expect(r[0]!.importance).toBe(1)
    expect(r[1]!.importance).toBe(0)
  })

  it('usa 0.5 quando a importância não é número', () => {
    const r = interpretarClassificacao(JSON.stringify({
      itens: [{ i: 0, categoria: 'programming', tipo: 'news', importancia: 'muito', tags: [] }],
    }), ARTIGOS)
    expect(r[0]!.importance).toBe(0.5)
  })

  it('devolve vazio em JSON inválido, sem lançar', () => {
    expect(interpretarClassificacao('nao e json', ARTIGOS)).toEqual([])
  })

  it('devolve vazio quando falta o campo itens', () => {
    expect(interpretarClassificacao('{"outra":[]}', ARTIGOS)).toEqual([])
  })

  it('ignora índice que não corresponde a artigo nenhum', () => {
    const r = interpretarClassificacao(JSON.stringify({
      itens: [{ i: 99, categoria: 'programming', tipo: 'news', importancia: 0.5, tags: [] }],
    }), ARTIGOS)
    expect(r).toEqual([])
  })

  it('ignora índice duplicado', () => {
    const r = interpretarClassificacao(JSON.stringify({
      itens: [
        { i: 0, categoria: 'programming', tipo: 'news', importancia: 0.9, tags: [] },
        { i: 0, categoria: 'technology', tipo: 'rumor', importancia: 0.1, tags: [] },
      ],
    }), ARTIGOS)
    expect(r).toHaveLength(1)
    expect(r[0]!.importance).toBe(0.9)
  })
})

describe('GeminiProvider', () => {
  const URL_GERAR =
    'POST https://generativelanguage.googleapis.com/v1beta/models/gemini-teste:generateContent?key=chave-de-teste'

  it('classifica usando a resposta do modelo', async () => {
    const p = provedor({
      [URL_GERAR]: {
        body: respostaGemini({
          itens: [
            { i: 0, categoria: 'programming', tipo: 'announcement', importancia: 0.9, tags: ['rust'] },
            { i: 1, categoria: 'technology', tipo: 'announcement', importancia: 0.8, tags: ['gpu'] },
          ],
        }),
      },
    })
    const r = await p.classifyBatch(ARTIGOS)
    expect(r).toHaveLength(2)
    expect(r[0]!.importance).toBe(0.9)
  })

  it('cai na heurística quando o modelo devolve lixo', async () => {
    const p = provedor({
      [URL_GERAR]: { body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'nao e json' }] } }] }) },
    })
    const r = await p.classifyBatch(ARTIGOS)
    // Não quebrou: veio classificação para os dois, só que heurística.
    expect(r).toHaveLength(2)
    expect(r[0]!.articleId).toBe('a1')
  })

  it('cai na heurística quando a cota acabou, sem tocar na rede', async () => {
    const gov = new GovernadorDeCota(fakeClock(), { porMinuto: 1, porDia: 1, margem: 1 })
    gov.registrar()
    const http = { get: vi.fn() }
    const p = new GeminiProvider({
      http: http as never, logger: silentLogger,
      apiKey: 'k', model: 'm', governador: gov,
    })

    const r = await p.classifyBatch(ARTIGOS)
    expect(r).toHaveLength(2)
    expect(http.get).not.toHaveBeenCalled()
  })

  it('cai na heurística em erro HTTP de cliente', async () => {
    const p = provedor({ [URL_GERAR]: { body: '{"error":{"code":400}}', status: 400 } })
    const r = await p.classifyBatch(ARTIGOS)
    expect(r).toHaveLength(2)
  })

  it('lote vazio não faz requisição', async () => {
    const http = { get: vi.fn() }
    const p = new GeminiProvider({
      http: http as never, logger: silentLogger,
      apiKey: 'k', model: 'm', governador: new GovernadorDeCota(fakeClock()),
    })
    expect(await p.classifyBatch([])).toEqual([])
    expect(http.get).not.toHaveBeenCalled()
  })

  it('resume usando o modelo', async () => {
    const p = provedor({
      [URL_GERAR]: {
        body: respostaGemini({ resumo: 'O Rust 1.90 melhora o borrow checker.', pontos: ['a', 'b'] }),
      },
    })
    const s = await p.summarize(ARTIGOS[0]!, 'short')
    expect(s.text).toBe('O Rust 1.90 melhora o borrow checker.')
    expect(s.provider).toBe('gemini')
    expect(s.isAiGenerated).toBe(true)
  })

  it('o resumo da heurística também vem rotulado como gerado', async () => {
    const p = provedor({ [URL_GERAR]: { body: '{"error":{}}', status: 500 } })
    const s = await p.summarize(ARTIGOS[0]!, 'short')
    expect(s.isAiGenerated).toBe(true)
    expect(s.provider).toBe('heuristic')
  })

  it('registra o consumo de tokens para o painel', async () => {
    const usos: Array<{ requisicoes: number; tokensEntrada: number; tokensSaida: number }> = []
    const p = new GeminiProvider({
      http: fakeHttp({
        [URL_GERAR]: { body: respostaGemini({ itens: [{ i: 0, categoria: 'programming', tipo: 'news', importancia: 0.5, tags: [] }] }) },
      }),
      logger: silentLogger, apiKey: 'chave-de-teste', model: 'gemini-teste',
      governador: new GovernadorDeCota(fakeClock()),
      aoUsar: (u) => usos.push(u),
    })

    await p.classifyBatch([ARTIGOS[0]!])
    expect(usos).toHaveLength(1)
    expect(usos[0]!.tokensEntrada).toBe(500)
    expect(usos[0]!.tokensSaida).toBe(100)
  })

  it('listModels devolve só os que geram conteúdo', async () => {
    const p = provedor({
      'https://generativelanguage.googleapis.com/v1beta/models?key=chave-de-teste': {
        body: JSON.stringify({
          models: [
            { name: 'models/gemini-x', displayName: 'Gemini X', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/embed-y', displayName: 'Embed Y', supportedGenerationMethods: ['embedContent'] },
          ],
        }),
      },
    })
    const m = await p.listModels()
    expect(m).toHaveLength(1)
    expect(m[0]!.id).toBe('gemini-x')
  })

  it('listModels devolve vazio em erro, sem lançar', async () => {
    const p = provedor({
      'https://generativelanguage.googleapis.com/v1beta/models?key=chave-de-teste': {
        body: 'erro', status: 403,
      },
    })
    expect(await p.listModels()).toEqual([])
  })
})
