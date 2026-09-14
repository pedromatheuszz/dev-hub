import type { RawFeedItem } from '../types.js'
import { asArray, text, xmlParser } from './xml-util.js'

export function parseRss(body: string): RawFeedItem[] {
  const doc = xmlParser.parse(body) as Record<string, any>
  const canal = doc?.rss?.channel ?? doc?.channel ?? doc?.['rdf:RDF']
  if (!canal) return []

  const brutos = asArray(canal.item ?? doc?.['rdf:RDF']?.item)
  const itens: RawFeedItem[] = []

  for (const it of brutos) {
    const title = text(it.title)
    const link = text(it.link) ?? text(it.guid)
    if (!title || !link) continue

    const conteudo = text(it['content:encoded']) ?? text(it.description)
    itens.push({
      title,
      link,
      author: text(it['dc:creator']) ?? text(it.author),
      publishedAt: text(it.pubDate) ?? text(it['dc:date']),
      summary: text(it.description),
      contentHtml: conteudo,
      imageUrl: text(it.enclosure?.['@_url']) ?? text(it['media:content']?.['@_url']),
      guid: text(it.guid),
    })
  }
  return itens
}
