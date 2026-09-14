import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Gera a identidade visual do Dev Hub em SVG e PNG, sem dependências.
 *
 * A marca é um prompt de terminal — `>_` — dentro de um quadrado de cantos
 * arredondados. Lê como "desenvolvedor" à primeira vista, funciona em 16px
 * na barra de tarefas e em 512px na Play Store, e não depende de fonte
 * instalada porque os traços são vetores.
 */

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const AZUL = '#2F6FED'
const AZUL_ESCURO = '#1B4FBF'

function svgMarca({ tamanho = 512, fundo = true, raio = 0.22 } = {}) {
  const t = tamanho
  const r = Math.round(t * raio)
  // Traços do ">" e do "_" desenhados em proporção ao tamanho.
  const l = t * 0.06 // espessura
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${t}" height="${t}" viewBox="0 0 ${t} ${t}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${AZUL}"/>
      <stop offset="100%" stop-color="${AZUL_ESCURO}"/>
    </linearGradient>
  </defs>
  ${fundo ? `<rect width="${t}" height="${t}" rx="${r}" fill="url(#g)"/>` : ''}
  <g fill="none" stroke="#FFFFFF" stroke-width="${l}" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="${t * 0.28},${t * 0.34} ${t * 0.47},${t * 0.5} ${t * 0.28},${t * 0.66}"/>
    <line x1="${t * 0.55}" y1="${t * 0.68}" x2="${t * 0.74}" y2="${t * 0.68}"/>
  </g>
</svg>`
}

// ---------------------------------------------------------------------
// PNG mínimo, escrito à mão: zlib "stored" + CRC32. Sem dependências.
// ---------------------------------------------------------------------

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1))
  }
  return ~c >>> 0
}

function adler32(buf) {
  let a = 1
  let b = 0
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

function chunk(tipo, dados) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo))
  return Buffer.concat([len, corpo, crc])
}

function png(largura, altura, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(largura, 0)
  ihdr.writeUInt32BE(altura, 4)
  ihdr[8] = 8   // profundidade
  ihdr[9] = 6   // RGBA
  const linhas = []
  for (let y = 0; y < altura; y++) {
    linhas.push(Buffer.from([0])) // filtro none
    linhas.push(rgba.subarray(y * largura * 4, (y + 1) * largura * 4))
  }
  const cru = Buffer.concat(linhas)

  // zlib com blocos "stored": sem compressão, mas válido e sem dependência.
  const blocos = []
  blocos.push(Buffer.from([0x78, 0x01]))
  for (let i = 0; i < cru.length; i += 65535) {
    const pedaco = cru.subarray(i, i + 65535)
    const ultimo = i + 65535 >= cru.length ? 1 : 0
    const cab = Buffer.alloc(5)
    cab[0] = ultimo
    cab.writeUInt16LE(pedaco.length, 1)
    cab.writeUInt16LE(~pedaco.length & 0xFFFF, 3)
    blocos.push(cab, pedaco)
  }
  const ad = Buffer.alloc(4)
  ad.writeUInt32BE(adler32(cru))
  blocos.push(ad)

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', Buffer.concat(blocos)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Rasteriza a marca sem canvas: geometria simples, com antialiasing por supersampling. */
function rasterizar(t, comFundo) {
  const rgba = Buffer.alloc(t * t * 4)
  const raio = t * 0.22
  const esp = t * 0.06
  const SS = 3 // amostras por eixo

  const seg = (x, y, x1, y1, x2, y2) => {
    const dx = x2 - x1
    const dy = y2 - y1
    const comp2 = dx * dx + dy * dy
    let u = comp2 === 0 ? 0 : ((x - x1) * dx + (y - y1) * dy) / comp2
    u = Math.max(0, Math.min(1, u))
    return Math.hypot(x - (x1 + u * dx), y - (y1 + u * dy))
  }

  const dentroFundo = (x, y) => {
    const cx = Math.min(Math.max(x, raio), t - raio)
    const cy = Math.min(Math.max(y, raio), t - raio)
    return Math.hypot(x - cx, y - cy) <= raio
  }

  const noTraco = (x, y) => {
    const d = Math.min(
      seg(x, y, t * 0.28, t * 0.34, t * 0.47, t * 0.50),
      seg(x, y, t * 0.47, t * 0.50, t * 0.28, t * 0.66),
      seg(x, y, t * 0.55, t * 0.68, t * 0.74, t * 0.68),
    )
    return d <= esp / 2
  }

  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      let aFundo = 0
      let aTraco = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          if (!comFundo || dentroFundo(px, py)) aFundo++
          if (noTraco(px, py)) aTraco++
        }
      }
      const n = SS * SS
      const fFundo = comFundo ? aFundo / n : 1
      const fTraco = aTraco / n

      // Gradiente azul do canto superior esquerdo ao inferior direito.
      const mistura = (x + y) / (2 * t)
      const rBase = Math.round(0x2F + (0x1B - 0x2F) * mistura)
      const gBase = Math.round(0x6F + (0x4F - 0x6F) * mistura)
      const bBase = Math.round(0xED + (0xBF - 0xED) * mistura)

      const i = (y * t + x) * 4
      const alfa = comFundo ? fFundo : fTraco
      rgba[i] = Math.round(rBase * (1 - fTraco) + 255 * fTraco)
      rgba[i + 1] = Math.round(gBase * (1 - fTraco) + 255 * fTraco)
      rgba[i + 2] = Math.round(bBase * (1 - fTraco) + 255 * fTraco)
      rgba[i + 3] = Math.round(255 * alfa)
    }
  }
  return png(t, t, rgba)
}

const saidas = [
  ['assets/icon.svg', () => Buffer.from(svgMarca({ tamanho: 512 }))],
  ['assets/icon-sem-fundo.svg', () => Buffer.from(svgMarca({ tamanho: 512, fundo: false }))],
  ['assets/icon.png', () => rasterizar(512, true)],
  ['assets/adaptive-icon.png', () => rasterizar(432, true)],
  ['assets/favicon.png', () => rasterizar(48, true)],
  ['assets/splash.png', () => rasterizar(256, true)],
  ['apps/desktop/build/icon.png', () => rasterizar(512, true)],
  ['apps/mobile/assets/icon.png', () => rasterizar(512, true)],
  ['apps/mobile/assets/adaptive-icon.png', () => rasterizar(432, true)],
  ['apps/mobile/assets/splash.png', () => rasterizar(256, true)],
]

for (const [caminho, gerar] of saidas) {
  const destino = resolve(RAIZ, caminho)
  mkdirSync(dirname(destino), { recursive: true })
  const dados = gerar()
  writeFileSync(destino, dados)
  console.log(`${caminho.padEnd(38)} ${(dados.length / 1024).toFixed(1)} kB`)
}
console.log('\nÍcones gerados.')
