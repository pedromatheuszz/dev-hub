import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fakeClock, fakeHttp, fakePlatform } from './testing/fakes.js'

describe('fakes de plataforma', () => {
  it('o relógio falso avança de forma determinística', () => {
    const c = fakeClock(1000)
    expect(c.now()).toBe(1000)
    c.advance(500)
    expect(c.now()).toBe(1500)
  })

  it('o http falso devolve a rota registrada', async () => {
    const http = fakeHttp({ 'https://a.com/feed': { body: '<rss/>' } })
    const res = await http.get({ url: 'https://a.com/feed' })
    expect(res.status).toBe(200)
    expect(res.body).toBe('<rss/>')
  })

  it('o http falso lança em rota desconhecida', async () => {
    const http = fakeHttp({})
    await expect(http.get({ url: 'https://x.com' })).rejects.toThrow('rota não registrada')
  })

  it('fakePlatform monta uma plataforma completa', () => {
    const p = fakePlatform()
    expect(typeof p.clock.now()).toBe('number')
  })
})

describe('regra de dependência do núcleo', () => {
  // Esta é a guarda arquitetural mais importante do projeto. Se ela cair,
  // o core deixa de rodar no React Native e a Fase 3 quebra.
  const PROIBIDOS = [
    /from\s+['"]node:/, /require\(\s*['"]node:/,
    /\bwindow\./, /\bdocument\./,
    /from\s+['"]electron['"]/, /from\s+['"]react-native['"]/,
    /\bglobalThis\.fetch\b/,
  ]

  function arquivosDeProducao(dir: string, acc: string[] = []): string[] {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome)
      if (statSync(p).isDirectory()) {
        if (nome !== 'testing' && nome !== '__fixtures__') arquivosDeProducao(p, acc)
      } else if (nome.endsWith('.ts') && !nome.endsWith('.test.ts')) {
        acc.push(p)
      }
    }
    return acc
  }

  it('nenhum arquivo de produção do core importa APIs de plataforma', () => {
    const raiz = dirname(fileURLToPath(import.meta.url))
    const violacoes: string[] = []
    for (const arquivo of arquivosDeProducao(raiz)) {
      const texto = readFileSync(arquivo, 'utf8')
      for (const padrao of PROIBIDOS) {
        if (padrao.test(texto)) violacoes.push(`${arquivo}: ${padrao}`)
      }
    }
    expect(violacoes).toEqual([])
  })
})
