import type { PrefsNotificacao } from '@devhub/state'
import { useEffect, useState } from 'react'
import { api } from '../api.js'

const OPCOES: Array<[keyof PrefsNotificacao, string, string]> = [
  ['ativadas', 'Notificações', 'Desligue para não receber nenhuma.'],
  ['ultimaHora', 'Última hora', 'História confirmada por 3+ fontes em até 6h, com ao menos uma fonte oficial.'],
  ['topicosSeguidos', 'Tópicos que sigo', 'Só o que for muito relevante sobre o que você escolheu seguir.'],
]

/**
 * O padrão é silencioso: no máximo 8 por dia e nunca duas em menos de
 * 20 minutos. Notificação que se aprende a ignorar não vale nada.
 */
export function NotifSettings() {
  const [prefs, setPrefs] = useState<PrefsNotificacao | null>(null)

  useEffect(() => { void api.notifPrefs().then(setPrefs) }, [])

  async function alternar(chave: keyof PrefsNotificacao) {
    if (!prefs) return
    const novo = { ...prefs, [chave]: !prefs[chave] }
    setPrefs(novo)
    await api.setNotifPrefs(novo)
  }

  if (!prefs) return null

  return (
    <>
      <div className="section-head"><h2>Notificações</h2></div>

      {OPCOES.map(([chave, rotulo, dica]) => {
        const desabilitado = chave !== 'ativadas' && !prefs.ativadas
        return (
          <div className="setting-row" key={chave}>
            <div>
              <div className="setting-label" style={{ opacity: desabilitado ? 0.5 : 1 }}>
                {rotulo}
              </div>
              <div className="setting-hint">{dica}</div>
            </div>
            <button
              className={`interruptor${prefs[chave] ? ' on' : ''}`}
              onClick={() => void alternar(chave)}
              disabled={desabilitado}
              role="switch"
              aria-checked={Boolean(prefs[chave])}
              aria-label={rotulo}
            >
              <span className="interruptor-bolinha" />
            </button>
          </div>
        )
      })}

      <div className="setting-row" style={{ borderBottom: 'none' }}>
        <div>
          <div className="setting-label">Limites</div>
          <div className="setting-hint">
            No máximo {prefs.maxPorDia} por dia e nunca duas em menos de{' '}
            {Math.round(prefs.intervaloMinimoMs / 60000)} minutos.
          </div>
        </div>
      </div>
    </>
  )
}
