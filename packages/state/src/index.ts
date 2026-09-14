import type { Article, Category, ScoreBreakdown, Story } from '@devhub/core'
import { create } from 'zustand'

/**
 * Estado compartilhado entre desktop e mobile.
 *
 * As duas plataformas escrevem componentes de tela separados (React DOM
 * não fala com React Native), mas compartilham este store inteiro — é o
 * que mantém o comportamento idêntico nas duas.
 *
 * O store não sabe de onde vêm os dados: recebe um DevHubApi por injeção,
 * implementado por IPC no Electron e por chamada direta no React Native.
 */

export interface FeedItem {
  story: Story
  article: Article
  tags: string[]
  breakdown: ScoreBreakdown
  saved: boolean
}

export interface IngestSummary {
  fontesLidas: number
  fontesComErro: number
  itensVistos: number
  itensNovos: number
  itensFiltrados: number
  historiasCriadas: number
}

export interface TagSugerida {
  slug: string
  name: string
  kind: string
  artigos: number
  seguindo: boolean
}

export interface SourceInfo {
  id: string
  name: string
  kind: string
  trustWeight: number
  lastFetchedAt: number | null
  active: boolean
}

/** Contrato que cada plataforma implementa à sua maneira. */
export interface DevHubApi {
  feed(category: Category | null, limit: number): Promise<FeedItem[]>
  saved(limit: number): Promise<FeedItem[]>
  search(query: string, limit: number): Promise<FeedItem[]>
  article(id: string): Promise<{ article: Article; tags: string[] } | null>
  toggleSaved(articleId: string): Promise<boolean>
  recordRead(articleId: string): Promise<void>
  ingest(): Promise<IngestSummary>
  sources(): Promise<SourceInfo[]>
  suggestedTags(limit: number): Promise<TagSugerida[]>
  toggleFollow(kind: 'tag' | 'category', targetId: string): Promise<boolean>
  history(limit: number): Promise<FeedItem[]>
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>
  openExternal(url: string): Promise<void>
}

export type Route =
  | { name: 'home' }
  | { name: 'latest' }
  | { name: 'category'; category: Category }
  | { name: 'trending' }
  | { name: 'saved' }
  | { name: 'following' }
  | { name: 'history' }
  | { name: 'settings' }
  | { name: 'article'; id: string }

export type ThemePref = 'system' | 'light' | 'dark'

export interface DevHubState {
  api: DevHubApi | null
  route: Route
  history: Route[]

  items: FeedItem[]
  loading: boolean
  error: string | null

  searchOpen: boolean
  searchQuery: string
  searchResults: FeedItem[]
  searching: boolean

  selectedIndex: number

  themePref: ThemePref
  fontScale: number

  ingesting: boolean
  lastIngest: IngestSummary | null

  suggested: TagSugerida[]
  loadingSuggested: boolean

  init(api: DevHubApi): Promise<void>
  navigate(route: Route): Promise<void>
  goBack(): Promise<void>
  refresh(): Promise<void>

  openSearch(): void
  closeSearch(): void
  setSearchQuery(q: string): Promise<void>

  moveSelection(delta: number): void
  setSelection(i: number): void
  openSelected(): Promise<void>
  toggleSavedSelected(): Promise<void>
  toggleSaved(articleId: string): Promise<void>

  loadSuggested(): Promise<void>
  toggleFollow(kind: 'tag' | 'category', targetId: string): Promise<void>

  setThemePref(p: ThemePref): Promise<void>
  setFontScale(s: number): Promise<void>
  runIngest(): Promise<void>
}

const LIMITE_FEED = 60
const FONTE_MIN = 0.8
const FONTE_MAX = 1.6

function categoriaDaRota(r: Route): Category | null {
  return r.name === 'category' ? r.category : null
}

/** Rotas que mostram uma lista de artigos (e portanto recarregam dados). */
function ehListagem(r: Route): boolean {
  return r.name !== 'article' && r.name !== 'settings' && r.name !== 'following'
}

export const useDevHub = create<DevHubState>((set, get) => ({
  api: null,
  route: { name: 'home' },
  history: [],

  items: [],
  loading: false,
  error: null,

  searchOpen: false,
  searchQuery: '',
  searchResults: [],
  searching: false,

  selectedIndex: 0,

  themePref: 'system',
  fontScale: 1,

  ingesting: false,
  lastIngest: null,

  suggested: [],
  loadingSuggested: false,

  async init(api) {
    set({ api })
    const [tema, fonte] = await Promise.all([
      api.getSetting('theme'),
      api.getSetting('fontScale'),
    ])
    set({
      themePref: (tema as ThemePref) ?? 'system',
      fontScale: fonte ? Number(fonte) : 1,
    })
    await get().refresh()
  },

  async navigate(route) {
    const atual = get().route
    if (atual.name === route.name && JSON.stringify(atual) === JSON.stringify(route)) return

    set({ route, history: [...get().history, atual], selectedIndex: 0 })
    if (ehListagem(route)) await get().refresh()
  },

  async goBack() {
    const h = get().history
    if (h.length === 0) return
    const anterior = h[h.length - 1]!
    set({ route: anterior, history: h.slice(0, -1), selectedIndex: 0 })
    if (ehListagem(anterior)) await get().refresh()
  },

  async refresh() {
    const { api, route } = get()
    if (!api) return

    set({ loading: true, error: null })
    try {
      const items = route.name === 'saved'
        ? await api.saved(LIMITE_FEED)
        : route.name === 'history'
          ? await api.history(LIMITE_FEED)
          : await api.feed(categoriaDaRota(route), LIMITE_FEED)
      set({ items, loading: false })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false })
    }
  },

  openSearch() {
    set({ searchOpen: true })
  },

  closeSearch() {
    set({ searchOpen: false, searchQuery: '', searchResults: [] })
  },

  async setSearchQuery(q) {
    set({ searchQuery: q })
    const api = get().api
    if (!api) return
    if (q.trim().length < 2) {
      set({ searchResults: [], searching: false })
      return
    }
    set({ searching: true })
    try {
      const r = await api.search(q, 30)
      // Descarta resultado que chegou atrasado e não é mais o que está digitado.
      if (get().searchQuery === q) set({ searchResults: r, searching: false })
    } catch {
      set({ searchResults: [], searching: false })
    }
  },

  moveSelection(delta) {
    const { items, selectedIndex } = get()
    if (items.length === 0) return
    const i = Math.min(items.length - 1, Math.max(0, selectedIndex + delta))
    set({ selectedIndex: i })
  },

  setSelection(i) {
    set({ selectedIndex: i })
  },

  async openSelected() {
    const { items, selectedIndex } = get()
    const item = items[selectedIndex]
    if (item) await get().navigate({ name: 'article', id: item.article.id })
  },

  async toggleSavedSelected() {
    const { items, selectedIndex } = get()
    const item = items[selectedIndex]
    if (item) await get().toggleSaved(item.article.id)
  },

  async toggleSaved(articleId) {
    const api = get().api
    if (!api) return
    const saved = await api.toggleSaved(articleId)

    const items = get().items
      .map((i) => (i.article.id === articleId ? { ...i, saved } : i))
      // Na tela de salvos, remover deve sumir com o card na hora.
      .filter((i) => get().route.name !== 'saved' || i.saved)

    set({
      items,
      searchResults: get().searchResults.map(
        (i) => (i.article.id === articleId ? { ...i, saved } : i),
      ),
    })
  },

  async loadSuggested() {
    const api = get().api
    if (!api) return
    set({ loadingSuggested: true })
    try {
      set({ suggested: await api.suggestedTags(40), loadingSuggested: false })
    } catch {
      set({ suggested: [], loadingSuggested: false })
    }
  },

  async toggleFollow(kind, targetId) {
    const api = get().api
    if (!api) return
    const seguindo = await api.toggleFollow(kind, targetId)
    set({
      suggested: get().suggested.map(
        (t) => (t.slug === targetId ? { ...t, seguindo } : t),
      ),
    })
    // O follow muda o fator de afinidade, então o feed precisa ser refeito.
    if (ehListagem(get().route)) await get().refresh()
  },

  async setThemePref(p) {
    set({ themePref: p })
    await get().api?.setSetting('theme', p)
  },

  async setFontScale(s) {
    const limitada = Math.min(FONTE_MAX, Math.max(FONTE_MIN, Number(s.toFixed(2))))
    set({ fontScale: limitada })
    await get().api?.setSetting('fontScale', String(limitada))
  },

  async runIngest() {
    const api = get().api
    if (!api || get().ingesting) return
    set({ ingesting: true, error: null })
    try {
      const lastIngest = await api.ingest()
      set({ lastIngest, ingesting: false })
      await get().refresh()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), ingesting: false })
    }
  },
}))
