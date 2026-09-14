export interface HttpResponse {
  status: number
  body: string
  headers: Record<string, string>
}

export interface HttpRequest {
  url: string
  etag?: string | null
  lastModified?: string | null
  timeoutMs?: number
}

export interface HttpClient {
  /**
   * Deve devolver status 304 com corpo vazio quando o servidor responder
   * Not Modified — nunca lançar exceção para status HTTP. Só lança em
   * falha de rede ou timeout.
   */
  get(req: HttpRequest): Promise<HttpResponse>
}

export interface Clock {
  /** epoch em milissegundos */
  now(): number
}

export interface Logger {
  debug(msg: string, meta?: unknown): void
  info(msg: string, meta?: unknown): void
  warn(msg: string, meta?: unknown): void
  error(msg: string, meta?: unknown): void
}

export interface SecretStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

/**
 * Toda dependência de mundo externo do núcleo entra por aqui.
 * Nenhum arquivo em packages/core/src pode importar node:*, window,
 * fetch global, Electron ou React Native. Ver teste da regra de
 * dependência em platform.test.ts.
 */
export interface Platform {
  http: HttpClient
  clock: Clock
  logger: Logger
  secrets: SecretStore
}
