import type { RawFeedItem } from '../types.js'
import { asArray, text, xmlParser } from './xml-util.js'

/** Atom permite vários <link>; queremos o rel="alternate" (ou o primeiro sem rel). */
function pickLink(link: unknown): string | null {
  for (const l of asArray(link as any)) {
    if (typeof l === 'string') return l
    const rel = l?.['@_rel']
    if (!rel || rel === 'alternate') return text(l?.['@_href'])
  }
  const primeiro = asArray(link as any)[0]
  return typeof primeiro === 'string' ? primeiro : text(primeiro?.['@_href'])
}

export function parseAtom(body: string): RawFeedItem[] {
  const doc = xmlParser.parse(body) as Record<string, any>
  const feed = doc?.feed
  if (!feed) return []

  const itens: RawFeedItem[] = []
  for (const e of asArray(feed.entry)) {
    const title = text(e.title)
    const link = pickLink(e.link)
    if (!title || !link) continue

    itens.push({
      title,
      link,
      author: text(asArray(e.author)[0]?.name),
      publishedAt: text(e.published) ?? text(e.updated),
      summary: text(e.summary),
      contentHtml: text(e.content) ?? text(e.summary),
      imageUrl: null,
      guid: text(e.id),
    })
  }
  return itens
}
