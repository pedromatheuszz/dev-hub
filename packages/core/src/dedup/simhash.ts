const MASCARA_64 = (1n << 64n) - 1n

/** FNV-1a 64-bit. BigInt é lento, mas roda em Hermes e no V8 sem nativos. */
function hash64(s: string): bigint {
  let h = 0xcbf29ce484222325n
  const primo = 0x100000001b3n
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i))
    h = (h * primo) & MASCARA_64
  }
  return h
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1)
}

/** SimHash de 64 bits sobre saco de palavras. Devolve 16 chars hex. */
export function simhash(text: string): string {
  const tokens = tokenize(text)
  if (tokens.length === 0) return '0'.repeat(16)

  const pesos = new Array<number>(64).fill(0)
  for (const t of tokens) {
    const h = hash64(t)
    for (let i = 0; i < 64; i++) {
      pesos[i]! += ((h >> BigInt(i)) & 1n) === 1n ? 1 : -1
    }
  }

  let saida = 0n
  for (let i = 0; i < 64; i++) {
    if (pesos[i]! > 0) saida |= 1n << BigInt(i)
  }
  return saida.toString(16).padStart(16, '0')
}

export function hamming(a: string, b: string): number {
  let x = (BigInt(`0x${a}`) ^ BigInt(`0x${b}`)) & MASCARA_64
  let bits = 0
  while (x > 0n) { bits += Number(x & 1n); x >>= 1n }
  return bits
}
