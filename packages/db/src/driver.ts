export type SqlValue = string | number | null
export type SqlParams = Record<string, SqlValue> | SqlValue[]

/**
 * Única superfície de banco que o resto do app conhece. A Fase 1 traz o
 * driver node:sqlite (desktop e CLI); a Fase 3 acrescenta um driver
 * expo-sqlite para o Android implementando este mesmo contrato.
 */
export interface SqlDriver {
  exec(sql: string): void
  all<T = Record<string, unknown>>(sql: string, params?: SqlParams): T[]
  get<T = Record<string, unknown>>(sql: string, params?: SqlParams): T | undefined
  run(sql: string, params?: SqlParams): void
  transaction<T>(fn: () => T): T
  close(): void
}
