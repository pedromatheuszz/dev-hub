export type SourceKind = 'official' | 'news' | 'blog' | 'aggregator' | 'research'
export type Category = 'technology' | 'programming' | 'innovation'
export type ContentType =
  | 'news' | 'announcement' | 'report' | 'rumor' | 'opinion' | 'analysis'
export type TagKind =
  | 'language' | 'framework' | 'hardware' | 'company' | 'topic' | 'product'
export type AiState =
  | 'pending' | 'prefiltered_out' | 'classified' | 'summarized' | 'failed'

export interface Source {
  id: string
  name: string
  url: string
  feedUrl: string
  kind: SourceKind
  trustWeight: number // 0.4 .. 1.0
  categoryHint: Category | null
  active: boolean
  lastFetchedAt: number | null // epoch ms
  etag: string | null
  lastModified: string | null
}

/** O que sai de um parser de feed, antes de qualquer normalização. */
export interface RawFeedItem {
  title: string
  link: string
  author: string | null
  publishedAt: string | null // texto cru do feed
  summary: string | null
  contentHtml: string | null
  imageUrl: string | null
  guid: string | null
}

export interface Article {
  id: string // derivado do canonicalUrl; estável entre execuções
  sourceId: string
  url: string
  canonicalUrl: string
  title: string
  subtitle: string | null
  author: string | null
  publishedAt: number // epoch ms
  fetchedAt: number // epoch ms
  excerpt: string
  contentText: string
  contentHtml: string | null
  imageUrl: string | null
  lang: string
  simhash: string // 16 chars hex
  wordCount: number
  readingMinutes: number
  storyId: string | null
  contentType: ContentType
  aiState: AiState
}

export interface Story {
  id: string
  canonicalTitle: string
  canonicalSummary: string | null
  category: Category
  importance: number // 0 .. 1
  isBreaking: boolean
  firstSeenAt: number
  lastUpdatedAt: number
  articleCount: number
}

export interface StoryArticle {
  storyId: string
  articleId: string
  isPrimary: boolean
}

export interface Tag {
  id: string
  kind: TagKind
  name: string
  slug: string
}

export interface ArticleTag {
  articleId: string
  tagId: string
  confidence: number // 0 .. 1
  source: 'ai' | 'rule' | 'user'
}
