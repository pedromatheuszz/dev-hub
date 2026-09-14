import { describe, expect, it } from 'vitest'
import {
  INTERVALO_MINIMO_MS, JANELAS_PADRAO, decidirIngestao, msAteProximaJanela,
} from './schedule.js'

/** Constrói um instante local no dia 14/09/2026, para o teste ser determinístico. */
function em(hora: number, minuto = 0): number {
  const d = new Date(2026, 8, 14, hora, minuto, 0, 0)
  return d.getTime()
}

const JANELAS = [5] // a janela real do Dev Hub

describe('a janela padrao', () => {
  it('e uma so, as 5h', () => {
    expect(JANELAS_PADRAO).toEqual([5])
  })
})

describe('decidirIngestao', () => {
  it('sempre ingere na primeira vez', () => {
    const d = decidirIngestao(em(3), null, JANELAS)
    expect(d.deveIngerir).toBe(true)
    expect(d.motivo).toBe('primeira_vez')
  })

  it('nao ingere logo apos uma ingestao', () => {
    const d = decidirIngestao(em(5, 10), em(5, 5), JANELAS)
    expect(d.deveIngerir).toBe(false)
    expect(d.motivo).toBe('muito_recente')
  })

  it('ingere quando a janela das 5h foi cruzada', () => {
    const d = decidirIngestao(em(7), em(3), JANELAS)
    expect(d.deveIngerir).toBe(true)
    expect(d.motivo).toBe('janela_atingida')
  })

  it('ingere ao abrir de manha se o app passou a noite fechado', () => {
    const ontemAs21 = em(21) - 86_400_000
    const d = decidirIngestao(em(9), ontemAs21, JANELAS)
    expect(d.deveIngerir).toBe(true)
    expect(d.motivo).toBe('janela_atingida')
  })

  it('nao ingere de novo no mesmo dia depois de ja ter rodado as 5h', () => {
    const d = decidirIngestao(em(15), em(5, 10), JANELAS)
    expect(d.deveIngerir).toBe(false)
    expect(d.motivo).toBe('fora_da_janela')
  })

  it('o intervalo mínimo tem precedência sobre a janela', () => {
    // Cruzaria a janela das 5h, mas faz so 10 minutos da ultima ingestao.
    const d = decidirIngestao(em(5, 5), em(4, 55), JANELAS)
    expect(d.deveIngerir).toBe(false)
    expect(d.motivo).toBe('muito_recente')
  })

  it('o intervalo mínimo é de 90 minutos', () => {
    expect(INTERVALO_MINIMO_MS).toBe(90 * 60_000)
  })
})

describe('msAteProximaJanela', () => {
  it('aponta para as 5h de amanha quando ja passou', () => {
    expect(msAteProximaJanela(em(10), JANELAS)).toBe(19 * 3_600_000)
  })

  it('aponta para as 5h de hoje quando ainda nao chegou', () => {
    expect(msAteProximaJanela(em(3), JANELAS)).toBe(2 * 3_600_000)
  })

  it('é sempre positivo', () => {
    for (let h = 0; h < 24; h++) {
      expect(msAteProximaJanela(em(h, 30), JANELAS)).toBeGreaterThan(0)
    }
  })
})
