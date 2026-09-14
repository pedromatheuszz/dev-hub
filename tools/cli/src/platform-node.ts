import type { HttpClient, HttpRequest, Logger, Platform, SecretStore } from '@devhub/core'

/** Implementa HttpClient com fetch do Node. Status HTTP nunca vira exceção. */
const http: HttpClient = {
  async get(req: HttpRequest) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 20_000)
    try {
      const cabecalhos: Record<string, string> = {
        'user-agent': 'DevHub/0.1 (+feed reader)',
        accept:
          'application/rss+xml, application/atom+xml, application/json, text/xml;q=0.9, */*;q=0.8',
      }
      if (req.etag) cabecalhos['if-none-match'] = req.etag
      if (req.lastModified) cabecalhos['if-modified-since'] = req.lastModified

      const r = await fetch(req.url, {
        headers: cabecalhos,
        signal: ctrl.signal,
        redirect: 'follow',
      })
      // 304 não tem corpo; ler mesmo assim é seguro e devolve ''.
      const body = r.status === 304 ? '' : await r.text()
      return { status: r.status, body, headers: Object.fromEntries(r.headers) }
    } finally {
      clearTimeout(timer)
    }
  },
}

const logger: Logger = {
  debug(m, meta) {
    if (process.env['DEVHUB_DEBUG']) console.debug(`[debug] ${m}`, meta ?? '')
  },
  info(m) { console.log(m) },
  warn(m, meta) {
    if (process.env['DEVHUB_DEBUG']) console.warn(`[aviso] ${m}`, meta ?? '')
  },
  error(m, meta) { console.error(`[erro] ${m}`, meta ?? '') },
}

/**
 * Placeholder da Fase 1: a CLI não lê nenhuma chave. As Fases 2 e 3
 * substituem por safeStorage (Electron) e expo-secure-store (Android).
 */
const secrets: SecretStore = {
  async get() { return null },
  async set() { throw new Error('armazenamento seguro indisponível na CLI') },
  async delete() {},
}

export const nodePlatform: Platform = {
  http,
  clock: { now: () => Date.now() },
  logger,
  secrets,
}
