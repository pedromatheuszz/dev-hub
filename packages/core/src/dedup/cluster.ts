import { jaccard, trigrams } from './jaccard.js'
import { hamming, tokenize } from './simhash.js'

export const HAMMING_MESMO = 3
export const HAMMING_CINZA = 12
export const JACCARD_MESMO = 0.7

/**
 * Limiar da zona cinzenta, calibrado com medições reais em títulos curtos.
 * Duas manchetes sobre o MESMO evento com palavras diferentes ficam em
 * hamming 23 / jaccard 0.234 — o SimHash não as distingue de manchetes sem
 * relação nenhuma (hamming 28), mas o Jaccard sim (0.234 contra 0.029).
 * Por isso o Jaccard manda na zona cinzenta, com limiar baixo.
 */
export const JACCARD_CINZA = 0.2

/**
 * Teto de pares duvidosos por rodada. A zona cinzenta é O(n²) e cada par
 * vira trabalho para a IA — sem teto, uma ingestão grande estouraria a cota.
 * Ficam os mais parecidos, que são os candidatos mais prováveis.
 */
export const MAX_PARES_CINZA = 50

/**
 * Janela máxima entre dois artigos da mesma história.
 *
 * Uma "história" é um EVENTO no tempo. Sem esta guarda, títulos
 * formulaicos destroem o agrupamento: "Node.js 6.11.3 (LTS)" e
 * "Node.js 10.16.1 (LTS)" diferem só em dígitos, e o union-find encadeia
 * transitivamente uma década inteira de anúncios de release numa
 * "história" só — medido: 200 artigos num cluster.
 */
export const JANELA_CLUSTER_HORAS = 72
const MS_POR_HORA = 3_600_000

/**
 * Reconhece token de versão: `26_8_1`, `v12`, `rc3`, `beta2`.
 * O `_` vem do tokenize, que preserva o ponto entre dígitos.
 */
const TOKEN_VERSAO = /^(v\d+|\d+(_\d+)+|(rc|beta|alpha|pre|preview|dev|m)\d+)$/

/**
 * Palavras que qualificam um release e vêm seguidas do número, separadas
 * por espaço: "alpha 4", "candidate 2", "beta 3". Sem isto, "Python 3.15.0
 * alpha 4" e "alpha 5" ficavam com o mesmo conjunto de versões — o "4" e o
 * "5" soltos não são reconhecidos como versão sozinhos.
 */
const QUALIFICADOR_COM_NUMERO =
  /\b(alpha|beta|rc|candidate|preview|patch|build|milestone)\s+(\d+)\b/g

export function versoesNoTitulo(titulo: string): Set<string> {
  const saida = new Set(tokenize(titulo).filter((t) => TOKEN_VERSAO.test(t)))

  // Feito sobre o texto, não sobre os tokens: o tokenize descarta tokens de
  // um caractere, então o "4" de "alpha 4" nunca chegaria aqui.
  const normalizado = titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  for (const m of normalizado.matchAll(QUALIFICADOR_COM_NUMERO)) {
    saida.add(`${m[1]}_${m[2]}`)
  }
  return saida
}

/**
 * Dois artigos que citam versões DIFERENTES são eventos diferentes, por mais
 * parecidos que os títulos sejam.
 *
 * Sem isto, "Node.js 26.8.0" e "26.8.1" viravam a mesma história — títulos
 * quase idênticos, publicados com dias de diferença. O mesmo valia para
 * "Linux 7.3-rc3" e "7.3-rc4", e para a cadeia de guias de migração
 * "v12 to v14" / "v14 to v16" / "v16 to v18".
 *
 * A regra só decide quando AMBOS citam versão. Se um deles não cita, cai na
 * comparação normal de similaridade — senão "Rust 1.90 lançado" nunca
 * agruparia com "Rust lança nova versão".
 */
export function versoesConflitam(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false
  if (a.size !== b.size) return true
  for (const v of a) if (!b.has(v)) return true
  return false
}

export interface ClusterInput {
  id: string
  title: string
  simhash: string
  publishedAt: number
}

export interface Cluster {
  members: string[]
  /** O artigo mais antigo do grupo — quem noticiou primeiro. */
  primaryId: string
  /** Pares duvidosos, para a IA decidir na Fase 5. Vazio quando não há dúvida. */
  grayPairs: Array<[string, string]>
}

/** Union-find com compressão de caminho. */
function criarUniao(n: number) {
  const pai = Array.from({ length: n }, (_, i) => i)
  function achar(x: number): number {
    while (pai[x]! !== x) { pai[x] = pai[pai[x]!]!; x = pai[x]! }
    return x
  }
  return {
    achar,
    unir(a: number, b: number) {
      const ra = achar(a)
      const rb = achar(b)
      if (ra !== rb) pai[rb] = ra
    },
  }
}

/**
 * Agrupa artigos que falam do mesmo evento usando só sinais lexicais.
 * Dois estágios do spec §4.2: o que é claramente igual entra no cluster;
 * o que é duvidoso sai em grayPairs para a IA resolver de carona no lote.
 */
export function clusterArticles(items: ClusterInput[]): Cluster[] {
  if (items.length === 0) return []

  const uniao = criarUniao(items.length)
  const tri = items.map((i) => trigrams(i.title))
  const versoes = items.map((i) => versoesNoTitulo(i.title))
  const candidatos: Array<{ par: [string, string]; sim: number }> = []

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      // Fora da janela de tempo, nem é considerado: eventos diferentes.
      const distanciaHoras =
        Math.abs(items[i]!.publishedAt - items[j]!.publishedAt) / MS_POR_HORA
      if (distanciaHoras > JANELA_CLUSTER_HORAS) continue

      const dist = hamming(items[i]!.simhash, items[j]!.simhash)
      const sim = jaccard(tri[i]!, tri[j]!)

      // Versões diferentes = releases diferentes, por mais parecido que seja
      // o título. Fica como par duvidoso para a IA, mas nunca vira a mesma
      // história por semelhança lexical.
      if (versoesConflitam(versoes[i]!, versoes[j]!)) {
        if (sim >= JACCARD_CINZA) candidatos.push({ par: [items[i]!.id, items[j]!.id], sim })
        continue
      }

      if (dist <= HAMMING_MESMO || sim >= JACCARD_MESMO) {
        uniao.unir(i, j)
      } else if (sim >= JACCARD_CINZA || dist <= HAMMING_CINZA) {
        candidatos.push({ par: [items[i]!.id, items[j]!.id], sim })
      }
    }
  }

  // Só os mais parecidos passam do teto, para não estourar a cota de IA.
  const cinzas = candidatos
    .sort((a, b) => b.sim - a.sim)
    .slice(0, MAX_PARES_CINZA)
    .map((c) => c.par)

  // Agrupa por raiz preservando a ordem de entrada — resultado determinístico.
  const porRaiz = new Map<number, number[]>()
  for (let i = 0; i < items.length; i++) {
    const r = uniao.achar(i)
    const lista = porRaiz.get(r)
    if (lista) lista.push(i)
    else porRaiz.set(r, [i])
  }

  const clusters: Cluster[] = []
  for (const indices of porRaiz.values()) {
    const membros = indices.map((i) => items[i]!)
    const idsDoGrupo = new Set(membros.map((m) => m.id))
    const primario = membros.reduce((a, b) => (b.publishedAt < a.publishedAt ? b : a))

    clusters.push({
      members: membros.map((m) => m.id),
      primaryId: primario.id,
      // Só interessa a dúvida que cruza a fronteira deste cluster.
      grayPairs: cinzas.filter(([x, y]) => idsDoGrupo.has(x) !== idsDoGrupo.has(y)),
    })
  }
  return clusters
}
