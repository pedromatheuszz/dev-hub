import type { HttpClient, HttpRequest, Logger, Platform, SecretStore } from '@devhub/core'
import * as SecureStore from 'expo-secure-store'

/**
 * O fetch do React Native não sofre CORS — roda na camada nativa, não num
 * navegador. É o que permite ao Android buscar os feeds direto, sem servidor.
 */
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
      if (req.body) cabecalhos['content-type'] = 'application/json'

      const r = await fetch(req.url, {
        method: req.method ?? 'GET',
        body: req.body,
        headers: cabecalhos,
        signal: ctrl.signal,
      })
      const body = r.status === 304 ? '' : await r.text()

      const headers: Record<string, string> = {}
      r.headers.forEach((v, k) => { headers[k.toLowerCase()] = v })

      return { status: r.status, body, headers }
    } finally {
      clearTimeout(timer)
    }
  },
}

const logger: Logger = {
  debug() {},
  info(m) { console.log(m) },
  warn(m, meta) { console.warn(m, meta ?? '') },
  error(m, meta) { console.error(m, meta ?? '') },
}

/** Android Keystore via expo-secure-store. A chave nunca toca o SQLite. */
const secrets: SecretStore = {
  async get(k) { return SecureStore.getItemAsync(k) },
  async set(k, v) { await SecureStore.setItemAsync(k, v) },
  async delete(k) { await SecureStore.deleteItemAsync(k) },
}

export const mobilePlatform: Platform = {
  http,
  clock: { now: () => Date.now() },
  logger,
  secrets,
}
