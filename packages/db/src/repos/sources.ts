import type { Source } from '@devhub/core'
import type { SqlDriver } from '../driver.js'

interface LinhaSource {
  id: string; name: string; url: string; feed_url: string; kind: string
  trust_weight: number; category_hint: string | null; active: number
  last_fetched_at: number | null; etag: string | null; last_modified: string | null
}

function paraSource(r: LinhaSource): Source {
  return {
    id: r.id, name: r.name, url: r.url, feedUrl: r.feed_url,
    kind: r.kind as Source['kind'], trustWeight: r.trust_weight,
    categoryHint: r.category_hint as Source['categoryHint'],
    active: r.active === 1, // SQLite não tem boolean
    lastFetchedAt: r.last_fetched_at, etag: r.etag, lastModified: r.last_modified,
  }
}

export class SourcesRepo {
  constructor(private readonly db: SqlDriver) {}

  upsert(s: Source): void {
    this.db.run(
      `INSERT INTO sources
         (id,name,url,feed_url,kind,trust_weight,category_hint,active,last_fetched_at,etag,last_modified)
       VALUES (:id,:name,:url,:feed,:kind,:trust,:hint,:active,:fetched,:etag,:lm)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, url=excluded.url, feed_url=excluded.feed_url,
         kind=excluded.kind, trust_weight=excluded.trust_weight,
         category_hint=excluded.category_hint, active=excluded.active`,
      {
        id: s.id, name: s.name, url: s.url, feed: s.feedUrl, kind: s.kind,
        trust: s.trustWeight, hint: s.categoryHint, active: s.active ? 1 : 0,
        fetched: s.lastFetchedAt, etag: s.etag, lm: s.lastModified,
      },
    )
  }

  listActive(): Source[] {
    return this.db
      .all<LinhaSource>('SELECT * FROM sources WHERE active = 1 ORDER BY id')
      .map(paraSource)
  }

  markFetched(
    id: string,
    at: number,
    etag: string | null,
    lastModified: string | null,
  ): void {
    this.db.run(
      'UPDATE sources SET last_fetched_at=:at, etag=:etag, last_modified=:lm WHERE id=:id',
      { at, etag, lm: lastModified, id },
    )
  }

  deactivate(id: string): void {
    this.db.run('UPDATE sources SET active = 0 WHERE id = ?', [id])
  }
}
