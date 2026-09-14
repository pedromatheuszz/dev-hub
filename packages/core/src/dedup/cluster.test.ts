import { describe, expect, it } from 'vitest'
import { clusterArticles, type ClusterInput } from './cluster.js'
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
