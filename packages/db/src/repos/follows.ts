import type { SqlDriver } from '../driver.js'

export type FollowKind = 'tag' | 'category' | 'source'

export interface Follow {
  id: string
  targetKind: FollowKind
  targetId: string
  weight: number
  createdAt: number
}

interface LinhaFollow {
  id: string
  target_kind: string
  target_id: string
  weight: number
  created_at: number
}

function paraFollow(r: LinhaFollow): Follow {
  return {
    id: r.id,
    targetKind: r.target_kind as FollowKind,
    targetId: r.target_id,
    weight: r.weight,
    createdAt: r.created_at,
  }
}

export class FollowsRepo {
  constructor(private readonly db: SqlDriver) {}

  /** O id é derivado do alvo, então seguir duas vezes é idempotente. */
  add(kind: FollowKind, targetId: string, weight: number, agora: number): Follow {
    const id = `${kind}:${targetId}`
    this.db.run(
      `INSERT INTO follows (id, target_kind, target_id, weight, created_at)
       VALUES (?,?,?,?,?)
       ON CONFLICT(target_kind, target_id) DO UPDATE SET weight = excluded.weight`,
      [id, kind, targetId, weight, agora],
    )
    return { id, targetKind: kind, targetId, weight, createdAt: agora }
  }

  remove(kind: FollowKind, targetId: string): void {
    this.db.run(
      'DELETE FROM follows WHERE target_kind = ? AND target_id = ?',
      [kind, targetId],
    )
  }

  /** Devolve o novo estado: true se passou a seguir. */
  toggle(kind: FollowKind, targetId: string, weight: number, agora: number): boolean {
    if (this.isFollowing(kind, targetId)) {
      this.remove(kind, targetId)
      return false
    }
    this.add(kind, targetId, weight, agora)
    return true
  }

  isFollowing(kind: FollowKind, targetId: string): boolean {
    return this.db.get(
      'SELECT 1 AS x FROM follows WHERE target_kind = ? AND target_id = ?',
      [kind, targetId],
    ) !== undefined
  }

  list(): Follow[] {
    return this.db
      .all<LinhaFollow>('SELECT * FROM follows ORDER BY target_kind, target_id')
      .map(paraFollow)
  }

  /** Mapa slug -> peso, no formato que o ranking consome. */
  pesosPorTag(): Map<string, number> {
    return new Map(
      this.db
        .all<{ target_id: string; weight: number }>(
          "SELECT target_id, weight FROM follows WHERE target_kind = 'tag'",
        )
        .map((r) => [r.target_id, r.weight]),
    )
  }

  pesosPorCategoria(): Map<string, number> {
    return new Map(
      this.db
        .all<{ target_id: string; weight: number }>(
          "SELECT target_id, weight FROM follows WHERE target_kind = 'category'",
        )
        .map((r) => [r.target_id, r.weight]),
    )
  }
}

export interface TagSugerida {
  slug: string
  name: string
  kind: string
  artigos: number
  seguindo: boolean
}

/**
 * Tags ordenadas por quantos artigos as usam. É o que a tela de "Seguindo"
 * apresenta: sugerir o que existe no acervo do usuário, não uma lista fixa.
 */
export function tagsMaisUsadas(db: SqlDriver, limite: number): TagSugerida[] {
  return db
    .all<{ slug: string; name: string; kind: string; artigos: number; seguindo: number }>(
      `SELECT t.slug, t.name, t.kind,
              COUNT(at.article_id) AS artigos,
              CASE WHEN f.id IS NULL THEN 0 ELSE 1 END AS seguindo
         FROM tags t
         LEFT JOIN article_tags at ON at.tag_id = t.id
         LEFT JOIN follows f ON f.target_kind = 'tag' AND f.target_id = t.slug
        GROUP BY t.id
        HAVING artigos > 0
        ORDER BY artigos DESC, t.slug
        LIMIT ?`,
      [limite],
    )
    .map((r) => ({
      slug: r.slug, name: r.name, kind: r.kind,
      artigos: r.artigos, seguindo: r.seguindo === 1,
    }))
}

export interface ItemHistorico {
  articleId: string
  openedAt: number
}

export function historico(db: SqlDriver, limite: number): ItemHistorico[] {
  return db
    .all<{ article_id: string; opened_at: number }>(
      `SELECT article_id, MAX(opened_at) AS opened_at
         FROM reading_history
        GROUP BY article_id
        ORDER BY opened_at DESC
        LIMIT ?`,
      [limite],
    )
    .map((r) => ({ articleId: r.article_id, openedAt: r.opened_at }))
}
