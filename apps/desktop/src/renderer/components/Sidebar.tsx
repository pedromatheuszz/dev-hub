import { useDevHub, type Route } from '@devhub/state'

interface Entrada {
  rota: Route
  icone: string
  texto: string
  atalho: string
  cor?: string
}

const PRINCIPAL: Entrada[] = [
  { rota: { name: 'home' }, icone: '◈', texto: 'Início', atalho: '1' },
  { rota: { name: 'latest' }, icone: '↓', texto: 'Recentes', atalho: '2' },
  { rota: { name: 'trending' }, icone: '↗', texto: 'Em alta', atalho: '3' },
]

const CATEGORIAS: Entrada[] = [
  { rota: { name: 'category', category: 'technology' }, icone: '⬢', texto: 'Tecnologia', atalho: '4', cor: 'var(--technology)' },
  { rota: { name: 'category', category: 'programming' }, icone: '⌘', texto: 'Programação', atalho: '5', cor: 'var(--programming)' },
  { rota: { name: 'category', category: 'innovation' }, icone: '✦', texto: 'Inovação', atalho: '6', cor: 'var(--innovation)' },
]

const PESSOAL: Entrada[] = [
  { rota: { name: 'saved' }, icone: '★', texto: 'Salvos', atalho: '7' },
  { rota: { name: 'following' }, icone: '◎', texto: 'Seguindo', atalho: '8' },
]

function mesmaRota(a: Route, b: Route): boolean {
  if (a.name !== b.name) return false
  if (a.name === 'category' && b.name === 'category') return a.category === b.category
  return true
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const rota = useDevHub((s) => s.route)
  const navigate = useDevHub((s) => s.navigate)

  function item(e: Entrada) {
    const ativo = mesmaRota(rota, e.rota)
    return (
      <button
        key={`${e.rota.name}-${e.texto}`}
        className={`nav-item${ativo ? ' active' : ''}`}
        onClick={() => void navigate(e.rota)}
        title={collapsed ? `${e.texto} (${e.atalho})` : undefined}
        aria-current={ativo ? 'page' : undefined}
      >
        <span className="nav-icon" aria-hidden="true">{e.icone}</span>
        <span className="nav-text">{e.texto}</span>
        {e.cor && <span className="nav-dot" style={{ background: e.cor }} />}
      </button>
    )
  }

  return (
    <nav className={`sidebar${collapsed ? ' collapsed' : ''}`} aria-label="Navegação principal">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">&gt;_</div>
        <div className="brand-text">
          <span className="brand-name">Dev Hub</span>
          <span className="brand-tag">Technology · Code</span>
        </div>
      </div>

      <div className="nav-group">{PRINCIPAL.map(item)}</div>

      <span className="nav-label">Categorias</span>
      <div className="nav-group">{CATEGORIAS.map(item)}</div>

      <span className="nav-label">Meu conteúdo</span>
      <div className="nav-group">{PESSOAL.map(item)}</div>

      <div className="sidebar-foot nav-group">
        {item({ rota: { name: 'settings' }, icone: '⚙', texto: 'Configurações', atalho: '9' })}
      </div>
    </nav>
  )
}
