import type { EstadoIA, ModeloIA } from '@devhub/state'
import { useEffect, useState } from 'react'
import { api } from '../api.js'

/**
 * Configuração da camada de IA.
 *
 * A chave só entra: nunca volta do processo main para cá. O que a interface
 * sabe é se existe uma chave, não qual é. Ela fica cifrada pelo safeStorage
 * do Windows (DPAPI), decifrável apenas por esta conta de usuário.
 */
export function AiSettings() {
  const [estado, setEstado] = useState<EstadoIA | null>(null)
  const [modelos, setModelos] = useState<ModeloIA[]>([])
  const [chave, setChave] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function recarregar() {
    setEstado(await api.aiState())
  }

  useEffect(() => { void recarregar() }, [])

  async function salvarChave() {
    setSalvando(true)
    setErro(null)
    try {
      await api.setApiKey(chave)
      setChave('')
      const lista = await api.aiModels()
      setModelos(lista)
      if (lista.length === 0 && chave.trim().length > 0) {
        setErro('A chave foi salva, mas nenhum modelo respondeu. Verifique se ela é válida.')
      }
      await recarregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  async function carregarModelos() {
    setSalvando(true)
    try {
      setModelos(await api.aiModels())
    } finally {
      setSalvando(false)
    }
  }

  async function escolherModelo(id: string) {
    await api.setAiModel(id)
    await recarregar()
  }

  if (!estado) return <div className="skeleton" style={{ height: 120 }} />

  const usandoIA = estado.provider === 'gemini'
  const pctCota = estado.tetoDiario > 0
    ? Math.min(100, Math.round((estado.requisicoesHoje / estado.tetoDiario) * 100))
    : 0

  return (
    <>
      <div className="section-head">
        <h2>Inteligência artificial</h2>
        <span className={`chip ${usandoIA ? 'chip-ai' : 'chip-type'}`}>
          {usandoIA ? `Gemini · ${estado.model}` : 'Heurística local'}
        </span>
      </div>

      {!usandoIA && (
        <div className="banner banner-info">
          <span aria-hidden="true">ℹ</span>
          <span>
            {estado.motivoHeuristica === 'sem_chave'
              ? 'Sem chave configurada, o Dev Hub usa classificação e resumo heurísticos, '
                + 'que rodam localmente e sem custo. Tudo funciona — os resumos são '
                + 'recortes do próprio artigo, em vez de texto novo.'
              : 'Chave configurada, mas nenhum modelo escolhido ainda. Carregue a lista abaixo.'}
          </span>
        </div>
      )}

      <div className="setting-row">
        <div style={{ flex: 1 }}>
          <div className="setting-label">Chave da API do Gemini</div>
          <div className="setting-hint">
            Gere em <span className="mono">aistudio.google.com/apikey</span>. Fica cifrada
            pelo Windows e nunca é enviada de volta para a interface.
            {estado.temChave && ' Há uma chave salva.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
          <input
            type="password"
            className="campo"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            placeholder={estado.temChave ? '••••••••••  (substituir)' : 'Colar a chave'}
            aria-label="Chave da API do Gemini"
          />
          <button className="btn btn-primary" onClick={() => void salvarChave()} disabled={salvando}>
            {salvando ? '…' : 'Salvar'}
          </button>
          {estado.temChave && (
            <button
              className="btn"
              onClick={() => { setChave(''); void api.setApiKey('').then(recarregar) }}
              title="Remover a chave e voltar para a heurística"
            >
              Remover
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div className="banner banner-error" role="alert">
          <span aria-hidden="true">⚠</span><span>{erro}</span>
        </div>
      )}

      {estado.temChave && (
        <div className="setting-row">
          <div style={{ flex: 1 }}>
            <div className="setting-label">Modelo</div>
            <div className="setting-hint">
              A lista vem do próprio provedor em tempo de execução — nenhum nome
              de modelo está fixado no código.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
            {modelos.length > 0 ? (
              <select
                className="campo"
                value={estado.model}
                onChange={(e) => void escolherModelo(e.target.value)}
                aria-label="Modelo do Gemini"
              >
                <option value="">Escolher…</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>{m.name || m.id}</option>
                ))}
              </select>
            ) : (
              <button className="btn" onClick={() => void carregarModelos()} disabled={salvando}>
                {salvando ? '…' : 'Carregar modelos'}
              </button>
            )}
          </div>
        </div>
      )}

      {usandoIA && (
        <div className="setting-row">
          <div style={{ flex: 1 }}>
            <div className="setting-label">Consumo de hoje</div>
            <div className="setting-hint">
              {estado.requisicoesHoje} de {estado.tetoDiario} requisições ·{' '}
              {estado.tokensHoje.toLocaleString('pt-BR')} tokens. O teto já inclui
              20% de margem sobre o limite do provedor, e a ingestão pausa sozinha
              ao atingi-lo.
            </div>
            <div className="barra-cota" aria-hidden="true">
              <div
                className="barra-cota-preenchida"
                style={{
                  width: `${pctCota}%`,
                  background: pctCota > 85 ? 'var(--danger)' : 'var(--accent)',
                }}
              />
            </div>
          </div>
          <span className="mono" style={{ fontSize: 'var(--fs-lg)' }}>{pctCota}%</span>
        </div>
      )}
    </>
  )
}
