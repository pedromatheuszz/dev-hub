export const CORE_VERSION = '0.1.0'

export * from './types.js'
export * from './platform.js'

export * from './feeds/index.js'

export * from './normalize/article.js'
export * from './normalize/dates.js'
export * from './normalize/html.js'
export * from './normalize/urls.js'

export * from './dedup/simhash.js'
export * from './dedup/jaccard.js'
export * from './dedup/cluster.js'

export * from './filter/prefilter.js'

export * from './taxonomy/dictionary.js'
export * from './taxonomy/classify.js'

export * from './ai/provider.js'
export { HeuristicProvider } from './ai/heuristic.js'

export * from './rank/freshness.js'
export * from './rank/score.js'
export * from './rank/breaking.js'

export { SOURCES } from './sources/registry.js'
