import { SOURCES } from '../packages/core/src/sources/registry.ts'

const resultados = await Promise.all(SOURCES.map(async (s) => {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20000)
  try {
    const r = await fetch(s.feedUrl, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'DevHub/0.1 (+feed reader)' },
    })
    const corpo = await r.text()
    const ok = r.ok && corpo.length > 200
    return { id: s.id, status: r.status, bytes: corpo.length, ok, url: s.feedUrl }
  } catch (e) {
    return { id: s.id, status: 0, bytes: 0, ok: false, url: s.feedUrl, erro: String(e.name) }
  } finally {
    clearTimeout(t)
  }
}))

const vivas = resultados.filter((r) => r.ok)
const mortas = resultados.filter((r) => !r.ok)

for (const r of resultados.sort((a, b) => a.id.localeCompare(b.id))) {
  const marca = r.ok ? 'OK  ' : 'FALHA'
  console.log(`${marca} ${r.id.padEnd(22)} ${String(r.status).padStart(3)} ${String(r.bytes).padStart(8)}b`)
}

console.log(`\nVIVAS: ${vivas.length} / ${resultados.length}`)
if (mortas.length) {
  console.log('\nMORTAS (corrigir ou remover do registry):')
  for (const m of mortas) console.log(`  ${m.id.padEnd(22)} ${m.status || m.erro}  ${m.url}`)
}
process.exit(vivas.length >= 30 ? 0 : 1)
