import { describe, expect, it } from 'vitest'
import { CONFIANCA_MINIMA_TAG, categoryOf, contentTypeOf, tagsOf } from './classify.js'
import { TAG_DICTIONARY } from './dictionary.js'

describe('TAG_DICTIONARY', () => {
  it('não tem slugs duplicados', () => {
    const slugs = TAG_DICTIONARY.map((t) => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
  it('cobre as três categorias do spec', () => {
    const cats = new Set(TAG_DICTIONARY.map((t) => t.category))
    expect(cats).toEqual(new Set(['technology', 'programming', 'innovation']))
  })
  it('todo termo está em minúsculas e sem acento', () => {
    for (const tag of TAG_DICTIONARY) {
      for (const termo of tag.terms) {
        expect(termo).toBe(termo.toLowerCase())
        expect(termo.normalize('NFD')).toBe(termo)
      }
    }
  })
})

describe('tagsOf', () => {
  it('encontra a linguagem no título', () => {
    const tags = tagsOf('Rust 1.90 lançado', 'Novidades do compilador')
    expect(tags.map((t) => t.slug)).toContain('rust')
  })
  it('encontra framework e linguagem quando ambos tem sinal forte', () => {
    const slugs = tagsOf(
      'React 20 com novo compilador',
      'Escrito em TypeScript. O TypeScript novo tipa melhor. Veja o typescript.',
    ).map((t) => t.slug)
    expect(slugs).toContain('react')
    expect(slugs).toContain('typescript')
  })

  // Medido sobre 2707 tags reais: mencao unica no corpo era 57% do total e
  // quase tudo ruido - "linux" num artigo sobre a primeira pilha eletrica,
  // "windows" num sobre DynamoDB, "cpu" num sobre texto alternativo.
  it('descarta mencao de passagem unica no corpo', () => {
    const slugs = tagsOf(
      'AMD lanca o melhor CPU para jogos',
      'O Ryzen 9850X3D lidera nossos jogos, um pouco acima do concorrente Intel.',
    ).map((t) => t.slug)
    expect(slugs).toContain('amd')
    expect(slugs).toContain('cpu')
    expect(slugs).not.toContain('intel')
  })

  it('duas mencoes no corpo bastam para valer a tag', () => {
    const slugs = tagsOf(
      'Rodando containers em producao',
      'Usamos docker e podman lado a lado no cluster.',
    ).map((t) => t.slug)
    expect(slugs).toContain('docker')
  })

  it('nenhuma tag fica abaixo do limiar de confianca', () => {
    for (const t of tagsOf('Kubernetes e Docker', 'Falamos de python e rust tambem')) {
      expect(t.confidence).toBeGreaterThanOrEqual(CONFIANCA_MINIMA_TAG)
    }
  })
  it('dá confiança maior para acerto no título', () => {
    const noTitulo = tagsOf('Kubernetes escala melhor', 'texto neutro')
      .find((t) => t.slug === 'kubernetes')!
    const noCorpo = tagsOf('Texto neutro', 'Kubernetes escala. O kubernetes ajuda.')
      .find((t) => t.slug === 'kubernetes')!
    expect(noTitulo.confidence).toBeGreaterThan(noCorpo.confidence)
  })

  it('repetição no corpo eleva a confiança', () => {
    const uma = tagsOf('Artigo neutro', 'Falamos de rust aqui. E de outras coisas.')
    const varias = tagsOf('Artigo neutro', 'rust rust rust e mais rust no projeto')
    expect(uma.find((t) => t.slug === 'rust')).toBeUndefined()
    expect(varias.find((t) => t.slug === 'rust')!.confidence).toBeGreaterThanOrEqual(0.5)
  })
  it('ordena por confiança decrescente', () => {
    const tags = tagsOf('NVIDIA GPU nova', 'A GPU da NVIDIA usa CUDA e roda Python')
    for (let i = 1; i < tags.length; i++) {
      expect(tags[i - 1]!.confidence).toBeGreaterThanOrEqual(tags[i]!.confidence)
    }
  })
  it('devolve lista vazia sem acertos', () => {
    expect(tagsOf('Bolo de cenoura', 'Bata os ovos')).toEqual([])
  })
  it('não confunde "go" dentro de outra palavra', () => {
    const slugs = tagsOf('Google anuncia algo', 'O governo aprovou').map((t) => t.slug)
    expect(slugs).not.toContain('go')
  })
})

describe('categoryOf', () => {
  it('classifica linguagem como programming', () => {
    expect(categoryOf('Rust 1.90 lançado', 'borrow checker', null)).toBe('programming')
  })
  it('classifica hardware como technology', () => {
    expect(categoryOf('NVIDIA lança GPU', 'mais memória HBM', null)).toBe('technology')
  })
  it('usa o hint da fonte no empate sem acertos', () => {
    expect(categoryOf('Texto neutro', 'sem termos', 'innovation')).toBe('innovation')
  })
  it('cai em technology quando não há acerto nem hint', () => {
    expect(categoryOf('Texto neutro', 'sem termos', null)).toBe('technology')
  })
})

describe('contentTypeOf', () => {
  it('detecta anúncio oficial', () => {
    expect(contentTypeOf('Google announces Gemini update', '')).toBe('announcement')
  })
  it('detecta lançamento como anúncio', () => {
    expect(contentTypeOf('Rust 1.90 released', 'changelog completo')).toBe('announcement')
  })
  it('detecta rumor', () => {
    expect(contentTypeOf('Apple reportedly working on new chip', '')).toBe('rumor')
  })
  it('detecta opinião', () => {
    expect(contentTypeOf('Why I stopped using Kubernetes', '')).toBe('opinion')
  })
  it('detecta análise', () => {
    expect(contentTypeOf('Deep dive into the new GPU architecture', '')).toBe('analysis')
  })
  it('cai em news no caso genérico', () => {
    expect(contentTypeOf('NVIDIA GPU chega ao mercado', 'disponível hoje')).toBe('news')
  })
  it('rumor tem precedência sobre anúncio no mesmo título', () => {
    expect(contentTypeOf('Apple reportedly announces new chip', '')).toBe('rumor')
  })
})
