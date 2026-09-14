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
   * Pesos de afinidade do usuário, buscados uma vez por consulta.
   * Sem follows cadastrados devolve mapas vazios e a afinidade fica 1.0,
   * exatamente como antes da Fase 4.
   */
  private carregarAfinidade(): {
    porTag: Map<string, number>
    porCategoria: Map<string, number>
    tagsPorArtigo: Map<string, Array<{ slug: string; confidence: number }>>
  } {
    const porTag = new Map(
      this.db.all<{ target_id: string; weight: number }>(
        "SELECT target_id, weight FROM follows WHERE target_kind = 'tag'",
      ).map((r) => [r.target_id, r.weight]),
    )
    const porCategoria = new Map(
      this.db.all<{ target_id: string; weight: number }>(
        "SELECT target_id, weight FROM follows WHERE target_kind = 'category'",
      ).map((r) => [r.target_id, r.weight]),
    )

    const tagsPorArtigo = new Map<string, Array<{ slug: string; confidence: number }>>()
    if (porTag.size > 0) {
      // Uma consulta só para todas as tags seguidas, em vez de uma por artigo.
      const marcadores = [...porTag.keys()].map(() => '?').join(',')
      for (const r of this.db.all<{ article_id: string; slug: string; confidence: number }>(
        `SELECT at.article_id, t.slug, at.confidence
           FROM article_tags at
           JOIN tags t ON t.id = at.tag_id
          WHERE t.slug IN (${marcadores})`,
        [...porTag.keys()],
      )) {
        const lista = tagsPorArtigo.get(r.article_id)
        const item = { slug: r.slug, confidence: r.confidence }
        if (lista) lista.push(item)
        else tagsPorArtigo.set(r.article_id, [item])
      }
    }

    return { porTag, porCategoria, tagsPorArtigo }
  }

  /**
   * O SQL só traz os fatores; o score é calculado em TypeScript pela mesma
   * função que a UI usa. Isso garante que o número exibido no painel
   * "por que estou vendo isto" é exatamente o que ordenou a lista.
   */
  topRanked(limit: number, category: Category | null, now: number): RankedStory[] {
    const afinidade = this.carregarAfinidade()
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
        -- Por published_at do artigo primário, NÃO por last_updated_at:
        -- este último é o mesmo para toda história gravada na mesma
        -- rodada de ingestão, então empatava tudo e a pré-seleção devolvia
        -- um subconjunto arbitrário — o score reordenava a lista errada.
        ORDER BY COALESCE(a.published_at, st.first_seen_at) DESC
        LIMIT :lim`,
      { cat: category, lim: limit * 8 }, // folga: reordenamos em memória
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
        // Afinidade: cada tag seguida que o artigo tem, mais a categoria
        // seguida, empurram a história para cima no feed.
        const followMatches = (afinidade.tagsPorArtigo.get(r.primary_article_id!) ?? [])
          .map((t) => ({
            weight: afinidade.porTag.get(t.slug) ?? 0,
            tagConfidence: t.confidence,
          }))

        const pesoCategoria = afinidade.porCategoria.get(story.category)
        if (pesoCategoria !== undefined) {
          followMatches.push({ weight: pesoCategoria, tagConfidence: 0.5 })
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
            followMatches,
            articleCount: story.articleCount,
          }),
        }
      })
      .sort((a, b) => b.breakdown.total - a.breakdown.total)
      .slice(0, limit)
  }
}
