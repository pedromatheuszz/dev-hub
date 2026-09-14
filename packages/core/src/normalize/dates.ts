/** Um ano à frente do relógio já é sinal de data quebrada no feed. */
const MARGEM_FUTURO_MS = 365 * 24 * 60 * 60 * 1000

/**
 * Date.parse já entende RFC 822 (RSS) e ISO 8601 (Atom). O trabalho aqui
 * é rejeitar o que ele aceita indevidamente e o que não faz sentido.
 */
export function parseFeedDate(raw: string | null, fallback: number): number {
  if (!raw) return fallback
  const t = Date.parse(raw.trim())
  if (Number.isNaN(t)) return fallback
  if (t <= 0) return fallback
  if (t > fallback + MARGEM_FUTURO_MS) return fallback
  return t
}
