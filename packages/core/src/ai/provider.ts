import type { Category, ContentType } from '../types.js'

export interface ArticleForAI {
  id: string
  title: string
  excerpt: string
  contentText: string
  sourceTrust: number
  categoryHint: Category | null
}

export interface Classification {
  articleId: string
  category: Category
  contentType: ContentType
  importance: number
  tags: Array<{ slug: string; confidence: number }>
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
export interface AIProvider {
  readonly name: string
  listModels(): Promise<ModelInfo[]>
  classifyBatch(articles: ArticleForAI[]): Promise<Classification[]>
  summarize(article: ArticleForAI, kind: 'short' | 'deep'): Promise<Summary>
}
