import { HeuristicProvider, runIngest, type Category } from '@devhub/core'
import { ipcMain, shell } from 'electron'
import type { Contexto } from './db.js'
import { criarPlatform } from './platform.js'
import {
  alternarFollow, alternarSalvo, buscar, gravarConfig, lerConfig, lerHistorico,
  listarFontes, listarSalvos, montarFeed, registrarLeitura, sugerirTags,
} from './queries.js'

/** Protocolos que podem sair para o navegador do sistema. Nada mais. */
const PROTOCOLOS_SEGUROS = new Set(['http:', 'https:'])

const CATEGORIAS = new Set(['technology', 'programming', 'innovation'])

function validarCategoria(c: unknown): Category | null {
  return typeof c === 'string' && CATEGORIAS.has(c) ? (c as Category) : null
}

function validarLimite(n: unknown, padrao = 60): number {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? Math.min(500, Math.floor(v)) : padrao
}

function validarTexto(s: unknown, max = 500): string {
  return typeof s === 'string' ? s.slice(0, max) : ''
}

/**
 * Canais IPC tipados e explicitamente registrados. O renderer roda com
 * contextIsolation e sandbox ligados, então esta é a ÚNICA superfície
 * pela qual ele alcança o sistema. Todo argumento é validado aqui —
 * o renderer é tratado como entrada não confiável.
 */
export function registrarIpc(ctx: Contexto): void {
  ipcMain.handle('feed', (_e, cat, limite) =>
    montarFeed(ctx, validarCategoria(cat), validarLimite(limite)))

  ipcMain.handle('saved', (_e, limite) =>
    listarSalvos(ctx, validarLimite(limite)))

  ipcMain.handle('search', (_e, q, limite) =>
    buscar(ctx, validarTexto(q), validarLimite(limite, 30)))

  ipcMain.handle('article', (_e, id) => {
    const article = ctx.articles.byId(validarTexto(id, 64))
    return article ? { article, tags: ctx.tags.tagsFor(article.id) } : null
  })

  ipcMain.handle('toggleSaved', (_e, id) => alternarSalvo(ctx, validarTexto(id, 64)))

  ipcMain.handle('recordRead', (_e, id) => {
    registrarLeitura(ctx, validarTexto(id, 64))
  })

  ipcMain.handle('sources', () => listarFontes(ctx))

  ipcMain.handle('suggestedTags', (_e, limite) =>
    sugerirTags(ctx, validarLimite(limite, 40)))

  ipcMain.handle('toggleFollow', (_e, kind, alvo) => {
    const k = validarTexto(kind, 16)
    if (k !== 'tag' && k !== 'category' && k !== 'source') return false
    return alternarFollow(ctx, k, validarTexto(alvo, 100))
  })

  ipcMain.handle('history', (_e, limite) =>
    lerHistorico(ctx, validarLimite(limite)))

  ipcMain.handle('getSetting', (_e, k) => lerConfig(ctx, validarTexto(k, 64)))

  ipcMain.handle('setSetting', (_e, k, v) => {
    gravarConfig(ctx, validarTexto(k, 64), validarTexto(v, 2000))
  })

  ipcMain.handle('ingest', async () => runIngest({
    platform: criarPlatform(ctx),
    sources: ctx.sources,
    articles: ctx.articles,
    stories: ctx.stories,
    tags: ctx.tags,
    search: ctx.search,
    ai: new HeuristicProvider(),
  }))

  ipcMain.handle('openExternal', async (_e, url) => {
    const bruta = validarTexto(url, 2000)
    let u: URL
    try {
      u = new URL(bruta)
    } catch {
      return
    }
    // Links abrem no navegador do sistema, nunca dentro da janela do app.
    if (PROTOCOLOS_SEGUROS.has(u.protocol)) await shell.openExternal(u.toString())
  })
}
