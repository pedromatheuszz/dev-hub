import { tokenize } from '../dedup/simhash.js'
import { categoryOf, contentTypeOf, tagsOf } from '../taxonomy/classify.js'
import type {
  AIProvider, ArticleForAI, Classification, ModelInfo, Summary,
} from './provider.js'

const MODELO = 'heuristic-v1'
const FRASES_CURTO = 2
const FRASES_FUNDO = 4
const TAMANHO_MINIMO_FRASE = 30

/** Tipos de conteúdo que merecem mais destaque no ranking. */
const PESO_TIPO: Record<string, number> = {
  announcement: 1.0, news: 0.85, report: 0.75,
  analysis: 0.65, opinion: 0.45, rumor: 0.35,
}

function frases(texto: string): string[] {
  return texto
    .split(/(?<=[.!?])\s+/)
    .map((f) => f.trim())
    .filter((f) => f.length >= TAMANHO_MINIMO_FRASE)
}

/**
 * Resumo extrativo: pontua cada frase pela sobreposição com o título e
 * por posição (início do texto vale mais), devolve as melhores na ordem
 * original. Não inventa texto — todo trecho existe no artigo.
 */
function extrair(title: string, texto: string, quantas: number): string[] {
  const candidatas = frases(texto)
  if (candidatas.length === 0) return []

  const termosTitulo = new Set(tokenize(title))
  const pontuadas = candidatas.map((frase, indice) => {
    const tokens = tokenize(frase)
    let acertos = 0
    for (const t of new Set(tokens)) if (termosTitulo.has(t)) acertos++
    const relevancia = tokens.length > 0 ? acertos / Math.sqrt(tokens.length) : 0
    const posicao = 1 / (1 + indice * 0.35)
    return { frase, indice, pontos: relevancia + posicao * 0.5 }
  })

  return pontuadas
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, quantas)
    .sort((a, b) => a.indice - b.indice) // devolve na ordem do artigo
    .map((p) => p.frase)
}

export class HeuristicProvider implements AIProvider {
  readonly name = 'heuristic'

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: MODELO, name: 'Heurística local (sem IA)' }]
  }

  async classifyBatch(articles: ArticleForAI[]): Promise<Classification[]> {
    return articles.map((a) => {
      const corpo = a.contentText || a.excerpt
      const tags = tagsOf(a.title, corpo)
      const contentType = contentTypeOf(a.title, corpo)

      // Importância = confiança da fonte x peso do tipo x densidade de tags.
      const densidade = Math.min(1, tags.reduce((s, t) => s + t.confidence, 0) / 3)
      const importance = Math.min(
        1,
        a.sourceTrust * (PESO_TIPO[contentType] ?? 0.6) * (0.5 + densidade * 0.5),
      )

      return {
        articleId: a.id,
        category: categoryOf(a.title, corpo, a.categoryHint),
        contentType,
        importance,
        tags: tags.slice(0, 8),
        isAiGenerated: true,
      }
    })
  }

  async summarize(article: ArticleForAI, kind: 'short' | 'deep'): Promise<Summary> {
    const corpo = article.contentText || article.excerpt
    const quantas = kind === 'deep' ? FRASES_FUNDO : FRASES_CURTO
    const escolhidas = extrair(article.title, corpo, quantas)

    return {
      text: escolhidas.join(' '),
      keyPoints: escolhidas,
      provider: this.name,
      model: MODELO,
      isAiGenerated: true,
    }
  }
}
