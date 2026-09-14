export type FeedFormat = 'rss' | 'atom' | 'jsonfeed'

export function detectFormat(body: string): FeedFormat {
  const head = body.slice(0, 2000).trimStart()
  if (head.startsWith('{')) return 'jsonfeed'
  if (/<feed[\s>]/i.test(head)) return 'atom'
  return 'rss'
}
