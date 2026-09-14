import type { DevHubApi } from '@devhub/state'

declare global {
  interface Window {
    devhub: DevHubApi
  }
}

/** O bridge do preload já tem exatamente a forma do DevHubApi. */
export const api: DevHubApi = window.devhub

export function tempoRelativo(ts: number, agora = Date.now()): string {
  const min = Math.floor((agora - ts) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

const ROTULO_TIPO: Record<string, string> = {
  news: 'Notícia',
  announcement: 'Anúncio oficial',
  report: 'Reportagem',
  rumor: 'Rumor',
  opinion: 'Opinião',
  analysis: 'Análise',
}

/** O spec exige distinguir notícia confirmada de rumor, opinião e análise. */
export function rotuloTipo(t: string): string {
  return ROTULO_TIPO[t] ?? t
}

const ROTULO_CATEGORIA: Record<string, string> = {
  technology: 'Tecnologia',
  programming: 'Programação',
  innovation: 'Inovação',
}

export function rotuloCategoria(c: string): string {
  return ROTULO_CATEGORIA[c] ?? c
}

export function hostDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
