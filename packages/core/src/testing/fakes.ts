import type {
  Clock, HttpClient, HttpResponse, Logger, Platform, SecretStore,
} from '../platform.js'

export function fakeClock(start = 1_700_000_000_000): Clock & { advance(ms: number): void } {
  let t = start
  return { now: () => t, advance: (ms: number) => { t += ms } }
}

export function fakeHttp(
  routes: Record<string, Partial<HttpResponse> & { body: string }>,
): HttpClient {
  return {
    async get(req) {
      const hit = routes[req.url]
      if (!hit) throw new Error(`fakeHttp: rota não registrada para ${req.url}`)
      return { status: hit.status ?? 200, body: hit.body, headers: hit.headers ?? {} }
    },
  }
}

export const silentLogger: Logger = {
  debug() {}, info() {}, warn() {}, error() {},
}

export function fakeSecrets(initial: Record<string, string> = {}): SecretStore {
  const store = new Map(Object.entries(initial))
  return {
    async get(k) { return store.get(k) ?? null },
    async set(k, v) { store.set(k, v) },
    async delete(k) { store.delete(k) },
  }
}

export function fakePlatform(over: Partial<Platform> = {}): Platform {
  return {
    http: over.http ?? fakeHttp({}),
    clock: over.clock ?? fakeClock(),
    logger: over.logger ?? silentLogger,
    secrets: over.secrets ?? fakeSecrets(),
  }
}
