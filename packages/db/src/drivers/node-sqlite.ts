import { DatabaseSync } from 'node:sqlite'
import type { SqlDriver, SqlParams } from '../driver.js'

export class NodeSqliteDriver implements SqlDriver {
  private readonly db: DatabaseSync

  constructor(caminho = ':memory:') {
    this.db = new DatabaseSync(caminho)
    this.db.exec('PRAGMA foreign_keys = ON')
    // WAL só faz sentido em arquivo; em :memory: o SQLite ignora.
    if (caminho !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL')
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  all<T = Record<string, unknown>>(sql: string, params?: SqlParams): T[] {
    const st = this.db.prepare(sql)
    return (params === undefined
      ? st.all()
      : Array.isArray(params) ? st.all(...params) : st.all(params)) as T[]
  }

  get<T = Record<string, unknown>>(sql: string, params?: SqlParams): T | undefined {
    const st = this.db.prepare(sql)
    return (params === undefined
      ? st.get()
      : Array.isArray(params) ? st.get(...params) : st.get(params)) as T | undefined
  }

  run(sql: string, params?: SqlParams): void {
    const st = this.db.prepare(sql)
    if (params === undefined) st.run()
    else if (Array.isArray(params)) st.run(...params)
    else st.run(params)
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN')
    try {
      const r = fn()
      this.db.exec('COMMIT')
      return r
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  close(): void {
    this.db.close()
  }
}
