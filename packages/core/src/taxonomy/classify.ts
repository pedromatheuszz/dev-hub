import { tokenize } from '../dedup/simhash.js'
import type { Category, ContentType } from '../types.js'
import { TAG_DICTIONARY } from './dictionary.js'

const PESO_TITULO = 3
const PESO_CORPO = 1
/** Normalizador: acerto de título único já dá confiança respeitável. */
const SATURACAO = 6

/** Índice termo -> slugs, montado uma vez. */
const INDICE = new Map<string, string[]>()
for (const tag of TAG_DICTIONARY) {
  for (const termo of tag.terms) {
    const lista = INDICE.get(termo)
    if (lista) lista.push(tag.slug)
    else INDICE.set(termo, [tag.slug])
  }
}

const POR_SLUG = new Map(TAG_DICTIONARY.map((t) => [t.slug, t]))

export function tagsOf(
  title: string,
  text: string,
): Array<{ slug: string; confidence: number }> {
  const pontos = new Map<string, number>()

  // tokenize() já quebra em palavras inteiras, então "governo" nunca
  // casa com o termo "go" — o casamento é por token, não por substring.
  const tokensTitulo = new Set(tokenize(title))
  for (const token of tokensTitulo) {
    for (const slug of INDICE.get(token) ?? []) {
      pontos.set(slug, (pontos.get(slug) ?? 0) + PESO_TITULO)
    }
  }
  for (const token of new Set(tokenize(text))) {
    if (tokensTitulo.has(token)) continue
    for (const slug of INDICE.get(token) ?? []) {
      pontos.set(slug, (pontos.get(slug) ?? 0) + PESO_CORPO)
    }
  }

  return [...pontos.entries()]
    .map(([slug, p]) => ({ slug, confidence: Math.min(1, p / SATURACAO) }))
    .sort((a, b) => b.confidence - a.confidence || a.slug.localeCompare(b.slug))
}

export function categoryOf(
  title: string,
  text: string,
  hint: Category | null,
): Category {
  const tags = tagsOf(title, text)
  if (tags.length === 0) return hint ?? 'technology'

  const soma: Record<Category, number> = { technology: 0, programming: 0, innovation: 0 }
  for (const { slug, confidence } of tags) {
    const def = POR_SLUG.get(slug)
    if (def) soma[def.category] += confidence
  }

  // O hint da fonte entra como voto leve, não como decisão.
  if (hint) soma[hint] += 0.25

  let vencedora: Category = 'technology'
  for (const c of ['technology', 'programming', 'innovation'] as const) {
    if (soma[c] > soma[vencedora]) vencedora = c
  }
  return vencedora
}

/** Ordem importa: um rumor sobre um anúncio continua sendo rumor. */
const PADROES: Array<[ContentType, RegExp]> = [
  ['rumor', /\b(rumou?red|rumou?rs?|reportedly|leak(ed|s)?|allegedly|supostamente|vazou)\b/i],
  ['opinion', /\b(opinion|why i|i think|unpopular|rant|should stop|opiniao|por que eu)\b/i],
  ['analysis', /\b(deep dive|analysis|explained|benchmark|comparison|review|analise|comparativo)\b/i],
  ['announcement', /\b(announc\w*|introduc\w*|releas\w*|launch\w*|unveil\w*|now available|ships?|anuncia|lanca\w*|apresenta)\b/i],
  ['report', /\b(report|study|survey|research finds|relatorio|estudo|pesquisa aponta)\b/i],
]

/**
 * Remove acentos e a cedilha antes de casar os padrões. Sem isso,
 * "lançado" não casa com /lanca\w*​/ e o \b do JavaScript, que é baseado
 * em ASCII, trata "ç" como fronteira de palavra.
 */
function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function contentTypeOf(title: string, text: string): ContentType {
  const alvo = semAcento(`${title} ${text.slice(0, 400)}`)
  for (const [tipo, padrao] of PADROES) {
    if (padrao.test(alvo)) return tipo
  }
  return 'news'
}
