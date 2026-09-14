import { describe, expect, it } from 'vitest'
import { INTERVALO_MINIMO_MS, decidirIngestao, msAteProximaJanela } from './schedule.js'

/** Constrói um instante local no dia 14/09/2026, para o teste ser determinístico. */
function em(hora: number, minuto = 0): number {
  const d = new Date(2026, 8, 14, hora, minuto, 0, 0)
  return d.getTime()
}

const JANELAS = [8, 13, 18, 22]

describe('decidirIngestao', () => {
  it('sempre ingere na primeira vez', () => {
    const d = decidirIngestao(em(3), null, JANELAS)
    expect(d.deveIngerir).toBe(true)
    expect(d.motivo).toBe('primeira_vez')
  })

  it('não ingere logo após uma ingestão', () => {
    const d = decidirIngestao(em(13, 10), em(13, 5), JANELAS)
    expect(d.deveIngerir).toBe(false)
    expect(d.motivo).toBe('muito_recente')
  })

  it('ingere quando uma janela foi cruzada', () => {
    // Última às 07h, agora 13h30: cruzou as janelas de 8h e 13h.
    const d = decidirIngestao(em(13, 30), em(7), JANELAS)
    expect(d.deveIngerir).toBe(true)
    expect(d.motivo).toBe('janela_atingida')
  })

  it('não ingere entre janelas', () => {
    // Última às 13h05, agora 15h: passou do intervalo mínimo mas não cruzou janela.
    const d = decidirIngestao(em(15), em(13, 5), JANELAS)
    expect(d.deveIngerir).toBe(false)
    expect(d.motivo).toBe('fora_da_janela')
  })

  it('o intervalo mínimo tem precedência sobre a janela', () => {
    // Cruzaria a janela das 13h, mas faz só 10 minutos da última ingestão.
    const d = decidirIngestao(em(13, 5), em(12, 55), JANELAS)
    expect(d.deveIngerir).toBe(false)
    expect(d.motivo).toBe('muito_recente')
  })

  it('o intervalo mínimo é de 90 minutos', () => {
    expect(INTERVALO_MINIMO_MS).toBe(90 * 60_000)
  })
})

describe('msAteProximaJanela', () => {
  it('aponta para a próxima janela do mesmo dia', () => {
    expect(msAteProximaJanela(em(10), JANELAS)).toBe(3 * 3_600_000)
  })

  it('vira para o dia seguinte depois da última janela', () => {
    // 23h -> próxima é 8h do dia seguinte: 9 horas.
    expect(msAteProximaJanela(em(23), JANELAS)).toBe(9 * 3_600_000)
  })

  it('é sempre positivo', () => {
    for (let h = 0; h < 24; h++) {
      expect(msAteProximaJanela(em(h, 30), JANELAS)).toBeGreaterThan(0)
    }
  })
})
