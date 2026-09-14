import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import {
  ArticlesRepo, NodeSqliteDriver, SearchRepo, SourcesRepo, StoriesRepo, TagsRepo, migrate,
} from '@devhub/db'
import { SOURCES } from '@devhub/core'

export interface Contexto {
  driver: NodeSqliteDriver
  sources: SourcesRepo
  articles: ArticlesRepo
  stories: StoriesRepo
  tags: TagsRepo
  search: SearchRepo
}

let ctx: Contexto | null = null

/**
 * O banco vive em userData, não ao lado do executável: é o único lugar
 * gravável depois que o app é instalado em Program Files.
 */
export function abrirBanco(): Contexto {
  if (ctx) return ctx

  const caminho = join(app.getPath('userData'), 'devhub.db')
  mkdirSync(dirname(caminho), { recursive: true })

  const driver = new NodeSqliteDriver(caminho)
  migrate(driver)

  const sources = new SourcesRepo(driver)
  for (const s of SOURCES) sources.upsert(s)

  ctx = {
    driver,
    sources,
    articles: new ArticlesRepo(driver),
    stories: new StoriesRepo(driver),
    tags: new TagsRepo(driver),
    search: new SearchRepo(driver),
  }
  return ctx
}

export function fecharBanco(): void {
  ctx?.driver.close()
  ctx = null
}
