import { describe, expect, it } from 'vitest'
import type { RawFeedItem, Source } from '../types.js'
import { normalizeItem } from './article.js'
import { parseFeedDate } from './dates.js'
import { htmlToText, sanitizeHtml } from './html.js'
import { canonicalizeUrl, stableId } from './urls.js'

describe('htmlToText', () => {
  it('extrai texto e descarta marcação', () => {
    expect(htmlToText('<p>Olá <b>mundo</b></p>')).toBe('Olá mundo')
  })
  it('remove script e style inteiros, não só as tags', () => {
    expect(htmlToText('<p>a</p><script>alert(1)</script><style>p{}</style><p>b</p>'))
      .toBe('a b')
  })
  it('separa blocos com espaço em vez de colar palavras', () => {
    expect(htmlToText('<div>um</div><div>dois</div>')).toBe('um dois')
  })
  it('decodifica entidades', () => {
    expect(htmlToText('<p>caf&eacute; &amp; c&oacute;digo</p>')).toBe('café & código')
  })
  it('devolve string vazia em entrada vazia', () => {
    expect(htmlToText('')).toBe('')
  })
})

describe('sanitizeHtml', () => {
  it('mantém tags da allowlist', () => {
    expect(sanitizeHtml('<p>oi <strong>tudo</strong></p>')).toBe('<p>oi <strong>tudo</strong></p>')
  })
  it('remove script com o conteúdo', () => {
    expect(sanitizeHtml('<p>a</p><script>roubar()</script>')).toBe('<p>a</p>')
  })
  it('remove atributos de evento', () => {
    expect(sanitizeHtml('<p onclick="x()">a</p>')).toBe('<p>a</p>')
  })
  it('remove href javascript:', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
  })
  it('preserva href http e https', () => {
    expect(sanitizeHtml('<a href="https://a.com">x</a>')).toBe('<a href="https://a.com">x</a>')
  })
})

describe('parseFeedDate', () => {
  // O fallback representa "agora". Datas de feed mais de um ano à frente
  // dele são rejeitadas, então ele precisa ser posterior aos artigos.
  const FALLBACK = Date.UTC(2026, 8, 13)

  it('entende RFC 822 do RSS', () => {
    expect(parseFeedDate('Mon, 08 Sep 2026 14:30:00 GMT', FALLBACK))
      .toBe(Date.UTC(2026, 8, 8, 14, 30, 0))
  })
  it('entende ISO 8601 do Atom', () => {
    expect(parseFeedDate('2026-09-07T10:00:00Z', FALLBACK))
      .toBe(Date.UTC(2026, 8, 7, 10, 0, 0))
  })
  it('usa o fallback quando a data é nula', () => {
    expect(parseFeedDate(null, FALLBACK)).toBe(FALLBACK)
  })
  it('usa o fallback quando a data é lixo', () => {
    expect(parseFeedDate('ontem à tarde', FALLBACK)).toBe(FALLBACK)
  })
  it('não aceita data no futuro distante — usa o fallback', () => {
    expect(parseFeedDate('2199-01-01T00:00:00Z', FALLBACK)).toBe(FALLBACK)
  })
})

describe('canonicalizeUrl', () => {
  it('remove parâmetros de rastreamento', () => {
    expect(canonicalizeUrl('https://a.dev/p?utm_source=rss&utm_medium=x&id=7'))
      .toBe('https://a.dev/p?id=7')
  })
  it('remove fbclid e gclid', () => {
    expect(canonicalizeUrl('https://a.dev/p?fbclid=abc&gclid=def')).toBe('https://a.dev/p')
  })
  it('normaliza host para minúsculas e remove barra final', () => {
    expect(canonicalizeUrl('https://A.DEV/Post/')).toBe('https://a.dev/Post')
  })
  it('remove o fragmento', () => {
    expect(canonicalizeUrl('https://a.dev/p#secao')).toBe('https://a.dev/p')
  })
  it('devolve a entrada intacta se não for URL válida', () => {
    expect(canonicalizeUrl('nao-e-url')).toBe('nao-e-url')
  })
})

describe('stableId', () => {
  it('é determinístico', () => {
    expect(stableId('https://a.dev/p')).toBe(stableId('https://a.dev/p'))
  })
  it('difere para URLs diferentes', () => {
    expect(stableId('https://a.dev/p')).not.toBe(stableId('https://a.dev/q'))
  })
})

describe('normalizeItem', () => {
  const fonte: Source = {
    id: 'src1', name: 'Exemplo', url: 'https://a.dev', feedUrl: 'https://a.dev/feed',
    kind: 'news', trustWeight: 0.75, categoryHint: null, active: true,
    lastFetchedAt: null, etag: null, lastModified: null,
  }
  const item: RawFeedItem = {
    title: '  Rust 1.90 lançado  ',
    link: 'https://a.dev/rust?utm_source=rss',
    author: 'Ana', publishedAt: '2026-09-08T14:30:00Z',
    summary: '<p>Resumo com <b>html</b></p>',
    contentHtml: `<p>${'palavra '.repeat(440)}</p>`,
    imageUrl: null, guid: 'g1',
  }
  const NOW = Date.UTC(2026, 8, 13)
  const a = normalizeItem(item, fonte, NOW)

  it('apara o título', () => expect(a.title).toBe('Rust 1.90 lançado'))

  it('decodifica entidade HTML deixada por feed com escape duplo', () => {
    const d = normalizeItem(
      { ...item, title: 'What&#8217;s behind the AI industry&#8217;s boom' },
      fonte, NOW,
    )
    expect(d.title).toBe('What’s behind the AI industry’s boom')
  })

  it('decodifica entidades nomeadas no título', () => {
    const d = normalizeItem({ ...item, title: 'Rust &amp; Go: C&#43;&#43; rivals' }, fonte, NOW)
    expect(d.title).toBe('Rust & Go: C++ rivals')
  })

  it('remove marcação solta que venha no título', () => {
    const d = normalizeItem({ ...item, title: '<b>Kubernetes</b> 1.37' }, fonte, NOW)
    expect(d.title).toBe('Kubernetes 1.37')
  })
  it('canonicaliza a URL e mantém a original', () => {
    expect(a.canonicalUrl).toBe('https://a.dev/rust')
    expect(a.url).toBe('https://a.dev/rust?utm_source=rss')
  })
  it('deriva o id do canonicalUrl', () => {
    expect(a.id).toBe(stableId('https://a.dev/rust'))
  })
  it('converte o conteúdo em texto puro', () => {
    expect(a.contentText).not.toContain('<p>')
    expect(a.contentText.startsWith('palavra')).toBe(true)
  })
  it('gera excerpt a partir do summary, sem html', () => {
    expect(a.excerpt).toBe('Resumo com html')
  })
  it('conta palavras e calcula o tempo de leitura a 220 ppm', () => {
    expect(a.wordCount).toBe(440)
    expect(a.readingMinutes).toBe(2)
  })
  it('usa o relógio injetado como fetchedAt', () => {
    expect(a.fetchedAt).toBe(NOW)
  })
  it('tempo de leitura é no mínimo 1 minuto', () => {
    const curto = normalizeItem({ ...item, contentHtml: '<p>oi</p>' }, fonte, NOW)
    expect(curto.readingMinutes).toBe(1)
  })
})
