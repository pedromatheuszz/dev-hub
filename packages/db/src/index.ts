export type { SqlDriver, SqlParams, SqlValue } from './driver.js'
// Drivers concretos NÃO saem daqui: importar @devhub/db a partir do
// Android puxaria node:sqlite para o bundle e quebraria no Hermes.
// Cada plataforma importa o seu por subpath:
//   @devhub/db/node -> NodeSqliteDriver (Electron, CLI)
//   @devhub/db/expo -> ExpoSqliteDriver (Android)
export { MIGRATIONS, type Migration } from './schema.js'
export { migrate } from './migrate.js'

export { SourcesRepo } from './repos/sources.js'
export { ArticlesRepo } from './repos/articles.js'
export { StoriesRepo, type RankedStory } from './repos/stories.js'
export { TagsRepo } from './repos/tags.js'
export { SearchRepo, type IndexInput } from './repos/search.js'
export { FollowsRepo, historico, tagsMaisUsadas, type Follow, type FollowKind, type ItemHistorico, type TagSugerida } from './repos/follows.js'
export { UsageRepo, type UsoDoDia } from './repos/usage.js'
