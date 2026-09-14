import type { Category } from '../types.js'

/** Spec §7.1: Innovation envelhece devagar; notícia de hardware, rápido. */
export const MEIA_VIDA_HORAS: Record<Category, number> = {
  technology: 18,
  programming: 18,
  innovation: 36,
}

const MS_POR_HORA = 3_600_000

/** Decaimento exponencial. Vale 1 no instante zero e 0.5 a cada meia-vida. */
export function freshness(
  publishedAt: number,
  now: number,
  halfLifeHours: number,
): number {
  const horas = Math.max(0, (now - publishedAt) / MS_POR_HORA)
  return Math.exp((-Math.LN2 * horas) / halfLifeHours)
}
