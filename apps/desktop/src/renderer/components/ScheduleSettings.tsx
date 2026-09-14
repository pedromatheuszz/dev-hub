import type { StatusAgendamento } from '@devhub/state'
import { useEffect, useState } from 'react'
import { api, tempoRelativo } from '../api.js'

function emQuanto(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.round((ms % 3_600_000) / 60_000)
  if (h === 0) return `${m} min`
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

/**
 * Estado da ingestão automática diária.
 *
 * O batimento roda a cada 10 minutos e decide se a janela das 5h foi
 * cruzada — é por isso que o app pode ficar desligado a noite toda e ainda
 * assim buscar as notícias na primeira vez que você abrir depois das 5h.
 */
export function ScheduleSettings() {
  const [status, setStatus] = useState<StatusAgendamento | null>(null)

  async function recarregar() {
    setStatus(await api.scheduleStatus())
  }

  useEffect(() => {
    void recarregar()
    const t = setInterval(() => void recarregar(), 60_000)
    return () => clearInterval(t)
  }, [])

  if (!status) return null

  const hora = `${String(status.horaDaJanela).padStart(2, '0')}:00`

  return (
    <div className="setting-row">
      <div style={{ flex: 1 }}>
        <div className="setting-label">Atualização automática</div>
        <div className="setting-hint">
          {status.automatica ? (
            <>
              Todo dia às <strong>{hora}</strong> — próxima em {emQuanto(status.proximaEm)}.
              {status.ultimaIngestao
                ? ` Última: ${tempoRelativo(status.ultimaIngestao)}.`
                : ' Ainda não rodou.'}
              <br />
              Se o computador estiver desligado na hora, ele busca na primeira
              vez que você abrir o app depois disso.
            </>
          ) : (
            <>Desligada. Só atualiza quando você clicar em “Buscar agora”.</>
          )}
        </div>
      </div>
      <button
        className={`interruptor${status.automatica ? ' on' : ''}`}
        onClick={() => void api.setAutoIngest(!status.automatica).then(recarregar)}
        role="switch"
        aria-checked={status.automatica}
        aria-label="Atualização automática diária"
      >
        <span className="interruptor-bolinha" />
      </button>
    </div>
  )
}
