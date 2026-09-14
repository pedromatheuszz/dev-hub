import { Parser } from 'htmlparser2'

const DESCARTAR_CONTEUDO = new Set(['script', 'style', 'noscript', 'iframe', 'svg'])

/**
 * Tags que separam palavras. Só elas geram espaço — o htmlparser2 emite
 * cada entidade decodificada como um evento de texto próprio, então juntar
 * TODOS os pedaços com espaço quebraria "café" em "caf é".
 */
const BLOCO = new Set([
  'p', 'div', 'br', 'hr', 'li', 'ul', 'ol', 'dl', 'dt', 'dd',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre',
  'section', 'article', 'header', 'footer', 'aside', 'main', 'nav',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'figure', 'figcaption',
])

/** Extrai texto puro. Blocos viram separação por espaço. */
export function htmlToText(html: string): string {
  if (!html) return ''
  const partes: string[] = []
  let ignorando = 0

  const p = new Parser(
    {
      onopentag(nome) {
        if (DESCARTAR_CONTEUDO.has(nome)) { ignorando++; return }
        if (BLOCO.has(nome)) partes.push(' ')
      },
      ontext(t) { if (ignorando === 0) partes.push(t) },
      onclosetag(nome) {
        if (DESCARTAR_CONTEUDO.has(nome)) { if (ignorando > 0) ignorando--; return }
        if (BLOCO.has(nome)) partes.push(' ')
      },
    },
    { decodeEntities: true },
  )
  p.write(html)
  p.end()

  return partes.join('').replace(/\s+/g, ' ').trim()
}

const TAGS_PERMITIDAS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'a', 'img', 'figure', 'figcaption',
])
const ATRIBUTOS_PERMITIDOS: Record<string, Set<string>> = {
  a: new Set(['href']),
  img: new Set(['src', 'alt']),
}
const VAZIAS = new Set(['br', 'img'])

function urlSegura(v: string): boolean {
  const s = v.trim().toLowerCase()
  return s.startsWith('http://') || s.startsWith('https://')
}

function escaparTexto(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Sanitiza por allowlist de tags e atributos. Descarta conteúdo de script/style. */
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  const saida: string[] = []
  const pilha: string[] = []
  let ignorando = 0

  const p = new Parser(
    {
      onopentag(nome, attrs) {
        if (DESCARTAR_CONTEUDO.has(nome)) { ignorando++; return }
        if (ignorando > 0 || !TAGS_PERMITIDAS.has(nome)) return

        const permitidos = ATRIBUTOS_PERMITIDOS[nome]
        let attrTexto = ''
        if (permitidos) {
          for (const [k, v] of Object.entries(attrs)) {
            if (!permitidos.has(k)) continue
            if ((k === 'href' || k === 'src') && !urlSegura(v)) continue
            attrTexto += ` ${k}="${escaparTexto(v)}"`
          }
        }
        saida.push(`<${nome}${attrTexto}>`)
        if (!VAZIAS.has(nome)) pilha.push(nome)
      },
      ontext(t) { if (ignorando === 0) saida.push(escaparTexto(t)) },
      onclosetag(nome) {
        if (DESCARTAR_CONTEUDO.has(nome)) { if (ignorando > 0) ignorando--; return }
        if (ignorando > 0 || !TAGS_PERMITIDAS.has(nome) || VAZIAS.has(nome)) return
        if (pilha[pilha.length - 1] === nome) { pilha.pop(); saida.push(`</${nome}>`) }
      },
    },
    { decodeEntities: true },
  )
  p.write(html)
  p.end()

  while (pilha.length) saida.push(`</${pilha.pop()}>`)
  return saida.join('')
}
