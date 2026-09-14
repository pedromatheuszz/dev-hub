/**
 * Janelas de ingestão — mecanismo 6 do spec §6.4.
 *
 * A ingestão roda algumas vezes por dia, não continuamente. Isso reduz
 * requisições de feed, requisições de IA e consumo de bateria no Android,
 * e é suficiente para notícias: nenhum feed publica de minuto em minuto.
 */

/**
 * Horas do dia (local) em que a ingestão automática roda.
 *
 * Uma janela só, às 5 da manhã: o feed já está pronto quando você acorda,
 * a rede está ociosa, e no Android a sincronização cai numa hora em que o
 * aparelho quase sempre está carregando. Atualizar manualmente pelo botão
 * continua disponível a qualquer momento.
 */
export const JANELAS_PADRAO = [5]

export const INTERVALO_MINIMO_MS = 90 * 60_000

export interface DecisaoIngestao {
  deveIngerir: boolean
  motivo: 'primeira_vez' | 'janela_atingida' | 'muito_recente' | 'fora_da_janela'
  proximaJanelaMs: number
}

/**
 * Decide se é hora de ingerir. Sempre permite a primeira vez, depois exige
 * que uma janela tenha sido cruzada e que tenha passado o intervalo mínimo.
 *
 * A ingestão manual do usuário ignora isto — o botão "Atualizar" sempre roda.
 */
export function decidirIngestao(
  agora: number,
  ultimaIngestao: number | null,
  janelas: number[] = JANELAS_PADRAO,
): DecisaoIngestao {
  const proxima = msAteProximaJanela(agora, janelas)

  if (ultimaIngestao === null) {
    return { deveIngerir: true, motivo: 'primeira_vez', proximaJanelaMs: proxima }
  }

  const decorrido = agora - ultimaIngestao
  if (decorrido < INTERVALO_MINIMO_MS) {
    return { deveIngerir: false, motivo: 'muito_recente', proximaJanelaMs: proxima }
  }

  // Cruzou alguma janela desde a última ingestão?
  const cruzou = janelas.some((h) => {
    const marco = new Date(agora)
    marco.setHours(h, 0, 0, 0)
    const t = marco.getTime()
    return t > ultimaIngestao && t <= agora
  })

  return cruzou
    ? { deveIngerir: true, motivo: 'janela_atingida', proximaJanelaMs: proxima }
    : { deveIngerir: false, motivo: 'fora_da_janela', proximaJanelaMs: proxima }
}

export function msAteProximaJanela(agora: number, janelas: number[] = JANELAS_PADRAO): number {
  const candidatos = janelas.map((h) => {
    const d = new Date(agora)
    d.setHours(h, 0, 0, 0)
    if (d.getTime() <= agora) d.setDate(d.getDate() + 1)
    return d.getTime()
  })
  return Math.min(...candidatos) - agora
}
