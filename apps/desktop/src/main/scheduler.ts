import { decidirIngestao, msAteProximaJanela, runIngest } from '@devhub/core'
import { BrowserWindow } from 'electron'
import { providerParaIngestao } from './ai.js'
import type { Contexto } from './db.js'
import { notificarApos } from './notify.js'
import { criarPlatform } from './platform.js'
import { gravarConfig, lerConfig } from './queries.js'

export const CHAVE_ULTIMA_INGESTAO = 'ultima_ingestao'
export const CHAVE_AUTO = 'ingestao_automatica'

/**
 * Batimento de 10 minutos em vez de um único timer longo até as 5h.
 *
 * Um setTimeout de horas não sobrevive à suspensão do notebook: o relógio
 * do sistema avança mas o temporizador não, e a ingestão simplesmente não
 * acontece. Verificar de tempos em tempos é imune a isso e ainda cobre o
 * caso de o app ter ficado fechado durante a janela.
 */
const BATIMENTO_MS = 10 * 60_000

let temporizador: NodeJS.Timeout | null = null
let rodando = false

export function ingestaoAutomaticaLigada(ctx: Contexto): boolean {
  return lerConfig(ctx, CHAVE_AUTO) !== 'off'
}

export function definirIngestaoAutomatica(ctx: Contexto, ligada: boolean): void {
  gravarConfig(ctx, CHAVE_AUTO, ligada ? 'on' : 'off')
}

export function ultimaIngestao(ctx: Contexto): number | null {
  const v = lerConfig(ctx, CHAVE_ULTIMA_INGESTAO)
  const n = v ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

export function registrarIngestao(ctx: Contexto, quando: number): void {
  gravarConfig(ctx, CHAVE_ULTIMA_INGESTAO, String(quando))
}

export interface StatusAgendamento {
  automatica: boolean
  ultimaIngestao: number | null
  proximaEm: number
  horaDaJanela: number
}

export function lerStatus(ctx: Contexto): StatusAgendamento {
  return {
    automatica: ingestaoAutomaticaLigada(ctx),
    ultimaIngestao: ultimaIngestao(ctx),
    proximaEm: msAteProximaJanela(Date.now()),
    horaDaJanela: 5,
  }
}

/** Executa a ingestão e tudo que vem depois dela. Reutilizado pelo IPC. */
export async function executarIngestao(ctx: Contexto) {
  const relatorio = await runIngest({
    platform: criarPlatform(ctx),
    sources: ctx.sources,
    articles: ctx.articles,
    stories: ctx.stories,
    tags: ctx.tags,
    search: ctx.search,
    ai: await providerParaIngestao(ctx),
  })

  registrarIngestao(ctx, Date.now())
  notificarApos(ctx, relatorio.idsNovos)
  return relatorio
}

async function verificar(ctx: Contexto): Promise<void> {
  if (rodando || !ingestaoAutomaticaLigada(ctx)) return

  const decisao = decidirIngestao(Date.now(), ultimaIngestao(ctx))
  if (!decisao.deveIngerir) return

  rodando = true
  try {
    const relatorio = await executarIngestao(ctx)
    // Avisa a interface para recarregar o feed sem o usuário fazer nada.
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('ingestaoAutomatica', relatorio)
    }
  } catch (e) {
    console.error('[erro] ingestão automática falhou', e)
  } finally {
    rodando = false
  }
}

export function iniciarAgendador(ctx: Contexto): void {
  if (temporizador) return
  // Primeira verificação logo após subir: cobre o caso do app ter ficado
  // fechado durante a janela das 5h.
  setTimeout(() => void verificar(ctx), 8_000)
  temporizador = setInterval(() => void verificar(ctx), BATIMENTO_MS)
}

export function pararAgendador(): void {
  if (temporizador) {
    clearInterval(temporizador)
    temporizador = null
  }
}
