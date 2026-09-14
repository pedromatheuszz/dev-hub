import { describe, expect, it } from 'vitest'
import type { Story } from '../types.js'
import {
  PREFERENCIAS_PADRAO, selecionarNotificacoes,
  type CandidataNotificacao, type EstadoNotificacao,
} from './rules.js'

const AGORA = 1_789_000_000_000

function historia(over: Partial<Story> = {}): Story {
  return {
    id: 'st1', canonicalTitle: 'Rust 1.90 lançado', canonicalSummary: null,
    category: 'programming', importance: 0.9, isBreaking: false,
    firstSeenAt: AGORA, lastUpdatedAt: AGORA, articleCount: 1,
    ...over,
  }
}

function candidata(over: Partial<CandidataNotificacao> = {}): CandidataNotificacao {
  return { story: historia(), articleId: 'a1', tagsSeguidas: [], ...over }
}

function estado(over: Partial<EstadoNotificacao> = {}): EstadoNotificacao {
  return { enviadasHoje: 0, ultimaEnvioAt: null, jaNotificados: new Set(), ...over }
}

describe('selecionarNotificacoes', () => {
  it('notifica última hora', () => {
    const r = selecionarNotificacoes(
      [candidata({ story: historia({ isBreaking: true }) })],
      PREFERENCIAS_PADRAO, estado(), AGORA,
    )
    expect(r).toHaveLength(1)
    expect(r[0]!.motivo).toBe('ultima_hora')
  })

  it('notifica tópico seguido quando a importância é alta', () => {
    const r = selecionarNotificacoes(
      [candidata({ tagsSeguidas: ['rust'], story: historia({ importance: 0.9 }) })],
      PREFERENCIAS_PADRAO, estado(), AGORA,
    )
    expect(r).toHaveLength(1)
    expect(r[0]!.motivo).toBe('topico_seguido')
    expect(r[0]!.titulo).toBe('rust')
  })

  it('não notifica tópico seguido com importância baixa', () => {
    const r = selecionarNotificacoes(
      [candidata({ tagsSeguidas: ['rust'], story: historia({ importance: 0.3 }) })],
      PREFERENCIAS_PADRAO, estado(), AGORA,
    )
    expect(r).toEqual([])
  })

  it('não notifica história relevante que o usuário não segue', () => {
    const r = selecionarNotificacoes(
      [candidata({ story: historia({ importance: 1 }) })],
      PREFERENCIAS_PADRAO, estado(), AGORA,
    )
    expect(r).toEqual([])
  })

  it('respeita as notificações desligadas', () => {
    const r = selecionarNotificacoes(
      [candidata({ story: historia({ isBreaking: true }) })],
      { ...PREFERENCIAS_PADRAO, ativadas: false }, estado(), AGORA,
    )
    expect(r).toEqual([])
  })

  it('respeita o teto diário', () => {
    const r = selecionarNotificacoes(
      [candidata({ story: historia({ isBreaking: true }) })],
      { ...PREFERENCIAS_PADRAO, maxPorDia: 3 },
      estado({ enviadasHoje: 3 }), AGORA,
    )
    expect(r).toEqual([])
  })

  it('respeita o intervalo mínimo entre notificações', () => {
    const r = selecionarNotificacoes(
      [candidata({ story: historia({ isBreaking: true }) })],
      PREFERENCIAS_PADRAO,
      estado({ ultimaEnvioAt: AGORA - 60_000 }), AGORA,
    )
    expect(r).toEqual([])
  })

  it('volta a notificar depois do intervalo', () => {
    const r = selecionarNotificacoes(
      [candidata({ story: historia({ isBreaking: true }) })],
      PREFERENCIAS_PADRAO,
      estado({ ultimaEnvioAt: AGORA - 30 * 60_000 }), AGORA,
    )
    expect(r).toHaveLength(1)
  })

  it('não repete a mesma história', () => {
    const r = selecionarNotificacoes(
      [candidata({ story: historia({ id: 'st1', isBreaking: true }) })],
      PREFERENCIAS_PADRAO,
      estado({ jaNotificados: new Set(['st1']) }), AGORA,
    )
    expect(r).toEqual([])
  })

  it('coloca última hora antes de tópico seguido', () => {
    const r = selecionarNotificacoes(
      [
        candidata({ story: historia({ id: 'a', importance: 1 }), tagsSeguidas: ['rust'] }),
        candidata({ story: historia({ id: 'b', isBreaking: true, importance: 0.8 }) }),
      ],
      PREFERENCIAS_PADRAO, estado(), AGORA,
    )
    expect(r[0]!.storyId).toBe('b')
  })

  it('não ultrapassa o restante do teto numa rodada só', () => {
    const muitas = Array.from({ length: 20 }, (_, i) =>
      candidata({ story: historia({ id: `st${i}`, isBreaking: true }) }))
    const r = selecionarNotificacoes(
      muitas, { ...PREFERENCIAS_PADRAO, maxPorDia: 5 },
      estado({ enviadasHoje: 3 }), AGORA,
    )
    expect(r).toHaveLength(2)
  })

  it('lista vazia devolve vazio', () => {
    expect(selecionarNotificacoes([], PREFERENCIAS_PADRAO, estado(), AGORA)).toEqual([])
  })

  it('o padrão é silencioso o bastante: no máximo 8 por dia', () => {
    expect(PREFERENCIAS_PADRAO.maxPorDia).toBeLessThanOrEqual(8)
    expect(PREFERENCIAS_PADRAO.intervaloMinimoMs).toBeGreaterThanOrEqual(15 * 60_000)
  })
})
