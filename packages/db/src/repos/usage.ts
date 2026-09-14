import type { SqlDriver } from '../driver.js'

export interface UsoDoDia {
  dia: string
  provider: string
  model: string
  requisicoes: number
  tokensEntrada: number
  tokensSaida: number
}

function hoje(agora: number): string {
  return new Date(agora).toISOString().slice(0, 10)
}

/**
 * Painel de consumo — mecanismo 8 do spec §6.4. Grava o que cada requisição
 * custou para que o usuário veja o gasto do dia e não seja surpreendido.
 */
export class UsageRepo {
  constructor(private readonly db: SqlDriver) {}

  registrar(
    provider: string,
    model: string,
    uso: { requisicoes: number; tokensEntrada: number; tokensSaida: number },
    agora: number,
  ): void {
    this.db.run(
      `INSERT INTO ai_usage (day, provider, model, requests, prompt_tokens, completion_tokens)
       VALUES (:dia, :prov, :model, :req, :tin, :tout)
       ON CONFLICT(day, provider, model) DO UPDATE SET
         requests = requests + excluded.requests,
         prompt_tokens = prompt_tokens + excluded.prompt_tokens,
         completion_tokens = completion_tokens + excluded.completion_tokens`,
      {
        dia: hoje(agora), prov: provider, model,
        req: uso.requisicoes, tin: uso.tokensEntrada, tout: uso.tokensSaida,
      },
    )
  }

  doDia(agora: number): UsoDoDia[] {
    return this.db
      .all<{
        day: string; provider: string; model: string
        requests: number; prompt_tokens: number; completion_tokens: number
      }>('SELECT * FROM ai_usage WHERE day = ? ORDER BY provider, model', [hoje(agora)])
      .map((r) => ({
        dia: r.day, provider: r.provider, model: r.model,
        requisicoes: r.requests,
        tokensEntrada: r.prompt_tokens,
        tokensSaida: r.completion_tokens,
      }))
  }

  /** Total de requisições de hoje — é o que o governador de cota restaura. */
  requisicoesHoje(agora: number): number {
    return this.db.get<{ total: number }>(
      'SELECT COALESCE(SUM(requests), 0) AS total FROM ai_usage WHERE day = ?',
      [hoje(agora)],
    )?.total ?? 0
  }

  ultimosDias(agora: number, dias: number): UsoDoDia[] {
    const limite = new Date(agora - dias * 86_400_000).toISOString().slice(0, 10)
    return this.db
      .all<{
        day: string; provider: string; model: string
        requests: number; prompt_tokens: number; completion_tokens: number
      }>('SELECT * FROM ai_usage WHERE day >= ? ORDER BY day DESC', [limite])
      .map((r) => ({
        dia: r.day, provider: r.provider, model: r.model,
        requisicoes: r.requests,
        tokensEntrada: r.prompt_tokens,
        tokensSaida: r.completion_tokens,
      }))
  }
}
