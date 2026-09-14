import { describe, expect, it } from 'vitest'
import { NodeSqliteDriver } from './drivers/node-sqlite.js'
import { MIGRATIONS, migrate } from './index.js'

function db() {
  const d = new NodeSqliteDriver(':memory:')
  migrate(d)
  return d
}

describe('MIGRATIONS', () => {
  it('tem versões únicas e crescentes a partir de 1', () => {
    const vs = MIGRATIONS.map((m) => m.version)
    expect(vs).toEqual([...vs].sort((a, b) => a - b))
    expect(new Set(vs).size).toBe(vs.length)
    expect(vs[0]).toBe(1)
  })
})

describe('migrate', () => {
  it('cria todas as tabelas do spec §5', () => {
    const d = db()
    const nomes = d.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type IN ('table','view')",
    ).map((r) => r.name)

    for (const t of [
      'sources', 'articles', 'stories', 'story_articles', 'summaries',
      'tags', 'article_tags', 'follows', 'saved_articles',
      'reading_history', 'ai_usage', 'settings', 'articles_fts',
    ]) {
      expect(nomes, `falta a tabela ${t}`).toContain(t)
    }
    d.close()
  })

  it('é idempotente — rodar duas vezes não quebra nem duplica', () => {
    const d = new NodeSqliteDriver(':memory:')
    const v1 = migrate(d)
    const v2 = migrate(d)
    expect(v2).toBe(v1)
    d.close()
  })

  it('registra a versão aplicada', () => {
    const d = db()
    const v = d.get<{ user_version: number }>('PRAGMA user_version')
    expect(v!.user_version).toBe(MIGRATIONS[MIGRATIONS.length - 1]!.version)
    d.close()
  })

  it('liga as chaves estrangeiras', () => {
    const d = db()
    expect(d.get<{ foreign_keys: number }>('PRAGMA foreign_keys')!.foreign_keys).toBe(1)
    d.close()
  })

  it('rejeita artigo com sourceId inexistente', () => {
    const d = db()
    expect(() =>
      d.run(
        'INSERT INTO articles (id, source_id, url, canonical_url, title, published_at, fetched_at, excerpt, content_text, lang, simhash, word_count, reading_minutes, content_type, ai_state) ' +
        "VALUES ('a','NAO_EXISTE','u','u','t',1,1,'','','en','0',0,1,'news','pending')",
      ),
    ).toThrow()
    d.close()
  })

  it('impede canonical_url duplicada', () => {
    const d = db()
    d.run("INSERT INTO sources (id,name,url,feed_url,kind,trust_weight,active) VALUES ('s','S','u','f','news',0.8,1)")
    const ins = (id: string) =>
      d.run(
        'INSERT INTO articles (id, source_id, url, canonical_url, title, published_at, fetched_at, excerpt, content_text, lang, simhash, word_count, reading_minutes, content_type, ai_state) ' +
        `VALUES ('${id}','s','https://a/x','https://a/x','t',1,1,'','','en','0',0,1,'news','pending')`,
      )
    ins('a1')
    expect(() => ins('a2')).toThrow()
    d.close()
  })

  it('a tabela FTS aceita inserção e busca com ranking', () => {
    const d = db()
    d.run(
      'INSERT INTO articles_fts (article_id, title, excerpt, content_text, tags_flat) VALUES (?,?,?,?,?)',
      ['a1', 'Rust 1.90', 'compilador', 'borrow checker mais rapido', 'rust'],
    )
    const r = d.all<{ article_id: string }>(
      'SELECT article_id FROM articles_fts WHERE articles_fts MATCH ? ORDER BY rank',
      ['borrow'],
    )
    expect(r.map((x) => x.article_id)).toEqual(['a1'])
    d.close()
  })

  it('rejeita content_type fora do vocabulário', () => {
    const d = db()
    d.run("INSERT INTO sources (id,name,url,feed_url,kind,trust_weight,active) VALUES ('s','S','u','f','news',0.8,1)")
    expect(() =>
      d.run(
        'INSERT INTO articles (id, source_id, url, canonical_url, title, published_at, fetched_at, excerpt, content_text, lang, simhash, word_count, reading_minutes, content_type, ai_state) ' +
        "VALUES ('a','s','u','u','t',1,1,'','','en','0',0,1,'INVALIDO','pending')",
      ),
    ).toThrow()
    d.close()
  })
})

describe('NodeSqliteDriver', () => {
  it('transaction confirma em sucesso', () => {
    const d = db()
    d.transaction(() => {
      d.run("INSERT INTO settings (key, value) VALUES ('tema','escuro')")
    })
    expect(d.get<{ value: string }>("SELECT value FROM settings WHERE key='tema'")!.value)
      .toBe('escuro')
    d.close()
  })

  it('transaction desfaz tudo em erro', () => {
    const d = db()
    expect(() =>
      d.transaction(() => {
        d.run("INSERT INTO settings (key, value) VALUES ('a','1')")
        throw new Error('falhou no meio')
      }),
    ).toThrow('falhou no meio')
    expect(d.get("SELECT value FROM settings WHERE key='a'")).toBeUndefined()
    d.close()
  })

  it('aceita parâmetros posicionais e nomeados', () => {
    const d = db()
    d.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['p', '1'])
    d.run('INSERT INTO settings (key, value) VALUES (:k, :v)', { k: 'n', v: '2' })
    expect(d.all('SELECT key FROM settings ORDER BY key')).toHaveLength(2)
    d.close()
  })
})
