import type { SqlDriver } from '../driver.js'

export interface Traducao {
  articleId: string
  targetLang: string
  sourceLang: string
  title: string
  excerpt: string
  contentText: string | null
  provider: string
  model: string
  translatedAt: number
}

interface LinhaTraducao {
  article_id: string
  target_lang: string
  source_lang: string
  title: string
  excerpt: string
  content_text: string | null
  provider: string
  model: string
  translated_at: number
}

function paraTraducao(r: LinhaTraducao): Traducao {
  return {
    articleId: r.article_id,
    targetLang: r.target_lang,
    sourceLang: r.source_lang,
    title: r.title,
    excerpt: r.excerpt,
    contentText: r.content_text,
    provider: r.provider,
    model: r.model,
    translatedAt: r.translated_at,
  }
}

/**
 * Traduções guardadas por artigo.
 *
 * Cada artigo é traduzido uma vez na vida — é o mesmo princípio do cache
 * permanente que protege a cota de IA. O texto original nunca é sobrescrito:
 * a tradução vive ao lado dele, para que a interface possa mostrar os dois
 * e rotular claramente o que é tradução automática.
 */
export class TranslationsRepo {
  constructor(private readonly db: SqlDriver) {}

  upsert(t: Traducao): void {
    this.db.run(
      `INSERT INTO translations
         (article_id, target_lang, source_lang, title, excerpt, content_text,
          provider, model, translated_at)
       VALUES (:id, :alvo, :origem, :titulo, :resumo, :texto, :prov, :modelo, :quando)
       ON CONFLICT(article_id, target_lang) DO UPDATE SET
         title = excluded.title,
         excerpt = excluded.excerpt,
         content_text = COALESCE(excluded.content_text, translations.content_text),
         provider = excluded.provider,
         model = excluded.model,
         translated_at = excluded.translated_at`,
      {
        id: t.articleId, alvo: t.targetLang, origem: t.sourceLang,
        titulo: t.title, resumo: t.excerpt, texto: t.contentText,
        prov: t.provider, modelo: t.model, quando: t.translatedAt,
      },
    )
  }

  get(articleId: string, targetLang: string): Traducao | undefined {
    const r = this.db.get<LinhaTraducao>(
      'SELECT * FROM translations WHERE article_id = ? AND target_lang = ?',
      [articleId, targetLang],
    )
    return r ? paraTraducao(r) : undefined
  }

  /** Mapa id -> tradução, para montar uma lista de cards sem N consultas. */
  paraArtigos(ids: string[], targetLang: string): Map<string, Traducao> {
    if (ids.length === 0) return new Map()
    const marcadores = ids.map(() => '?').join(',')
    return new Map(
      this.db
        .all<LinhaTraducao>(
          `SELECT * FROM translations
            WHERE target_lang = ? AND article_id IN (${marcadores})`,
          [targetLang, ...ids],
        )
        .map((r) => [r.article_id, paraTraducao(r)]),
    )
  }

  /** Tem tradução com o corpo completo, não só título e resumo? */
  temCorpo(articleId: string, targetLang: string): boolean {
    return this.db.get(
      `SELECT 1 AS x FROM translations
        WHERE article_id = ? AND target_lang = ?
          AND content_text IS NOT NULL AND LENGTH(content_text) > 0`,
      [articleId, targetLang],
    ) !== undefined
  }

  contar(targetLang: string): number {
    return this.db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM translations WHERE target_lang = ?',
      [targetLang],
    )?.n ?? 0
  }

  /** Artigos que precisam de tradução e ainda não têm. */
  pendentes(targetLang: string, limite: number): string[] {
    return this.db
      .all<{ id: string }>(
        `SELECT a.id
           FROM articles a
           LEFT JOIN translations t
             ON t.article_id = a.id AND t.target_lang = :alvo
          WHERE t.article_id IS NULL
            AND a.lang <> :alvo
            AND a.lang <> 'desconhecido'
          ORDER BY a.published_at DESC
          LIMIT :lim`,
        { alvo: targetLang, lim: limite },
      )
      .map((r) => r.id)
  }
}
