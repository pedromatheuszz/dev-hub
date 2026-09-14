import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { CORE_VERSION } from './index.js'

describe('fundação', () => {
  it('exporta a versão do core', () => {
    expect(CORE_VERSION).toBe('0.1.0')
  })

  // Este teste existe para falhar cedo e alto se o Node embarcado
  // perder o FTS5 — toda a busca da Fase 2 depende dele.
  it('o node:sqlite embutido suporta FTS5 com ranking BM25', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('CREATE VIRTUAL TABLE f USING fts5(title, body)')
    db.prepare('INSERT INTO f VALUES(?, ?)').run('Rust 1.90', 'memory safety without gc')
    const rows = db.prepare(
      'SELECT title, rank FROM f WHERE f MATCH ? ORDER BY rank',
    ).all('memory') as Array<{ title: string; rank: number }>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title).toBe('Rust 1.90')
    expect(rows[0]!.rank).toBeLessThan(0) // BM25: mais negativo = mais relevante
    db.close()
  })
})
