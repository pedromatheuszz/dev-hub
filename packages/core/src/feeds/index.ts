import type { RawFeedItem } from '../types.js'
import { parseAtom } from './atom.js'
import { detectFormat } from './detect.js'
import { parseJsonFeed } from './jsonfeed.js'
import { parseRss } from './rss.js'

export { detectFormat } from './detect.js'
export type { FeedFormat } from './detect.js'

/**
 * Ponto único de entrada do parsing. Nunca lança: um feed quebrado
 * vira lista vazia para que o pipeline siga nas demais fontes
 * (constraint global do plano).
 */
export function parseFeed(body: string): RawFeedItem[] {
  if (!body || !body.trim()) return []
  try {
    switch (detectFormat(body)) {
      case 'jsonfeed': return parseJsonFeed(body)
      case 'atom': return parseAtom(body)
      case 'rss': return parseRss(body)
    }
  } catch {
    return []
  }
}
