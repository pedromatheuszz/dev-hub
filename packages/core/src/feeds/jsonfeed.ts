import type { RawFeedItem } from '../types.js'

export function parseJsonFeed(body: string): RawFeedItem[] {
  const doc = JSON.parse(body) as Record<string, any>
  const itens: RawFeedItem[] = []

  for (const it of Array.isArray(doc?.items) ? doc.items : []) {
    const title: string | null = it.title ?? null
    const link: string | null = it.url ?? it.external_url ?? null
    if (!title || !link) continue

    // JSON Feed 1.1 usa authors[]; 1.0 usava author{}.
    const autor = it.authors?.[0]?.name ?? it.author?.name ?? null

    itens.push({
      title,
      link,
      author: autor,
      publishedAt: it.date_published ?? it.date_modified ?? null,
      summary: it.summary ?? null,
      contentHtml: it.content_html ?? it.content_text ?? null,
      imageUrl: it.image ?? it.banner_image ?? null,
      guid: it.id != null ? String(it.id) : null,
    })
  }
  return itens
}
