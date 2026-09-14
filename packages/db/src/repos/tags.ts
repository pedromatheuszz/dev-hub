import type { ArticleTag, TagKind } from '@devhub/core'
import type { SqlDriver } from '../driver.js'

export class TagsRepo {
  constructor(private readonly db: SqlDriver) {}

  /** O slug é o id: estável, legível e naturalmente único. */
  ensure(slug: string, name: string, kind: TagKind): string {
    this.db.run(
      `INSERT INTO tags (id, kind, name, slug) VALUES (?,?,?,?)
       ON CONFLICT(slug) DO NOTHING`,
      [slug, kind, name, slug],
    )
    return slug
  }

  attach(
    articleId: string,
    tagId: string,
    confidence: number,
    source: ArticleTag['source'],
  ): void {
    this.db.run(
      `INSERT INTO article_tags (article_id, tag_id, confidence, source)
       VALUES (?,?,?,?)
       ON CONFLICT(article_id, tag_id) DO UPDATE SET
         confidence = MAX(article_tags.confidence, excluded.confidence),
         source = excluded.source`,
      [articleId, tagId, confidence, source],
    )
  }

  tagsFor(articleId: string): string[] {
    return this.db
      .all<{ slug: string }>(
        `SELECT t.slug FROM article_tags at
           JOIN tags t ON t.id = at.tag_id
          WHERE at.article_id = ?
          ORDER BY at.confidence DESC, t.slug`,
        [articleId],
      )
      .map((r) => r.slug)
  }
}
