import type { Category, ContentType } from '../types.js'

export interface ArticleForAI {
  id: string
  title: string
  excerpt: string
  contentText: string
  sourceTrust: number
  categoryHint: Category | null
  /** Idioma detectado. Usado para decidir se vale traduzir. */
  lang?: string
}

export interface Classification {
  articleId: string
  category: Category
  contentType: ContentType
  importance: number
  tags: Array<{ slug: string; confidence: number }>
  /**
   * Título e resumo em português, quando o artigo está em outro idioma.
   * Ausente quando o artigo já está em português ou quando não há IA
   * disponível — a interface então mostra o original, sem rótulo falso.
   */
  translation?: { title: string; excerpt: string }
  /** Sempre true: nenhuma saída automática é exibida sem rótulo. */
  isAiGenerated: true
}

export interface Summary {
  text: string
  keyPoints: string[]
  provider: string
  model: string
  isAiGenerated: true
}

export interface ModelInfo {
  id: string
  name: string
}

/**
 * Contrato da camada de IA. O GeminiProvider da Fase 5 implementa esta
 * mesma interface; o HeuristicProvider é a rede de segurança que mantém
 * o app funcional sem chave, sem cota e sem internet.
 */
export interface Traducao {
  title: string
  excerpt: string
  contentText: string | null
  provider: string
  model: string
}

export interface AIProvider {
  readonly name: string
  listModels(): Promise<ModelInfo[]>
  classifyBatch(articles: ArticleForAI[]): Promise<Classification[]>
  summarize(article: ArticleForAI, kind: 'short' | 'deep'): Promise<Summary>
  /**
   * Traduz o artigo completo para português. Devolve null quando não há
   * como traduzir — sem chave, sem cota ou sem internet. O chamador então
   * mantém o original, sem rotular nada de tradução.
   */
  translate(article: ArticleForAI): Promise<Traducao | null>
}
