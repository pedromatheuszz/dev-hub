import { safeStorage } from 'electron'
import type { HttpClient, HttpRequest, Logger, Platform, SecretStore } from '@devhub/core'
import type { Contexto } from './db.js'
import { gravarConfig, lerConfig } from './queries.js'

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
        headers: cabecalhos, signal: ctrl.signal, redirect: 'follow',
      })
      const body = r.status === 304 ? '' : await r.text()
      return { status: r.status, body, headers: Object.fromEntries(r.headers) }
    } finally {
      clearTimeout(timer)
    }
  },
}

const logger: Logger = {
  debug(m, meta) { if (process.env['DEVHUB_DEBUG']) console.debug('[debug]', m, meta ?? '') },
  info(m) { console.log(m) },
  warn(m, meta) { if (process.env['DEVHUB_DEBUG']) console.warn('[aviso]', m, meta ?? '') },
  error(m, meta) { console.error('[erro]', m, meta ?? '') },
}

/**
 * Segredos cifrados pelo safeStorage do Electron, que no Windows usa a
 * DPAPI — a chave só é decifrável pela conta de usuário que a gravou.
 * O texto cifrado fica em settings; o texto claro nunca toca o disco.
 */
export function criarSecretStore(ctx: Contexto): SecretStore {
  const chaveDe = (k: string) => `secret:${k}`

  return {
    async get(k) {
      const cifrado = lerConfig(ctx, chaveDe(k))
      if (!cifrado) return null
      if (!safeStorage.isEncryptionAvailable()) return null
      try {
        return safeStorage.decryptString(Buffer.from(cifrado, 'base64'))
      } catch {
        return null
      }
    },
    async set(k, v) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Armazenamento seguro indisponível neste sistema.')
      }
      gravarConfig(ctx, chaveDe(k), safeStorage.encryptString(v).toString('base64'))
    },
    async delete(k) {
      gravarConfig(ctx, chaveDe(k), '')
    },
  }
}

export function criarPlatform(ctx: Contexto): Platform {
  return {
    http,
    clock: { now: () => Date.now() },
    logger,
    secrets: criarSecretStore(ctx),
  }
}
