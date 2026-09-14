import type { HttpClient, Logger } from '../platform.js'
import { TAG_DICTIONARY } from '../taxonomy/dictionary.js'
import type { Category, ContentType } from '../types.js'
import { HeuristicProvider } from './heuristic.js'
import type {
  AIProvider, ArticleForAI, Classification, ModelInfo, Summary, Traducao,
} from './provider.js'
import { GovernadorDeCota, atrasoBackoff, type LimitesCota } from './quota.js'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

/** Mecanismo 1: um lote por requisição, em vez de um artigo por requisição. */
export const TAMANHO_DO_LOTE = 12

const MAX_TENTATIVAS = 3
const CATEGORIAS: Category[] = ['technology', 'programming', 'innovation']
const TIPOS: ContentType[] = [
  'news', 'announcement', 'report', 'rumor', 'opinion', 'analysis',
]
const SLUGS_VALIDOS = new Set(TAG_DICTIONARY.map((t) => t.slug))

export interface GeminiOpts {
  http: HttpClient
  logger: Logger
  apiKey: string
  model: string
  governador: GovernadorDeCota
  /** Chamado a cada requisição concluída, para o painel de consumo. */
  aoUsar?: (uso: { requisicoes: number; tokensEntrada: number; tokensSaida: number }) => void
  /** Base do backoff em ms. Os testes usam um valor mínimo para não dormir. */
  backoffBaseMs?: number
}

interface RespostaGemini {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  error?: { code?: number; message?: string; status?: string }
}

/** Erro que o pipeline reconhece como "sem cota", para degradar em silêncio. */
export class SemCotaError extends Error {
  constructor(public readonly motivo: string, public readonly esperarMs: number) {
    super(`sem cota: ${motivo}`)
    this.name = 'SemCotaError'
  }
}

/**
 * Provedor de IA sobre a camada gratuita do Gemini API.
 *
 * Implementa os mecanismos 1, 4, 5 e 7 do spec §6.4: agrupamento em lote,
 * governador de cota, backoff exponencial e degradação para heurística.
 * Os mecanismos 2, 3, 6 e 8 vivem no pipeline e na interface.
 *
 * Nunca lança para o chamador em caso de cota ou erro de rede: devolve a
 * saída heurística marcada como tal, para que o app siga funcionando.
 */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini'
  private readonly heuristico = new HeuristicProvider()

  constructor(private readonly o: GeminiOpts) {}

  async listModels(): Promise<ModelInfo[]> {
    // O modelo não é fixado no código: o app consulta e deixa o usuário
    // escolher, evitando depender de um nome que pode mudar ou sumir.
    const r = await this.o.http.get({
      url: `${BASE}/models?key=${encodeURIComponent(this.o.apiKey)}`,
      timeoutMs: 15_000,
    })
    if (r.status !== 200) return []

    try {
      const doc = JSON.parse(r.body) as {
        models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }>
      }
      return (doc.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => ({
          id: (m.name ?? '').replace(/^models\//, ''),
          name: m.displayName ?? m.name ?? '',
        }))
        .filter((m) => m.id.length > 0)
    } catch {
      return []
    }
  }

  private async gerar(prompt: string, maxTokens: number): Promise<string> {
    const permissao = this.o.governador.podeRequisitar()
    if (!permissao.permitido) {
      throw new SemCotaError(permissao.motivo, permissao.esperarMs)
    }

    let ultimoErro = 'desconhecido'

    for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
      this.o.governador.registrar()

      const r = await this.o.http.get({
        url: `${BASE}/models/${encodeURIComponent(this.o.model)}:generateContent`
          + `?key=${encodeURIComponent(this.o.apiKey)}`,
        // O HttpClient do núcleo só faz GET; o corpo vai no campo body do
        // adaptador de plataforma, que faz POST quando ele está presente.
        method: 'POST',
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: maxTokens,
            responseMimeType: 'application/json',
          },
        }),
        timeoutMs: 60_000,
      })

      if (r.status === 200) {
        const doc = JSON.parse(r.body) as RespostaGemini
        this.o.aoUsar?.({
          requisicoes: 1,
          tokensEntrada: doc.usageMetadata?.promptTokenCount ?? 0,
          tokensSaida: doc.usageMetadata?.candidatesTokenCount ?? 0,
        })
        return doc.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      }

      // 429 e 5xx merecem nova tentativa; 4xx de cliente, não.
      if (r.status !== 429 && r.status < 500) {
        ultimoErro = `HTTP ${r.status}`
        break
      }

      ultimoErro = `HTTP ${r.status}`
      const espera = atrasoBackoff(tentativa, this.o.backoffBaseMs ?? 1000)
      this.o.logger.warn(`Gemini ${r.status}; nova tentativa em ${espera}ms`)
      await new Promise((resolve) => setTimeout(resolve, espera))
    }

    throw new Error(`Gemini falhou: ${ultimoErro}`)
  }

  async classifyBatch(articles: ArticleForAI[]): Promise<Classification[]> {
    if (articles.length === 0) return []

    try {
      const texto = await this.gerar(promptDeClassificacao(articles), 4096)
      const analisado = interpretarClassificacao(texto, articles)
      if (analisado.length === articles.length) return analisado
      this.o.logger.warn('Gemini devolveu lote incompleto; usando heurística')
    } catch (e) {
      if (!(e instanceof SemCotaError)) this.o.logger.warn('classificação falhou', e)
    }

    // Mecanismo 7: nada quebra por falta de IA.
    return this.heuristico.classifyBatch(articles)
  }

  /**
   * Tradução completa, incluindo o corpo. Roda sob demanda quando o leitor
   * abre o artigo — volume baixo, ao contrário do lote de classificação.
   */
  async translate(article: ArticleForAI): Promise<Traducao | null> {
    try {
      const texto = await this.gerar(promptDeTraducao(article), 4096)
      const doc = JSON.parse(limparCercaDeCodigo(texto)) as {
        titulo?: string; resumo?: string; texto?: string
      }
      if (!doc.titulo) return null

      return {
        title: doc.titulo,
        excerpt: doc.resumo ?? '',
        contentText: doc.texto ?? null,
        provider: this.name,
        model: this.o.model,
      }
    } catch (e) {
      if (!(e instanceof SemCotaError)) this.o.logger.warn('tradução falhou', e)
      return null
    }
  }

  async summarize(article: ArticleForAI, kind: 'short' | 'deep'): Promise<Summary> {
    try {
      const texto = await this.gerar(
        promptDeResumo(article, kind),
        kind === 'deep' ? 1200 : 500,
      )
      const doc = JSON.parse(limparCercaDeCodigo(texto)) as {
        resumo?: string; pontos?: string[]
      }
      if (doc.resumo) {
        return {
          text: doc.resumo,
          keyPoints: Array.isArray(doc.pontos) ? doc.pontos.slice(0, 6) : [],
          provider: this.name,
          model: this.o.model,
          isAiGenerated: true,
        }
      }
    } catch (e) {
      if (!(e instanceof SemCotaError)) this.o.logger.warn('resumo falhou', e)
    }

    return this.heuristico.summarize(article, kind)
  }
}

// ---------------------------------------------------------------------
// Prompts e interpretação da resposta
// ---------------------------------------------------------------------

/** O modelo às vezes embrulha o JSON em cerca de código apesar do mimeType. */
export function limparCercaDeCodigo(texto: string): string {
  const t = texto.trim()
  if (!t.startsWith('```')) return t
  return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
}

function promptDeClassificacao(articles: ArticleForAI[]): string {
  const slugs = [...SLUGS_VALIDOS].join(', ')
  const itens = articles.map((a, i) =>
    `[${i}] TÍTULO: ${a.title}\nRESUMO: ${(a.excerpt || a.contentText).slice(0, 400)}`,
  ).join('\n\n')

  return `Você classifica notícias de tecnologia. Responda APENAS com JSON.

Para cada item, devolva um objeto com:
- "i": o índice do item
- "categoria": uma de ${CATEGORIAS.join(' | ')}
- "tipo": um de ${TIPOS.join(' | ')}
  (announcement = anúncio oficial, rumor = não confirmado, opinion = opinião,
   analysis = análise técnica, report = reportagem, news = notícia comum)
- "importancia": número de 0 a 1 indicando relevância técnica
- "tags": até 6 slugs desta lista, apenas os que realmente se aplicam:
${slugs}

Formato exato: {"itens":[{"i":0,"categoria":"...","tipo":"...","importancia":0.7,"tags":["..."]}]}

ITENS:
${itens}`
}

function promptDeTraducao(a: ArticleForAI): string {
  return `Traduza esta notícia de tecnologia para português do Brasil.

Regras:
- Traduza o sentido, não palavra a palavra. O texto tem que soar natural.
- Mantenha em inglês nomes próprios e termos técnicos consagrados:
  Rust, Kubernetes, borrow checker, pull request, deploy, commit, branch.
- Não resuma, não comente, não acrescente nada que não esteja no original.

Responda APENAS com JSON:
{"titulo":"...","resumo":"...","texto":"..."}

TÍTULO: ${a.title}

RESUMO: ${a.excerpt}

TEXTO:
${a.contentText.slice(0, 8000)}`
}

function promptDeResumo(a: ArticleForAI, kind: 'short' | 'deep'): string {
  const frases = kind === 'deep' ? '4 a 6' : '2 a 3'
  return `Resuma esta notícia de tecnologia em português do Brasil, em ${frases} frases.
Seja concreto e técnico. Não invente fatos que não estejam no texto.
Responda APENAS com JSON no formato:
{"resumo":"...","pontos":["ponto 1","ponto 2"]}

TÍTULO: ${a.title}

TEXTO:
${(a.contentText || a.excerpt).slice(0, 6000)}`
}

export function interpretarClassificacao(
  texto: string,
  articles: ArticleForAI[],
): Classification[] {
  let doc: { itens?: unknown }
  try {
    doc = JSON.parse(limparCercaDeCodigo(texto)) as { itens?: unknown }
  } catch {
    return []
  }
  if (!Array.isArray(doc.itens)) return []

  const porIndice = new Map<number, Classification>()

  for (const bruto of doc.itens) {
    const o = bruto as Record<string, unknown>
    const i = Number(o['i'])
    const artigo = articles[i]
    if (!artigo || porIndice.has(i)) continue

    // Tudo que vem do modelo é validado contra o vocabulário conhecido:
    // um slug inventado não pode entrar no banco.
    const categoria = CATEGORIAS.includes(o['categoria'] as Category)
      ? (o['categoria'] as Category)
      : 'technology'
    const tipo = TIPOS.includes(o['tipo'] as ContentType)
      ? (o['tipo'] as ContentType)
      : 'news'
    const importancia = Number(o['importancia'])

    const tags = (Array.isArray(o['tags']) ? o['tags'] : [])
      .filter((t): t is string => typeof t === 'string' && SLUGS_VALIDOS.has(t))
      .slice(0, 8)
      .map((slug) => ({ slug, confidence: 0.9 }))

    // Só aceita a tradução se vier completa e diferente do original —
    // o modelo às vezes devolve o título em inglês de volta.
    const tituloPt = typeof o['titulo_pt'] === 'string' ? o['titulo_pt'].trim() : ''
    const resumoPt = typeof o['resumo_pt'] === 'string' ? o['resumo_pt'].trim() : ''
    const traduziu = tituloPt.length > 0 && tituloPt !== artigo.title

    porIndice.set(i, {
      articleId: artigo.id,
      category: categoria,
      contentType: tipo,
      importance: Number.isFinite(importancia)
        ? Math.min(1, Math.max(0, importancia))
        : 0.5,
      tags,
      ...(traduziu ? { translation: { title: tituloPt, excerpt: resumoPt } } : {}),
      isAiGenerated: true,
    })
  }

  return articles.map((_, i) => porIndice.get(i)).filter((c): c is Classification => !!c)
}

export type { LimitesCota }
