import type { SqlDriver } from './driver.js'
import { MIGRATIONS } from './schema.js'

/**
 * Aplica as migrações pendentes usando PRAGMA user_version como marcador.
 * Idempotente: chamar duas vezes não reaplica nada.
 */
export function migrate(db: SqlDriver): number {
  const atual = db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0
  let versao = atual

  for (const m of MIGRATIONS) {
    if (m.version <= atual) continue
    db.transaction(() => { db.exec(m.up) })
    // PRAGMA não aceita parâmetro vinculado; a versão vem de constante do código.
    db.exec(`PRAGMA user_version = ${m.version}`)
    versao = m.version
  }
  return versao
}
