import { tokenize } from '../dedup/simhash.js'
import type { Category, ContentType } from '../types.js'
import { TAG_DICTIONARY } from './dictionary.js'

const PESO_TITULO = 3
/** Teto da contribuição do corpo, para um termo repetido 30x não dominar. */
const TETO_CORPO = 3
/** Normalizador: acerto de título único já dá confiança respeitável. */
const SATURACAO = 6

/**
 * Confiança mínima para uma tag valer.
 *
 * Medido em artigos reais, UMA ocorrência no corpo é exatamente a
 * assinatura do ruído, e tudo que é legítimo aparece duas ou mais vezes:
 *
 *   "AMD's best gaming CPU"      ryzen x8, amd x4, cpu x2 | intel x1, testing x1
 *   "Chrome to ARM64 Linux"      chrome x13, linux x5, arm x3 | windows x1
 *
 * Antes deste limiar, 1542 de 2707 tags (57%) vinham de menção única — e
 * eram coisas como "linux" num artigo sobre a primeira pilha elétrica.
 */
export const CONFIANCA_MINIMA_TAG = 0.3

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
  const doTitulo = new Map<string, number>()
  const doCorpo = new Map<string, number>()

  // tokenize() já quebra em palavras inteiras, então "governo" nunca
  // casa com o termo "go" — o casamento é por token, não por substring.
  const tokensTitulo = new Set(tokenize(title))
  for (const token of tokensTitulo) {
    for (const slug of INDICE.get(token) ?? []) {
      doTitulo.set(slug, (doTitulo.get(slug) ?? 0) + PESO_TITULO)
    }
  }

  // No corpo contamos OCORRÊNCIAS, não termos distintos: é a repetição que
  // separa o assunto do artigo de uma comparação de passagem.
  for (const token of tokenize(text)) {
    if (tokensTitulo.has(token)) continue
    for (const slug of INDICE.get(token) ?? []) {
      doCorpo.set(slug, (doCorpo.get(slug) ?? 0) + 1)
    }
  }

  const slugs = new Set([...doTitulo.keys(), ...doCorpo.keys()])

  return [...slugs]
    .map((slug) => {
      const pontos = (doTitulo.get(slug) ?? 0)
        + Math.min(TETO_CORPO, doCorpo.get(slug) ?? 0)
      return { slug, confidence: Math.min(1, pontos / SATURACAO) }
    })
    .filter((t) => t.confidence >= CONFIANCA_MINIMA_TAG)
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
