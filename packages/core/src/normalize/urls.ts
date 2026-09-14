const PARAMS_LIXO = [
  /^utm_/i, /^fbclid$/i, /^gclid$/i, /^mc_/i, /^ref$/i,
  /^source$/i, /^igshid$/i, /^_hs/i,
]

export function canonicalizeUrl(url: string): string {
  let u: URL
  try { u = new URL(url) } catch { return url }

  u.hash = ''
  u.hostname = u.hostname.toLowerCase()

  for (const chave of [...u.searchParams.keys()]) {
    if (PARAMS_LIXO.some((p) => p.test(chave))) u.searchParams.delete(chave)
  }
  u.search = u.searchParams.toString() ? `?${u.searchParams.toString()}` : ''

  if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.slice(0, -1)
  }
  return u.toString()
}

/** FNV-1a 32-bit em hex. Estável entre execuções e entre plataformas. */
export function stableId(canonicalUrl: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < canonicalUrl.length; i++) {
    h ^= canonicalUrl.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
