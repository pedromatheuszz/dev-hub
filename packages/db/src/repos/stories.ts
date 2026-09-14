import type { Category, ScoreBreakdown, Story } from '@devhub/core'
import { scoreStory } from '@devhub/core'
import type { SqlDriver } from '../driver.js'

export interface RankedStory {
  story: Story
  primaryArticleId: string
  breakdown: ScoreBreakdown
}

interface LinhaStory {
  id: string; canonical_title: string; canonical_summary: string | null
  category: string; importance: number; is_breaking: number
  first_seen_at: number; last_updated_at: number; article_count: number
  primary_article_id: string | null; trust_weight: number | null
  published_at: number | null
}

export class StoriesRepo {
  constructor(private readonly db: SqlDriver) {}

  upsert(s: Story): void {
    this.db.run(
      `INSERT INTO stories
         (id,canonical_title,canonical_summary,category,importance,is_breaking,
          first_seen_at,last_updated_at,article_count)
       VALUES (:id,:title,:summary,:cat,:imp,:brk,:first,:last,:count)
       ON CONFLICT(id) DO UPDATE SET
         canonical_title=excluded.canonical_title,
         canonical_summary=excluded.canonical_summary,
         category=excluded.category, importance=excluded.importance,
         is_breaking=excluded.is_breaking, last_updated_at=excluded.last_updated_at,
         article_count=excluded.article_count`,
      {
        id: s.id, title: s.canonicalTitle, summary: s.canonicalSummary,
        cat: s.category, imp: s.importance, brk: s.isBreaking ? 1 : 0,
        first: s.firstSeenAt, last: s.lastUpdatedAt, count: s.articleCount,
      },
    )
  }

  linkArticle(storyId: string, articleId: string, isPrimary: boolean): void {
    this.db.run(
      `INSERT INTO story_articles (story_id, article_id, is_primary)
       VALUES (?,?,?)
       ON CONFLICT(story_id, article_id) DO UPDATE SET is_primary = excluded.is_primary`,
      [storyId, articleId, isPrimary ? 1 : 0],
    )
  }

  /**
   * O SQL só traz os fatores; o score é calculado em TypeScript pela mesma
   * função que a UI usa. Isso garante que o número exibido no painel
   * "por que estou vendo isto" é exatamente o que ordenou a lista.
   */
  topRanked(limit: number, category: Category | null, now: number): RankedStory[] {
    const linhas = this.db.all<LinhaStory>(
      `SELECT st.*,
              sa.article_id AS primary_article_id,
              src.trust_weight,
              a.published_at
         FROM stories st
         LEFT JOIN story_articles sa ON sa.story_id = st.id AND sa.is_primary = 1
         LEFT JOIN articles a ON a.id = sa.article_id
         LEFT JOIN sources src ON src.id = a.source_id
        WHERE (:cat IS NULL OR st.category = :cat)
        ORDER BY st.last_updated_at DESC
        LIMIT :lim`,
      { cat: category, lim: limit * 4 }, // folga: reordenamos em memória
    )

    return linhas
      .filter((r) => r.primary_article_id !== null)
      .map((r) => {
        const story: Story = {
          id: r.id,
          canonicalTitle: r.canonical_title,
          canonicalSummary: r.canonical_summary,
          category: r.category as Category,
          importance: r.importance,
          isBreaking: r.is_breaking === 1,
          firstSeenAt: r.first_seen_at,
          lastUpdatedAt: r.last_updated_at,
          articleCount: r.article_count,
        }
        return {
          story,
          primaryArticleId: r.primary_article_id!,
          breakdown: scoreStory({
            publishedAt: r.published_at ?? r.first_seen_at,
            now,
            category: story.category,
            trustWeight: r.trust_weight ?? 0.5,
            importance: story.importance,
            followMatches: [], // Fase 4 preenche isto
            articleCount: story.articleCount,
          }),
        }
      })
      .sort((a, b) => b.breakdown.total - a.breakdown.total)
      .slice(0, limit)
  }
}
