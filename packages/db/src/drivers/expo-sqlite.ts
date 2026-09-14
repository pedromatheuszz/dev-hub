import * as SQLite from 'expo-sqlite'
import type { SqlDriver, SqlParams } from '../driver.js'

/**
 * Driver de Android sobre expo-sqlite.
 *
 * Usa a API síncrona (openDatabaseSync/getAllSync/runSync), que casa com o
 * contrato de SqlDriver e mantém os repositórios idênticos aos do desktop.
 * A API síncrona do expo-sqlite roda na thread de JS e é rápida o bastante
 * para as consultas do app; a ingestão, que é pesada, já é assíncrona por
 * causa da rede.
 */
export class ExpoSqliteDriver implements SqlDriver {
  private readonly db: SQLite.SQLiteDatabase

  constructor(nome = 'devhub.db') {
    this.db = SQLite.openDatabaseSync(nome)
    this.db.execSync('PRAGMA foreign_keys = ON')
    this.db.execSync('PRAGMA journal_mode = WAL')
  }

  exec(sql: string): void {
    this.db.execSync(sql)
  }

  all<T = Record<string, unknown>>(sql: string, params?: SqlParams): T[] {
    const st = this.db.prepareSync(sql)
    try {
      return st.executeSync<T>(normalizar(params)).getAllSync()
    } finally {
      st.finalizeSync()
    }
  }

  get<T = Record<string, unknown>>(sql: string, params?: SqlParams): T | undefined {
    const st = this.db.prepareSync(sql)
    try {
      return st.executeSync<T>(normalizar(params)).getFirstSync() ?? undefined
    } finally {
      st.finalizeSync()
    }
  }

  run(sql: string, params?: SqlParams): void {
    const st = this.db.prepareSync(sql)
    try {
      st.executeSync(normalizar(params))
    } finally {
      st.finalizeSync()
    }
  }

  transaction<T>(fn: () => T): T {
    this.db.execSync('BEGIN')
    try {
      const r = fn()
      this.db.execSync('COMMIT')
      return r
    } catch (e) {
      this.db.execSync('ROLLBACK')
      throw e
    }
  }

  close(): void {
    this.db.closeSync()
  }
}

/**
 * O expo-sqlite quer array para posicionais e objeto para nomeados, mas
 * os nomeados vêm com ':' no SQL e sem ':' na chave — mesma convenção do
 * node:sqlite, então basta repassar. `undefined` vira array vazio.
 */
function normalizar(params?: SqlParams): SQLite.SQLiteBindValue[] | Record<string, SQLite.SQLiteBindValue> {
  if (params === undefined) return []
  return params as SQLite.SQLiteBindValue[] | Record<string, SQLite.SQLiteBindValue>
}
