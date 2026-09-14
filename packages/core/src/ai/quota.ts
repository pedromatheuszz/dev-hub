import type { Clock } from '../platform.js'

/**
 * Governador de cota — mecanismo 4 dos oito do spec §6.4.
 *
 * Token bucket por minuto + contador diário, ambos com margem de segurança.
 * O provedor pergunta antes de cada requisição; se não houver permissão, o
 * pipeline degrada para heurística em vez de tomar um 429.
 */

export interface LimitesCota {
  /** Requisições por minuto anunciadas pelo provedor. */
  porMinuto: number
  /** Requisições por dia anunciadas pelo provedor. */
  porDia: number
  /**
   * Fração dos limites que aceitamos usar. 0.8 deixa 20% de folga para
   * o caso de os limites reais serem menores do que o documentado —
   * e eles mudam sem aviso.
   */
  margem: number
}

export const LIMITES_PADRAO: LimitesCota = {
  porMinuto: 15,
  porDia: 200,
  margem: 0.8,
}

export interface EstadoCota {
  /** Dia corrente no formato AAAA-MM-DD, para saber quando zerar. */
  dia: string
  requisicoesHoje: number
}

export interface ResultadoPermissao {
  permitido: boolean
  /** Quando negado, em quantos ms vale a pena tentar de novo. */
  esperarMs: number
  motivo: 'ok' | 'limite_por_minuto' | 'limite_diario'
}

function diaDe(agora: number): string {
  return new Date(agora).toISOString().slice(0, 10)
}

export class GovernadorDeCota {
  private readonly limites: LimitesCota
  private readonly clock: Clock
  private carimbos: number[] = []
  private dia: string
  private requisicoesHoje: number

  constructor(clock: Clock, limites: LimitesCota = LIMITES_PADRAO, estado?: EstadoCota) {
    this.clock = clock
    this.limites = limites
    const hoje = diaDe(clock.now())
    this.dia = estado?.dia ?? hoje
    this.requisicoesHoje = this.dia === hoje ? (estado?.requisicoesHoje ?? 0) : 0
    if (this.dia !== hoje) this.dia = hoje
  }

  get tetoPorMinuto(): number {
    return Math.max(1, Math.floor(this.limites.porMinuto * this.limites.margem))
  }

  get tetoDiario(): number {
    return Math.max(1, Math.floor(this.limites.porDia * this.limites.margem))
  }

  private virarDiaSeNecessario(agora: number): void {
    const hoje = diaDe(agora)
    if (hoje !== this.dia) {
      this.dia = hoje
      this.requisicoesHoje = 0
    }
  }

  /** Não consome nada: só responde se caberia uma requisição agora. */
  podeRequisitar(): ResultadoPermissao {
    const agora = this.clock.now()
    this.virarDiaSeNecessario(agora)

    if (this.requisicoesHoje >= this.tetoDiario) {
      const amanha = new Date(agora)
      amanha.setUTCHours(24, 0, 0, 0)
      return {
        permitido: false,
        esperarMs: amanha.getTime() - agora,
        motivo: 'limite_diario',
      }
    }

    this.carimbos = this.carimbos.filter((t) => agora - t < 60_000)
    if (this.carimbos.length >= this.tetoPorMinuto) {
      const maisAntigo = this.carimbos[0]!
      return {
        permitido: false,
        esperarMs: Math.max(0, 60_000 - (agora - maisAntigo)),
        motivo: 'limite_por_minuto',
      }
    }

    return { permitido: true, esperarMs: 0, motivo: 'ok' }
  }

  /** Registra uma requisição efetivamente enviada. */
  registrar(): void {
    const agora = this.clock.now()
    this.virarDiaSeNecessario(agora)
    this.carimbos.push(agora)
    this.requisicoesHoje++
  }

  get estado(): EstadoCota {
    return { dia: this.dia, requisicoesHoje: this.requisicoesHoje }
  }

  get restantesHoje(): number {
    return Math.max(0, this.tetoDiario - this.requisicoesHoje)
  }
}

/**
 * Backoff exponencial com jitter — mecanismo 5. O jitter evita que todas
 * as tentativas voltem ao mesmo tempo depois de um 429.
 */
export function atrasoBackoff(tentativa: number, base = 1000, teto = 60_000): number {
  const exponencial = Math.min(teto, base * 2 ** tentativa)
  return Math.floor(exponencial * (0.5 + Math.random() * 0.5))
}
