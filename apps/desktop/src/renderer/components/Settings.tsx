import { useDevHub, type SourceInfo, type ThemePref } from '@devhub/state'
import { useEffect, useState } from 'react'
import { api, tempoRelativo } from '../api.js'

const TEMAS: Array<[ThemePref, string]> = [
  ['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Escuro'],
]

const ROTULO_TIPO_FONTE: Record<string, string> = {
  official: 'Oficial', research: 'Pesquisa', news: 'Notícias',
  blog: 'Blog', aggregator: 'Agregador',
}

export function Settings() {
  const themePref = useDevHub((s) => s.themePref)
  const setThemePref = useDevHub((s) => s.setThemePref)
  const fontScale = useDevHub((s) => s.fontScale)
  const setFontScale = useDevHub((s) => s.setFontScale)
  const ingesting = useDevHub((s) => s.ingesting)
  const runIngest = useDevHub((s) => s.runIngest)
  const lastIngest = useDevHub((s) => s.lastIngest)

  const [fontes, setFontes] = useState<SourceInfo[]>([])

  useEffect(() => { void api.sources().then(setFontes) }, [ingesting])

  return (
    <div className="settings">
      <div className="section-head"><h2>Aparência</h2></div>

      <div className="setting-row">
        <div>
          <div className="setting-label">Tema</div>
          <div className="setting-hint">
            “Sistema” acompanha a preferência do Windows automaticamente.
          </div>
        </div>
        <div className="segmented" role="group" aria-label="Tema">
          {TEMAS.map(([v, rotulo]) => (
            <button
              key={v}
              className={themePref === v ? 'on' : ''}
              onClick={() => void setThemePref(v)}
              aria-pressed={themePref === v}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-label">Tamanho do texto</div>
          <div className="setting-hint">
            {Math.round(fontScale * 100)}% · atalho <span className="kbd">Ctrl</span>
            {' '}<span className="kbd">+</span> / <span className="kbd">−</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
          <button className="btn" onClick={() => void setFontScale(fontScale - 0.1)}>−</button>
          <button className="btn" onClick={() => void setFontScale(1)}>100%</button>
          <button className="btn" onClick={() => void setFontScale(fontScale + 0.1)}>+</button>
        </div>
      </div>

      <div className="section-head"><h2>Conteúdo</h2></div>

      <div className="setting-row">
        <div>
          <div className="setting-label">Buscar notícias</div>
          <div className="setting-hint">
            {lastIngest
              ? `Última vez: ${lastIngest.itensNovos} artigos novos de ${lastIngest.fontesLidas} fontes, `
                + `${lastIngest.itensFiltrados} filtrados por irrelevância.`
              : 'Baixa as novidades de todas as fontes ativas. Só o que mudou é transferido.'}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => void runIngest()} disabled={ingesting}>
          {ingesting ? <><span className="spin">◌</span> Buscando…</> : 'Buscar agora'}
        </button>
      </div>

      <div className="setting-row" style={{ borderBottom: 'none' }}>
        <div>
          <div className="setting-label">Resumos por IA</div>
          <div className="setting-hint">
            Hoje o Dev Hub usa classificação e resumo heurísticos, que rodam
            localmente e sem custo. A integração com o Gemini chega na Fase 5.
          </div>
        </div>
        <span className="chip chip-type">Heurístico</span>
      </div>

      <div className="section-head">
        <h2>Fontes</h2>
        <span className="section-count">{fontes.length} ativas</span>
      </div>

      <table className="source-table">
        <thead>
          <tr>
            <th>Fonte</th>
            <th>Tipo</th>
            <th>Confiança</th>
            <th>Última leitura</th>
          </tr>
        </thead>
        <tbody>
          {fontes.map((f) => (
            <tr key={f.id}>
              <td>{f.name}</td>
              <td>{ROTULO_TIPO_FONTE[f.kind] ?? f.kind}</td>
              <td className="mono">{f.trustWeight.toFixed(2)}</td>
              <td className="mono">
                {f.lastFetchedAt ? tempoRelativo(f.lastFetchedAt) : 'nunca'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
