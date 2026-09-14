import { tokenize } from '../dedup/simhash.js'

/**
 * Vocabulário de corte. Não precisa ser exaustivo: só suficiente para
 * separar "é sobre tecnologia" de "não é", antes de gastar cota de IA.
 * A classificação fina fica com a taxonomia.
 */
const TERMOS_TECNICOS = new Set([
  // linguagens
  'python', 'javascript', 'typescript', 'java', 'rust', 'golang', 'go',
  'kotlin', 'swift', 'php', 'ruby', 'dart', 'scala', 'elixir', 'haskell',
  'csharp', 'cpp', 'sql', 'wasm', 'webassembly', 'assembly', 'bash',
  // frameworks e ferramentas
  'react', 'nextjs', 'vue', 'angular', 'svelte', 'node', 'nodejs', 'deno',
  'bun', 'django', 'flask', 'fastapi', 'laravel', 'spring', 'rails',
  'flutter', 'electron', 'tauri', 'docker', 'kubernetes', 'terraform',
  'git', 'github', 'gitlab', 'webpack', 'vite', 'babel', 'eslint',
  // infraestrutura e engenharia
  'api', 'rest', 'graphql', 'backend', 'frontend', 'fullstack', 'devops',
  'cicd', 'microservices', 'serverless', 'database', 'postgres', 'mysql',
  'redis', 'mongodb', 'sqlite', 'kafka', 'compiler', 'compilador',
  'runtime', 'framework', 'biblioteca', 'library', 'sdk', 'cli',
  'kernel', 'linux', 'windows', 'android', 'ios', 'macos', 'unix',
  'cloud', 'aws', 'azure', 'gcp', 'servidor', 'server', 'container',
  'deploy', 'build', 'debug', 'refactor', 'commit', 'merge', 'branch',
  'software', 'hardware', 'browser', 'navegador', 'chrome', 'firefox',
  // hardware
  'gpu', 'cpu', 'ram', 'ssd', 'nvme', 'chip', 'processador', 'processor',
  'nvidia', 'amd', 'intel', 'arm', 'risc', 'qualcomm', 'snapdragon',
  'placa', 'motherboard', 'firmware', 'benchmark', 'overclock',
  // IA e pesquisa
  'ai', 'ia', 'llm', 'gpt', 'claude', 'gemini', 'machine', 'learning',
  'neural', 'transformer', 'embedding', 'inference', 'training', 'modelo',
  'dataset', 'quantum', 'robotics', 'robotica', 'algoritmo', 'algorithm',
  // segurança
  'security', 'seguranca', 'vulnerability', 'vulnerabilidade', 'cve',
  'exploit', 'patch', 'encryption', 'criptografia', 'malware', 'ransomware',
  // ecossistema
  'opensource', 'developer', 'desenvolvedor', 'programming',
  'programacao', 'code', 'codigo', 'release', 'version', 'versao',
  'beta', 'changelog', 'bug', 'feature', 'protocol', 'protocolo',
])

const PESO_TITULO = 3

/**
 * Constante de saturação. Com ela, 3 pontos de evidência (um termo no
 * título, ou três no corpo) dão 0.43 — logo acima do limiar.
 */
const SATURACAO = 4

/** Um termo no título, ou três no corpo. Abaixo disso não vale gastar IA. */
export const LIMIAR_RELEVANCIA = 0.4

/**
 * Mede FORÇA DE EVIDÊNCIA técnica, não fração de palavras técnicas.
 *
 * A fração seria a métrica errada em dois sentidos: puniria um artigo
 * técnico bem escrito, que naturalmente tem muitas palavras comuns, e
 * premiaria o título degenerado "api", que daria 3/3 = 1.0 por ter uma
 * palavra só. Aqui a pontuação satura: cada acerto adiciona menos que o
 * anterior, e nenhum texto curto consegue nota alta por acidente.
 *
 * Termos distintos, não ocorrências — repetir "api" dez vezes não ajuda.
 */
export function relevanceScore(title: string, text: string): number {
  const tokensTitulo = new Set(tokenize(title))
  const tokensTexto = new Set(tokenize(text))
  if (tokensTitulo.size === 0 && tokensTexto.size === 0) return 0

  let acertos = 0
  for (const t of tokensTitulo) {
    if (TERMOS_TECNICOS.has(t)) acertos += PESO_TITULO
  }
  for (const t of tokensTexto) {
    if (tokensTitulo.has(t)) continue // não conta duas vezes
    if (TERMOS_TECNICOS.has(t)) acertos += 1
  }

  return acertos / (acertos + SATURACAO)
}

export function isRelevant(
  title: string,
  text: string,
  limiar = LIMIAR_RELEVANCIA,
): boolean {
  return relevanceScore(title, text) >= limiar
}
