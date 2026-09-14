import type { Article } from '@devhub/core'
import type { SqlDriver } from '../driver.js'

interface LinhaArticle {
  id: string; source_id: string; url: string; canonical_url: string
  title: string; subtitle: string | null; author: string | null
  published_at: number; fetched_at: number; excerpt: string
  content_text: string; content_html: string | null; image_url: string | null
  lang: string; simhash: string; word_count: number; reading_minutes: number
  story_id: string | null; content_type: string; ai_state: string
}

export function paraArticle(r: LinhaArticle): Article {
  return {
    id: r.id, sourceId: r.source_id, url: r.url, canonicalUrl: r.canonical_url,
    title: r.title, subtitle: r.subtitle, author: r.author,
    publishedAt: r.published_at, fetchedAt: r.fetched_at, excerpt: r.excerpt,
    contentText: r.content_text, contentHtml: r.content_html, imageUrl: r.image_url,
    lang: r.lang, simhash: r.simhash, wordCount: r.word_count,
    readingMinutes: r.reading_minutes, storyId: r.story_id,
    contentType: r.content_type as Article['contentType'],
    aiState: r.ai_state as Article['aiState'],
  }
}

export class ArticlesRepo {
  constructor(private readonly db: SqlDriver) {}

  upsert(a: Article): void {
    this.db.run(
      `INSERT INTO articles
         (id,source_id,url,canonical_url,title,subtitle,author,published_at,fetched_at,
          excerpt,content_text,content_html,image_url,lang,simhash,word_count,
          reading_minutes,story_id,content_type,ai_state)
       VALUES (:id,:src,:url,:canon,:title,:sub,:author,:pub,:fetch,
               :excerpt,:text,:html,:img,:lang,:hash,:wc,:rm,:story,:ctype,:ai)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title, subtitle=excluded.subtitle, author=excluded.author,
         excerpt=excluded.excerpt, content_text=excluded.content_text,
         content_html=excluded.content_html, image_url=excluded.image_url,
         content_type=excluded.content_type, ai_state=excluded.ai_state`,
      {
        id: a.id, src: a.sourceId, url: a.url, canon: a.canonicalUrl,
        title: a.title, sub: a.subtitle, author: a.author,
        pub: a.publishedAt, fetch: a.fetchedAt, excerpt: a.excerpt,
        text: a.contentText, html: a.contentHtml, img: a.imageUrl,
        lang: a.lang, hash: a.simhash, wc: a.wordCount, rm: a.readingMinutes,
        story: a.storyId, ctype: a.contentType, ai: a.aiState,
      },
    )
  }

  existsByCanonicalUrl(url: string): boolean {
    return this.db.get('SELECT 1 AS x FROM articles WHERE canonical_url = ?', [url]) !== undefined
  }

  byId(id: string): Article | undefined {
    const r = this.db.get<LinhaArticle>('SELECT * FROM articles WHERE id = ?', [id])
    return r ? paraArticle(r) : undefined
  }

  pendingAi(limit: number): Article[] {
    return this.db
      .all<LinhaArticle>(
        "SELECT * FROM articles WHERE ai_state = 'pending' ORDER BY published_at DESC LIMIT ?",
        [limit],
      )
      .map(paraArticle)
  }

  setStory(articleId: string, storyId: string): void {
    this.db.run('UPDATE articles SET story_id = ? WHERE id = ?', [storyId, articleId])
  }

  setAiState(id: string, state: Article['aiState']): void {
    this.db.run('UPDATE articles SET ai_state = ? WHERE id = ?', [state, id])
  }
}
