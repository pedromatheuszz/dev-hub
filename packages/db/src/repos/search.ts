import type { SqlDriver } from '../driver.js'

export interface IndexInput {
  id: string
  title: string
  excerpt: string
  contentText: string
  tags: string[]
}

/**
 * Escapa a consulta do usuário como uma sequência de termos literais.
 * Sem isso, um `"` solto ou um `(` derrubariam a busca com erro de
 * sintaxe do FTS5 — que é entrada de usuário, não bug do sistema.
 */
function comoTermosLiterais(q: string): string {
  const termos = q
    .split(/\s+/)
    .map((t) => t.replace(/"/g, ''))
    .filter((t) => t.length > 0)
  if (termos.length === 0) return ''
  return termos.map((t) => `"${t}"`).join(' ')
}

export class SearchRepo {
  constructor(private readonly db: SqlDriver) {}

  index(a: IndexInput): void {
    this.db.run('DELETE FROM articles_fts WHERE article_id = ?', [a.id])
    this.db.run(
      `INSERT INTO articles_fts (article_id, title, excerpt, content_text, tags_flat)
       VALUES (?,?,?,?,?)`,
      [a.id, a.title, a.excerpt, a.contentText, a.tags.join(' ')],
    )
  }

  /** Devolve ids ordenados por relevância BM25 (rank mais negativo primeiro). */
  query(termo: string, limit: number): string[] {
    const expr = comoTermosLiterais(termo)
    if (!expr) return []
    try {
      return this.db
        .all<{ article_id: string }>(
          `SELECT article_id FROM articles_fts
            WHERE articles_fts MATCH ?
            ORDER BY rank
            LIMIT ?`,
          [expr, limit],
        )
        .map((r) => r.article_id)
    } catch {
      return []
    }
  }
}
