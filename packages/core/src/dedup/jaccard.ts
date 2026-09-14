import { tokenize } from './simhash.js'

/** Trigramas de caracteres sobre o texto normalizado sem espaços. */
export function trigrams(text: string): Set<string> {
  const base = tokenize(text).join('')
  const saida = new Set<string>()
  for (let i = 0; i + 3 <= base.length; i++) saida.add(base.slice(i, i + 3))
  return saida
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersecao = 0
  const [menor, maior] = a.size <= b.size ? [a, b] : [b, a]
  for (const item of menor) if (maior.has(item)) intersecao++
  const uniao = a.size + b.size - intersecao
  return uniao === 0 ? 0 : intersecao / uniao
}
