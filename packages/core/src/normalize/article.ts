import type { Article, RawFeedItem, Source } from '../types.js'
import { parseFeedDate } from './dates.js'
import { detectarIdioma } from './language.js'
import { htmlToText, sanitizeHtml } from './html.js'
import { canonicalizeUrl, stableId } from './urls.js'

export type NormalizedArticle =
  Omit<Article, 'simhash' | 'storyId' | 'contentType' | 'aiState'>

const PALAVRAS_POR_MINUTO = 220
const TAMANHO_EXCERPT = 280

export function normalizeItem(
  item: RawFeedItem,
  source: Source,
  now: number,
): NormalizedArticle {
  const url = item.link.trim()
  const canonicalUrl = canonicalizeUrl(url)
  const contentText = htmlToText(item.contentHtml ?? item.summary ?? '')
  const wordCount = contentText ? contentText.split(/\s+/).filter(Boolean).length : 0

  const excerptBase = htmlToText(item.summary ?? '') || contentText
  const excerpt = excerptBase.length > TAMANHO_EXCERPT
    ? `${excerptBase.slice(0, TAMANHO_EXCERPT).trimEnd()}…`
    : excerptBase

  return {
    id: stableId(canonicalUrl),
    sourceId: source.id,
    url,
    canonicalUrl,
    // Passa pelo htmlToText, não só trim: feeds costumam escapar duas
    // vezes, então o parser XML entrega "What&#8217;s" literal no título.
    title: htmlToText(item.title),
    subtitle: null,
    author: item.author?.trim() || null,
    publishedAt: parseFeedDate(item.publishedAt, now),
    fetchedAt: now,
    excerpt,
    contentText,
    contentHtml: item.contentHtml ? sanitizeHtml(item.contentHtml) : null,
    imageUrl: item.imageUrl,
    // Detectado, não chutado: é o que decide o que vale traduzir.
    lang: detectarIdioma(`${item.title} ${contentText || excerpt}`).idioma,
    wordCount,
    readingMinutes: Math.max(1, Math.ceil(wordCount / PALAVRAS_POR_MINUTO)),
  }
}
