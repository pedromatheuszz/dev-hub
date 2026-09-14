import { describe, expect, it } from 'vitest'
import {
  clusterArticles, versoesConflitam, versoesNoTitulo, type ClusterInput,
} from './cluster.js'
import { simhash } from './simhash.js'

function entrada(id: string, title: string, publishedAt = 1000): ClusterInput {
  return { id, title, simhash: simhash(title), publishedAt }
}

describe('clusterArticles', () => {
  it('artigo único vira cluster de um membro', () => {
    const c = clusterArticles([entrada('a', 'NVIDIA anuncia GPU nova')])
    expect(c).toHaveLength(1)
    expect(c[0]!.members).toEqual(['a'])
    expect(c[0]!.primaryId).toBe('a')
  })

  it('títulos idênticos entram no mesmo cluster', () => {
    const t = 'Rust 1.90 lancado com melhorias no borrow checker'
    const c = clusterArticles([entrada('a', t), entrada('b', t)])
    expect(c).toHaveLength(1)
    expect(c[0]!.members.sort()).toEqual(['a', 'b'])
  })

  it('títulos sem relação ficam em clusters separados', () => {
    const c = clusterArticles([
      entrada('a', 'NVIDIA anuncia GPU nova para data centers'),
      entrada('b', 'Receita de bolo de cenoura com cobertura'),
    ])
    expect(c).toHaveLength(2)
  })

  it('agrupamento é transitivo: a~b e b~c colocam a, b e c juntos', () => {
    const base = 'Kubernetes 1.35 traz melhorias de escalonamento no scheduler'
    const c = clusterArticles([
      entrada('a', base),
      entrada('b', `${base} padrao`),
      entrada('c', `${base} padrao hoje`),
    ])
    expect(c).toHaveLength(1)
    expect(c[0]!.members).toHaveLength(3)
  })

  it('o primário é o artigo publicado primeiro', () => {
    const t = 'Python 3.15 entra em beta com free-threading estavel'
    const c = clusterArticles([entrada('tarde', t, 5000), entrada('cedo', t, 1000)])
    expect(c[0]!.primaryId).toBe('cedo')
  })

  it('registra pares da zona cinzenta para a IA resolver depois', () => {
    const c = clusterArticles([
      entrada('a', 'Apple lanca chip M5 com nova arquitetura de GPU integrada'),
      entrada('b', 'Apple apresenta o M5: arquitetura de GPU redesenhada e mais nucleos'),
    ])
    const cinzas = c.flatMap((x) => x.grayPairs)
    // Ou entraram no mesmo cluster, ou ficaram registrados como duvidosos.
    expect(c.length === 1 || cinzas.length > 0).toBe(true)
  })

  it('lista vazia devolve lista vazia', () => {
    expect(clusterArticles([])).toEqual([])
  })

  it('é determinístico na ordem dos clusters', () => {
    const itens = [
      entrada('z', 'Docker melhora build cache em camadas'),
      entrada('a', 'Go 1.26 reduz pausas do coletor de lixo'),
    ]
    const um = clusterArticles(itens).map((c) => c.primaryId)
    const dois = clusterArticles(itens).map((c) => c.primaryId)
    expect(um).toEqual(dois)
  })
})

describe('versoes no titulo', () => {
  it('extrai versao com ponto', () => {
    expect(versoesNoTitulo('Node.js 26.8.1 (Current)')).toEqual(new Set(['26_8_1']))
  })
  it('extrai versao com v', () => {
    expect(versoesNoTitulo('Node.js v12 to v14')).toEqual(new Set(['v12', 'v14']))
  })
  it('extrai qualificador de release', () => {
    expect(versoesNoTitulo('Linux 7.3-rc3 Released')).toEqual(new Set(['7_3', 'rc3']))
  })
  it('nao confunde ano com versao', () => {
    expect(versoesNoTitulo('Retrospectiva 2026 da web')).toEqual(new Set())
  })
  it('nao confunde numero solto com versao', () => {
    expect(versoesNoTitulo('12 dicas de performance')).toEqual(new Set())
  })

  it('captura qualificador separado por espaco', () => {
    expect(versoesNoTitulo('Python 3.15.0 alpha 4')).toEqual(new Set(['3_15_0', 'alpha_4']))
  })

  it('captura release candidate por extenso', () => {
    expect(versoesNoTitulo('Python 3.15.0 candidate 2 is here')).toEqual(
      new Set(['3_15_0', 'candidate_2']),
    )
  })

  it('nao inventa versao quando o qualificador nao vem seguido de numero', () => {
    expect(versoesNoTitulo('O canal beta do Chrome mudou')).toEqual(new Set())
  })
})

describe('versoesConflitam', () => {
  it('versoes diferentes conflitam', () => {
    expect(versoesConflitam(new Set(['26_8_0']), new Set(['26_8_1']))).toBe(true)
  })
  it('versoes iguais nao conflitam', () => {
    expect(versoesConflitam(new Set(['1_90']), new Set(['1_90']))).toBe(false)
  })
  it('conjuntos que so se sobrepoem em parte conflitam', () => {
    expect(versoesConflitam(new Set(['v12', 'v14']), new Set(['v14', 'v16']))).toBe(true)
  })
  it('nao decide quando um dos lados nao cita versao', () => {
    expect(versoesConflitam(new Set(['1_90']), new Set())).toBe(false)
    expect(versoesConflitam(new Set(), new Set())).toBe(false)
  })
})

describe('clusterArticles - releases diferentes', () => {
  it('nao agrupa dois patches proximos do mesmo produto', () => {
    const c = clusterArticles([
      entrada('a', 'Node.js 26.8.0 (Current)', 1000),
      entrada('b', 'Node.js 26.8.1 (Current)', 2000),
    ])
    expect(c).toHaveLength(2)
  })

  it('nao encadeia guias de migracao em cadeia', () => {
    const c = clusterArticles([
      entrada('a', 'Node.js v12 to v14', 1000),
      entrada('b', 'Node.js v14 to v16', 2000),
      entrada('c', 'Node.js v16 to v18', 3000),
    ])
    expect(c).toHaveLength(3)
  })

  it('nao agrupa release candidates consecutivos', () => {
    const c = clusterArticles([
      entrada('a', 'Linux 7.3-rc3 Released', 1000),
      entrada('b', 'Linux 7.3-rc4 Released', 2000),
    ])
    expect(c).toHaveLength(2)
  })

  it('ainda agrupa duas fontes cobrindo o MESMO release', () => {
    const c = clusterArticles([
      entrada('a', 'Rust 1.90 lancado com melhorias no borrow checker', 1000),
      entrada('b', 'Rust 1.90 lancado com melhorias no borrow checker hoje', 2000),
    ])
    expect(c).toHaveLength(1)
  })

  it('nao agrupa alphas consecutivos do mesmo produto', () => {
    const c = clusterArticles([
      entrada('a', 'Python 3.15.0 alpha 4', 1000),
      entrada('b', 'Python 3.15.0 alpha 5 (yes, another alpha!)', 2000),
    ])
    expect(c).toHaveLength(2)
  })

  it('registra o par de versoes conflitantes como duvidoso para a IA', () => {
    const c = clusterArticles([
      entrada('a', 'Node.js 26.8.0 (Current)', 1000),
      entrada('b', 'Node.js 26.8.1 (Current)', 2000),
    ])
    expect(c.flatMap((x) => x.grayPairs).length).toBeGreaterThan(0)
  })
})
