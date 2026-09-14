import { tokenize } from '../dedup/simhash.js'

/**
 * Detecção de idioma por palavras funcionais.
 *
 * Não precisa ser um detector geral: o Dev Hub só precisa saber se o artigo
 * já está em português ou se vale traduzir. Palavras funcionais são o sinal
 * mais barato e mais estável para isso — aparecem em qualquer texto do
 * idioma, independentemente do assunto, e um artigo técnico em inglês
 * continua cheio de "the" e "of" mesmo falando de Rust e Kubernetes.
 */

export type Idioma = 'pt' | 'en' | 'es' | 'desconhecido'

const FUNCIONAIS: Record<'pt' | 'en' | 'es', Set<string>> = {
  pt: new Set([
    'de', 'da', 'do', 'das', 'dos', 'que', 'para', 'com', 'uma', 'um', 'nao',
    'mais', 'como', 'mas', 'por', 'seu', 'sua', 'ou', 'ser', 'quando', 'muito',
    'ja', 'esta', 'estao', 'tambem', 'so', 'pelo', 'pela', 'ate', 'isso',
    'ele', 'ela', 'entre', 'era', 'depois', 'sem', 'mesmo', 'aos', 'ter',
    'quem', 'nas', 'nos', 'esse', 'eles', 'voce', 'essa', 'foi', 'sao',
    'tem', 'os', 'as', 'no', 'na', 'em', 'ao', 'e', 'nova', 'novo', 'agora',
  ]),
  en: new Set([
    'the', 'of', 'and', 'to', 'in', 'is', 'that', 'for', 'it', 'with', 'as',
    'on', 'was', 'be', 'by', 'are', 'this', 'have', 'from', 'or', 'an', 'at',
    'not', 'but', 'which', 'you', 'all', 'can', 'has', 'more', 'will', 'one',
    'we', 'their', 'been', 'if', 'when', 'who', 'would', 'there', 'what',
    'so', 'up', 'out', 'about', 'into', 'than', 'them', 'some', 'could',
    'its', 'only', 'other', 'new', 'also', 'may', 'these', 'after', 'over',
  ]),
  es: new Set([
    'el', 'la', 'los', 'las', 'que', 'de', 'en', 'un', 'una', 'es', 'se',
    'no', 'con', 'por', 'para', 'su', 'sus', 'al', 'lo', 'como', 'mas',
    'pero', 'le', 'ya', 'este', 'esta', 'porque', 'entre', 'cuando', 'muy',
    'sin', 'sobre', 'tambien', 'hasta', 'desde', 'son', 'fue', 'ha', 'hay',
  ]),
}

/** Mínimo de tokens para a contagem significar alguma coisa. */
const TOKENS_MINIMOS = 8

/** Fração mínima de palavras funcionais do idioma vencedor. */
const FRACAO_MINIMA = 0.08

export interface DeteccaoIdioma {
  idioma: Idioma
  confianca: number
}

export function detectarIdioma(texto: string): DeteccaoIdioma {
  const tokens = tokenize(texto)
  if (tokens.length < TOKENS_MINIMOS) return { idioma: 'desconhecido', confianca: 0 }

  const acertos: Record<'pt' | 'en' | 'es', number> = { pt: 0, en: 0, es: 0 }
  for (const t of tokens) {
    if (FUNCIONAIS.pt.has(t)) acertos.pt++
    if (FUNCIONAIS.en.has(t)) acertos.en++
    if (FUNCIONAIS.es.has(t)) acertos.es++
  }

  let vencedor: 'pt' | 'en' | 'es' = 'en'
  for (const k of ['pt', 'en', 'es'] as const) {
    if (acertos[k] > acertos[vencedor]) vencedor = k
  }

  const fracao = acertos[vencedor] / tokens.length
  if (fracao < FRACAO_MINIMA) return { idioma: 'desconhecido', confianca: fracao }

  // Empate entre idiomas irmãos (pt e es compartilham muitas funcionais)
  // resolve por margem: sem margem clara, é melhor admitir que não sabe.
  const segundo = (['pt', 'en', 'es'] as const)
    .filter((k) => k !== vencedor)
    .reduce((a, b) => (acertos[a] >= acertos[b] ? a : b))
  if (acertos[vencedor] === acertos[segundo]) {
    return { idioma: 'desconhecido', confianca: fracao }
  }

  return { idioma: vencedor, confianca: Math.min(1, fracao / 0.25) }
}

/** Precisa de tradução para o português? */
export function precisaTraduzir(idioma: string): boolean {
  return idioma !== 'pt' && idioma !== 'desconhecido'
}
