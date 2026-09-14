# Dev Hub Fase 1 — Núcleo de Ingestão — Plano de Implementação

> **Para executores agênticos:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar este plano tarefa a tarefa. Os passos usam caixas de seleção (`- [ ]`) para acompanhamento.

**Goal:** Construir o núcleo em TypeScript puro que ingere feeds reais de tecnologia, deduplica, classifica por heurística, ranqueia e persiste em SQLite — verificável por uma CLI que imprime o feed ranqueado.

**Architecture:** Monorepo com workspaces do npm. `packages/core` é TypeScript puro sem nenhuma dependência de plataforma: tudo que toca o mundo externo (HTTP, relógio, log, segredos) entra por injeção da interface `Platform`. `packages/db` isola o SQLite atrás de uma interface `SqlDriver` com um driver `node:sqlite` nesta fase e um driver `expo-sqlite` na Fase 3. `tools/cli` monta as peças e é o entregável verificável.

**Tech Stack:** TypeScript 5 (strict), Node 24.20.0, npm workspaces, Vitest, `node:sqlite` (embutido no Node 24, FTS5 confirmado), `fast-xml-parser`, `htmlparser2`, `zod`, `tsx`.

**Spec:** [`docs/superpowers/specs/2026-09-13-dev-hub-design.md`](../specs/2026-09-13-dev-hub-design.md)

## Global Constraints

Estas regras valem para **todas** as tarefas deste plano. Os requisitos de cada tarefa incluem implicitamente esta seção.

- **TypeScript `strict: true`** em todos os pacotes. Sem `any` implícito, sem `@ts-ignore`.
- **`packages/core` não importa nada de plataforma.** Proibido: `node:fs`, `node:http`, `fetch` global, `window`, `document`, APIs do Electron, APIs do React Native. Tudo externo entra pela interface `Platform` (Tarefa 2). Esta regra é verificada por teste automatizado na Tarefa 2.
- **O relógio é sempre injetado.** Nunca `Date.now()` nem `new Date()` sem argumento dentro de `packages/core`. Use `platform.clock.now()`. Isso torna determinísticos os testes de frescor e de janela de tendência.
- **Toda entrada externa passa por Zod** antes de tocar o banco.
- **Nenhum segredo em código, em log ou em SQLite puro.** Nenhuma chave de API é lida nesta fase.
- **Todo texto gerado por IA carrega `isAiGenerated: true`** e nunca é exibido sem rótulo. Nesta fase o único gerador é o `HeuristicProvider`, que também marca suas saídas.
- **Falha em uma fonte nunca derruba o pipeline.** Todo parser e toda etapa de rede isolam erro por fonte.
- **Nomes de identificadores em inglês** (código), **comentários e mensagens de commit em português**.
- Node **24.20.0**, npm **12.0.2**. Sem dependências nativas que exijam compilação.

---

## Estrutura de Arquivos

```
dev-hub/
├─ package.json                          workspaces + scripts raiz
├─ tsconfig.base.json                    strict, ES2022, NodeNext
├─ .gitignore
├─ packages/
│  ├─ core/
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  └─ src/
│  │     ├─ index.ts                     re-exports públicos
│  │     ├─ platform.ts                  Platform, HttpClient, Clock, Logger, SecretStore
│  │     ├─ types.ts                     Source, Article, Story, Tag, Classification
│  │     ├─ testing/fakes.ts             fakeClock, fakeHttp, silentLogger
│  │     ├─ feeds/detect.ts              detectFormat
│  │     ├─ feeds/rss.ts                 parseRss
│  │     ├─ feeds/atom.ts                parseAtom
│  │     ├─ feeds/jsonfeed.ts            parseJsonFeed
│  │     ├─ feeds/index.ts               parseFeed (despacha por formato)
│  │     ├─ normalize/html.ts            htmlToText, sanitizeHtml
│  │     ├─ normalize/dates.ts           parseFeedDate
│  │     ├─ normalize/urls.ts            canonicalizeUrl
│  │     ├─ normalize/article.ts         normalizeItem
│  │     ├─ dedup/simhash.ts             simhash, hamming
│  │     ├─ dedup/jaccard.ts             trigrams, jaccard
│  │     ├─ dedup/cluster.ts             clusterArticles
│  │     ├─ filter/prefilter.ts          relevanceScore, isRelevant
│  │     ├─ taxonomy/dictionary.ts       TAG_DICTIONARY
│  │     ├─ taxonomy/classify.ts         categoryOf, tagsOf, contentTypeOf
│  │     ├─ ai/provider.ts               AIProvider, tipos de retorno
│  │     ├─ ai/heuristic.ts              HeuristicProvider
│  │     ├─ rank/freshness.ts            freshness
│  │     ├─ rank/score.ts                scoreStory, ScoreBreakdown
│  │     ├─ rank/breaking.ts             isBreaking
│  │     ├─ sources/registry.ts          SOURCES (30+ feeds)
│  │     └─ ingest/pipeline.ts           runIngest
│  └─ db/
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ src/
│        ├─ index.ts
│        ├─ driver.ts                    SqlDriver (interface)
│        ├─ drivers/node-sqlite.ts       NodeSqliteDriver
│        ├─ schema.ts                    MIGRATIONS
│        ├─ migrate.ts                   migrate
│        └─ repos/{sources,articles,stories,tags,search}.ts
└─ tools/cli/
   ├─ package.json
   └─ src/index.ts                       devhub ingest | feed | search | sources
```

**Ordem de dependência:** `core` não depende de ninguém. `db` depende só dos tipos de `core`. `tools/cli` depende dos dois.

---

## Tarefa 1: Fundação do monorepo

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`, `packages/core/src/smoke.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: workspaces `@devhub/core` e `@devhub/db` resolvíveis; `npm test` executa Vitest em todos os pacotes

- [ ] **Passo 1: Criar o `package.json` raiz**

```json
{
  "name": "dev-hub",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24.0.0" },
  "workspaces": ["packages/*", "tools/*"],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b packages/core packages/db tools/cli"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0",
    "tsx": "^4.19.0"
  }
}
```

- [ ] **Passo 2: Criar o `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": false,
    "declaration": true,
    "composite": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Passo 3: Criar o `.gitignore`**

```
node_modules/
dist/
*.tsbuildinfo
*.db
*.db-journal
*.db-wal
.env
.env.*
data/
coverage/
.DS_Store
```

- [ ] **Passo 4: Criar o pacote `core`**

`packages/core/package.json`:

```json
{
  "name": "@devhub/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run" }
}
```

`packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"]
}
```

`packages/core/src/index.ts`:

```typescript
export const CORE_VERSION = '0.1.0'
```

- [ ] **Passo 5: Escrever o teste de fumaça que também prova o FTS5**

`packages/core/src/smoke.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { CORE_VERSION } from './index.js'

describe('fundação', () => {
  it('exporta a versão do core', () => {
    expect(CORE_VERSION).toBe('0.1.0')
  })

  // Este teste existe para falhar cedo e alto se o Node embarcado
  // perder o FTS5 — toda a busca da Fase 2 depende dele.
  it('o node:sqlite embutido suporta FTS5 com ranking BM25', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('CREATE VIRTUAL TABLE f USING fts5(title, body)')
    db.prepare('INSERT INTO f VALUES(?, ?)').run('Rust 1.90', 'memory safety without gc')
    const rows = db.prepare(
      'SELECT title, rank FROM f WHERE f MATCH ? ORDER BY rank',
    ).all('memory') as Array<{ title: string; rank: number }>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title).toBe('Rust 1.90')
    expect(rows[0]!.rank).toBeLessThan(0) // BM25: mais negativo = mais relevante
    db.close()
  })
})
```

- [ ] **Passo 6: Instalar e rodar**

```bash
npm install
npm test
```

Esperado: 2 testes passando. Se o teste de FTS5 falhar, **pare** — o plano do banco (Tarefa 11) precisa ser revisto antes de continuar.

- [ ] **Passo 7: Commit**

```bash
git add package.json tsconfig.base.json .gitignore packages/core package-lock.json
git commit -m "feat: fundação do monorepo com workspaces e Vitest

Verifica no teste de fumaça que o node:sqlite embutido no Node 24
tem FTS5 com ranking BM25 — remove a necessidade de better-sqlite3
e de qualquer dependência nativa compilada.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarefa 2: Tipos do domínio, interface `Platform` e fakes

**Files:**
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/platform.ts`
- Create: `packages/core/src/testing/fakes.ts`
- Create: `packages/core/src/platform.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: Tarefa 1 (workspace)
- Produces: `Source`, `RawFeedItem`, `Article`, `Story`, `Tag`, `ArticleTag`, `Category`, `ContentType`, `SourceKind`, `TagKind`, `AiState`; `Platform`, `HttpClient`, `HttpResponse`, `Clock`, `Logger`, `SecretStore`; `fakeClock`, `fakeHttp`, `silentLogger`, `fakePlatform`

- [ ] **Passo 1: Escrever `types.ts`**

```typescript
export type SourceKind = 'official' | 'news' | 'blog' | 'aggregator' | 'research'
export type Category = 'technology' | 'programming' | 'innovation'
export type ContentType =
  | 'news' | 'announcement' | 'report' | 'rumor' | 'opinion' | 'analysis'
export type TagKind =
  | 'language' | 'framework' | 'hardware' | 'company' | 'topic' | 'product'
export type AiState =
  | 'pending' | 'prefiltered_out' | 'classified' | 'summarized' | 'failed'

export interface Source {
  id: string
  name: string
  url: string
  feedUrl: string
  kind: SourceKind
  trustWeight: number          // 0.4 .. 1.0
  categoryHint: Category | null
  active: boolean
  lastFetchedAt: number | null // epoch ms
  etag: string | null
  lastModified: string | null
}

/** O que sai de um parser de feed, antes de qualquer normalização. */
export interface RawFeedItem {
  title: string
  link: string
  author: string | null
  publishedAt: string | null   // texto cru do feed
  summary: string | null
  contentHtml: string | null
  imageUrl: string | null
  guid: string | null
}

export interface Article {
  id: string                   // derivado do canonicalUrl; estável entre execuções
  sourceId: string
  url: string
  canonicalUrl: string
  title: string
  subtitle: string | null
  author: string | null
  publishedAt: number          // epoch ms
  fetchedAt: number            // epoch ms
  excerpt: string
  contentText: string
  contentHtml: string | null
  imageUrl: string | null
  lang: string
  simhash: string              // 16 chars hex
  wordCount: number
  readingMinutes: number
  storyId: string | null
  contentType: ContentType
  aiState: AiState
}

export interface Story {
  id: string
  canonicalTitle: string
  canonicalSummary: string | null
  category: Category
  importance: number           // 0 .. 1
  isBreaking: boolean
  firstSeenAt: number
  lastUpdatedAt: number
  articleCount: number
}

export interface StoryArticle {
  storyId: string
  articleId: string
  isPrimary: boolean
}

export interface Tag {
  id: string
  kind: TagKind
  name: string
  slug: string
}

export interface ArticleTag {
  articleId: string
  tagId: string
  confidence: number           // 0 .. 1
  source: 'ai' | 'rule' | 'user'
}
```

- [ ] **Passo 2: Escrever `platform.ts`**

```typescript
export interface HttpResponse {
  status: number
  body: string
  headers: Record<string, string>
}

export interface HttpRequest {
  url: string
  etag?: string | null
  lastModified?: string | null
  timeoutMs?: number
}

export interface HttpClient {
  /** Deve devolver status 304 com corpo vazio quando o servidor responder
   *  Not Modified — nunca lançar exceção para status HTTP. Só lança em
   *  falha de rede ou timeout. */
  get(req: HttpRequest): Promise<HttpResponse>
}

export interface Clock {
  /** epoch em milissegundos */
  now(): number
}

export interface Logger {
  debug(msg: string, meta?: unknown): void
  info(msg: string, meta?: unknown): void
  warn(msg: string, meta?: unknown): void
  error(msg: string, meta?: unknown): void
}

export interface SecretStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

/**
 * Toda dependência de mundo externo do núcleo entra por aqui.
 * Nenhum arquivo em packages/core/src pode importar node:*, window,
 * fetch global, Electron ou React Native. Ver teste da regra de
 * dependência em platform.test.ts.
 */
export interface Platform {
  http: HttpClient
  clock: Clock
  logger: Logger
  secrets: SecretStore
}
```

- [ ] **Passo 3: Escrever os fakes**

`packages/core/src/testing/fakes.ts`:

```typescript
import type {
  Clock, HttpClient, HttpResponse, Logger, Platform, SecretStore,
} from '../platform.js'

export function fakeClock(start = 1_700_000_000_000): Clock & { advance(ms: number): void } {
  let t = start
  return { now: () => t, advance: (ms: number) => { t += ms } }
}

export function fakeHttp(
  routes: Record<string, Partial<HttpResponse> & { body: string }>,
): HttpClient {
  return {
    async get(req) {
      const hit = routes[req.url]
      if (!hit) throw new Error(`fakeHttp: rota não registrada para ${req.url}`)
      return { status: hit.status ?? 200, body: hit.body, headers: hit.headers ?? {} }
    },
  }
}

export const silentLogger: Logger = {
  debug() {}, info() {}, warn() {}, error() {},
}

export function fakeSecrets(initial: Record<string, string> = {}): SecretStore {
  const store = new Map(Object.entries(initial))
  return {
    async get(k) { return store.get(k) ?? null },
    async set(k, v) { store.set(k, v) },
    async delete(k) { store.delete(k) },
  }
}

export function fakePlatform(over: Partial<Platform> = {}): Platform {
  return {
    http: over.http ?? fakeHttp({}),
    clock: over.clock ?? fakeClock(),
    logger: over.logger ?? silentLogger,
    secrets: over.secrets ?? fakeSecrets(),
  }
}
```

- [ ] **Passo 4: Escrever o teste que falha — incluindo a regra de dependência**

`packages/core/src/platform.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fakeClock, fakeHttp, fakePlatform } from './testing/fakes.js'

describe('fakes de plataforma', () => {
  it('o relógio falso avança de forma determinística', () => {
    const c = fakeClock(1000)
    expect(c.now()).toBe(1000)
    c.advance(500)
    expect(c.now()).toBe(1500)
  })

  it('o http falso devolve a rota registrada', async () => {
    const http = fakeHttp({ 'https://a.com/feed': { body: '<rss/>' } })
    const res = await http.get({ url: 'https://a.com/feed' })
    expect(res.status).toBe(200)
    expect(res.body).toBe('<rss/>')
  })

  it('o http falso lança em rota desconhecida', async () => {
    const http = fakeHttp({})
    await expect(http.get({ url: 'https://x.com' })).rejects.toThrow('rota não registrada')
  })

  it('fakePlatform monta uma plataforma completa', () => {
    const p = fakePlatform()
    expect(typeof p.clock.now()).toBe('number')
  })
})

describe('regra de dependência do núcleo', () => {
  // Esta é a guarda arquitetural mais importante do projeto. Se ela cair,
  // o core deixa de rodar no React Native e a Fase 3 quebra.
  const PROIBIDOS = [
    /from\s+['"]node:/, /require\(\s*['"]node:/,
    /\bwindow\./, /\bdocument\./,
    /from\s+['"]electron['"]/, /from\s+['"]react-native['"]/,
    /\bglobalThis\.fetch\b/,
  ]

  function arquivosDeProducao(dir: string, acc: string[] = []): string[] {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome)
      if (statSync(p).isDirectory()) {
        if (nome !== 'testing') arquivosDeProducao(p, acc)
      } else if (nome.endsWith('.ts') && !nome.endsWith('.test.ts')) {
        acc.push(p)
      }
    }
    return acc
  }

  it('nenhum arquivo de produção do core importa APIs de plataforma', () => {
    const raiz = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
    const violacoes: string[] = []
    for (const arquivo of arquivosDeProducao(raiz)) {
      const texto = readFileSync(arquivo, 'utf8')
      for (const padrao of PROIBIDOS) {
        if (padrao.test(texto)) violacoes.push(`${arquivo}: ${padrao}`)
      }
    }
    expect(violacoes).toEqual([])
  })
})
```

- [ ] **Passo 5: Rodar e ver falhar**

```bash
npm test -w @devhub/core
```

Esperado: FALHA — `Cannot find module './testing/fakes.js'` até os arquivos dos passos 1-3 existirem. Se já os criou, o teste da regra de dependência deve passar.

- [ ] **Passo 6: Exportar do índice**

`packages/core/src/index.ts`:

```typescript
export const CORE_VERSION = '0.1.0'
export * from './types.js'
export * from './platform.js'
```

- [ ] **Passo 7: Rodar até passar**

```bash
npm test -w @devhub/core
```

Esperado: PASSA, incluindo a regra de dependência.

- [ ] **Passo 8: Commit**

```bash
git add packages/core/src
git commit -m "feat: tipos do domínio, interface Platform e fakes de teste

A regra de dependência do núcleo vira teste automatizado: nenhum
arquivo de produção do core pode importar node:*, window, Electron
ou React Native. É o que garante que o mesmo código roda no
Electron e no Hermes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarefa 3: Parsing de feeds (RSS, Atom, JSON Feed)

**Files:**
- Create: `packages/core/src/feeds/detect.ts`, `rss.ts`, `atom.ts`, `jsonfeed.ts`, `index.ts`
- Create: `packages/core/src/feeds/feeds.test.ts`
- Create: `packages/core/src/feeds/__fixtures__/{rss.xml,atom.xml,jsonfeed.json,malformado.xml}`

**Interfaces:**
- Consumes: `RawFeedItem` (Tarefa 2)
- Produces:
  - `detectFormat(body: string): FeedFormat` onde `FeedFormat = 'rss' | 'atom' | 'jsonfeed'`
  - `parseFeed(body: string): RawFeedItem[]` — **nunca lança**; devolve `[]` em entrada inválida

- [ ] **Passo 1: Instalar o parser de XML**

```bash
npm install -w @devhub/core fast-xml-parser
```

- [ ] **Passo 2: Criar as fixtures**

`packages/core/src/feeds/__fixtures__/rss.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Exemplo Tech</title>
    <item>
      <title>Rust 1.90 lançado</title>
      <link>https://exemplo.dev/rust-190?utm_source=rss</link>
      <guid>https://exemplo.dev/rust-190</guid>
      <pubDate>Mon, 08 Sep 2026 14:30:00 GMT</pubDate>
      <dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">Ana Lima</dc:creator>
      <description>&lt;p&gt;A nova versão traz &lt;b&gt;melhorias&lt;/b&gt; no borrow checker.&lt;/p&gt;</description>
    </item>
    <item>
      <title>Sem data nem autor</title>
      <link>https://exemplo.dev/sem-data</link>
    </item>
  </channel>
</rss>
```

`packages/core/src/feeds/__fixtures__/atom.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Exemplo Atom</title>
  <entry>
    <title>Go 1.26 chega com melhorias no GC</title>
    <link rel="alternate" href="https://go.exemplo/1-26"/>
    <id>tag:go.exemplo,2026:1-26</id>
    <published>2026-09-07T10:00:00Z</published>
    <author><name>Bruno Reis</name></author>
    <content type="html">&lt;p&gt;Pausas menores.&lt;/p&gt;</content>
  </entry>
</feed>
```

`packages/core/src/feeds/__fixtures__/jsonfeed.json`:

```json
{
  "version": "https://jsonfeed.org/version/1.1",
  "title": "Exemplo JSON",
  "items": [
    {
      "id": "42",
      "url": "https://json.exemplo/post",
      "title": "TypeScript 6 em beta",
      "date_published": "2026-09-06T08:15:00Z",
      "authors": [{ "name": "Carla Souza" }],
      "content_html": "<p>Inferência mais rápida.</p>",
      "image": "https://json.exemplo/capa.png"
    }
  ]
}
```

`packages/core/src/feeds/__fixtures__/malformado.xml`:

```xml
<?xml version="1.0"?>
<rss version="2.0"><channel><item><title>Corta no meio
```

- [ ] **Passo 3: Escrever o teste que falha**

`packages/core/src/feeds/feeds.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { detectFormat, parseFeed } from './index.js'

const fx = (n: string) =>
  readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url), 'utf8')

describe('detectFormat', () => {
  it('reconhece RSS', () => expect(detectFormat(fx('rss.xml'))).toBe('rss'))
  it('reconhece Atom', () => expect(detectFormat(fx('atom.xml'))).toBe('atom'))
  it('reconhece JSON Feed', () => expect(detectFormat(fx('jsonfeed.json'))).toBe('jsonfeed'))
})

describe('parseFeed — RSS', () => {
  const itens = parseFeed(fx('rss.xml'))

  it('extrai todos os itens', () => expect(itens).toHaveLength(2))

  it('extrai título, link, autor e data', () => {
    const a = itens[0]!
    expect(a.title).toBe('Rust 1.90 lançado')
    expect(a.link).toBe('https://exemplo.dev/rust-190?utm_source=rss')
    expect(a.author).toBe('Ana Lima')
    expect(a.publishedAt).toBe('Mon, 08 Sep 2026 14:30:00 GMT')
    expect(a.contentHtml).toContain('borrow checker')
  })

  it('usa null nos campos ausentes em vez de undefined ou string vazia', () => {
    const b = itens[1]!
    expect(b.author).toBeNull()
    expect(b.publishedAt).toBeNull()
  })
})

describe('parseFeed — Atom', () => {
  const itens = parseFeed(fx('atom.xml'))

  it('extrai o href do link alternate', () => {
    expect(itens[0]!.link).toBe('https://go.exemplo/1-26')
  })

  it('extrai autor aninhado e data ISO', () => {
    expect(itens[0]!.author).toBe('Bruno Reis')
    expect(itens[0]!.publishedAt).toBe('2026-09-07T10:00:00Z')
  })
})

describe('parseFeed — JSON Feed', () => {
  const itens = parseFeed(fx('jsonfeed.json'))

  it('extrai item, autor e imagem', () => {
    const a = itens[0]!
    expect(a.title).toBe('TypeScript 6 em beta')
    expect(a.author).toBe('Carla Souza')
    expect(a.imageUrl).toBe('https://json.exemplo/capa.png')
  })
})

describe('parseFeed — robustez', () => {
  // Constraint global: falha em uma fonte nunca derruba o pipeline.
  it('devolve lista vazia em XML malformado, sem lançar', () => {
    expect(parseFeed(fx('malformado.xml'))).toEqual([])
  })

  it('devolve lista vazia em string vazia', () => {
    expect(parseFeed('')).toEqual([])
  })

  it('devolve lista vazia em JSON inválido', () => {
    expect(parseFeed('{ isto não é json')).toEqual([])
  })

  it('descarta itens sem título ou sem link', () => {
    const semLink = '<rss><channel><item><title>Só título</title></item></channel></rss>'
    expect(parseFeed(semLink)).toEqual([])
  })
})
```

- [ ] **Passo 4: Rodar e ver falhar**

```bash
npm test -w @devhub/core -- feeds
```

Esperado: FALHA com `Cannot find module './index.js'`.

- [ ] **Passo 5: Implementar `detect.ts`**

```typescript
export type FeedFormat = 'rss' | 'atom' | 'jsonfeed'

export function detectFormat(body: string): FeedFormat {
  const head = body.slice(0, 2000).trimStart()
  if (head.startsWith('{')) return 'jsonfeed'
  if (/<feed[\s>]/i.test(head)) return 'atom'
  return 'rss'
}
```

- [ ] **Passo 6: Implementar `rss.ts`**

```typescript
import { XMLParser } from 'fast-xml-parser'
import type { RawFeedItem } from '../types.js'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
})

/** Texto de um nó que pode vir como string, número ou { '#text': ... }. */
function text(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return text((v as Record<string, unknown>)['#text'])
  }
  return null
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

export function parseRss(body: string): RawFeedItem[] {
  const doc = parser.parse(body) as Record<string, any>
  const canal = doc?.rss?.channel ?? doc?.channel ?? doc?.['rdf:RDF']
  if (!canal) return []

  const brutos = asArray(canal.item ?? doc?.['rdf:RDF']?.item)
  const itens: RawFeedItem[] = []

  for (const it of brutos) {
    const title = text(it.title)
    const link = text(it.link) ?? text(it.guid)
    if (!title || !link) continue

    const conteudo = text(it['content:encoded']) ?? text(it.description)
    itens.push({
      title,
      link,
      author: text(it['dc:creator']) ?? text(it.author),
      publishedAt: text(it.pubDate) ?? text(it['dc:date']),
      summary: text(it.description),
      contentHtml: conteudo,
      imageUrl: text(it.enclosure?.['@_url']) ?? text(it['media:content']?.['@_url']),
      guid: text(it.guid),
    })
  }
  return itens
}
```

- [ ] **Passo 7: Implementar `atom.ts`**

```typescript
import { XMLParser } from 'fast-xml-parser'
import type { RawFeedItem } from '../types.js'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
})

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return text((v as Record<string, unknown>)['#text'])
  }
  return null
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

/** Atom permite vários <link>; queremos o rel="alternate" (ou o primeiro sem rel). */
function pickLink(link: unknown): string | null {
  for (const l of asArray(link as any)) {
    if (typeof l === 'string') return l
    const rel = l?.['@_rel']
    if (!rel || rel === 'alternate') return text(l?.['@_href'])
  }
  const primeiro = asArray(link as any)[0]
  return typeof primeiro === 'string' ? primeiro : text(primeiro?.['@_href'])
}

export function parseAtom(body: string): RawFeedItem[] {
  const doc = parser.parse(body) as Record<string, any>
  const feed = doc?.feed
  if (!feed) return []

  const itens: RawFeedItem[] = []
  for (const e of asArray(feed.entry)) {
    const title = text(e.title)
    const link = pickLink(e.link)
    if (!title || !link) continue

    itens.push({
      title,
      link,
      author: text(asArray(e.author)[0]?.name),
      publishedAt: text(e.published) ?? text(e.updated),
      summary: text(e.summary),
      contentHtml: text(e.content) ?? text(e.summary),
      imageUrl: null,
      guid: text(e.id),
    })
  }
  return itens
}
```

- [ ] **Passo 8: Implementar `jsonfeed.ts`**

```typescript
import type { RawFeedItem } from '../types.js'

export function parseJsonFeed(body: string): RawFeedItem[] {
  const doc = JSON.parse(body) as Record<string, any>
  const itens: RawFeedItem[] = []

  for (const it of Array.isArray(doc?.items) ? doc.items : []) {
    const title: string | null = it.title ?? null
    const link: string | null = it.url ?? it.external_url ?? null
    if (!title || !link) continue

    // JSON Feed 1.1 usa authors[]; 1.0 usava author{}.
    const autor = it.authors?.[0]?.name ?? it.author?.name ?? null

    itens.push({
      title,
      link,
      author: autor,
      publishedAt: it.date_published ?? it.date_modified ?? null,
      summary: it.summary ?? null,
      contentHtml: it.content_html ?? it.content_text ?? null,
      imageUrl: it.image ?? it.banner_image ?? null,
      guid: it.id != null ? String(it.id) : null,
    })
  }
  return itens
}
```

- [ ] **Passo 9: Implementar `index.ts` com a barreira de erro**

```typescript
import { detectFormat } from './detect.js'
import { parseAtom } from './atom.js'
import { parseJsonFeed } from './jsonfeed.js'
import { parseRss } from './rss.js'
import type { RawFeedItem } from '../types.js'

export { detectFormat } from './detect.js'
export type { FeedFormat } from './detect.js'

/**
 * Ponto único de entrada do parsing. Nunca lança: um feed quebrado
 * vira lista vazia para que o pipeline siga nas demais fontes
 * (constraint global do plano).
 */
export function parseFeed(body: string): RawFeedItem[] {
  if (!body || !body.trim()) return []
  try {
    switch (detectFormat(body)) {
      case 'jsonfeed': return parseJsonFeed(body)
      case 'atom': return parseAtom(body)
      case 'rss': return parseRss(body)
    }
  } catch {
    return []
  }
}
```

- [ ] **Passo 10: Rodar até passar**

```bash
npm test -w @devhub/core -- feeds
```

Esperado: PASSA (16 testes).

- [ ] **Passo 11: Commit**

```bash
git add packages/core/src/feeds package.json package-lock.json
git commit -m "feat: parsing de RSS, Atom e JSON Feed

parseFeed nunca lança: entrada malformada vira lista vazia, para
que a falha de uma fonte não derrube a ingestão das outras.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarefa 4: Normalização (HTML, datas, URLs, artigo)

**Files:**
- Create: `packages/core/src/normalize/{html,dates,urls,article}.ts`
- Create: `packages/core/src/normalize/normalize.test.ts`

**Interfaces:**
- Consumes: `RawFeedItem`, `Source`, `Article` (Tarefa 2); `parseFeed` (Tarefa 3)
- Produces:
  - `htmlToText(html: string): string`
  - `sanitizeHtml(html: string): string` — allowlist
  - `parseFeedDate(raw: string | null, fallback: number): number`
  - `canonicalizeUrl(url: string): string`
  - `stableId(canonicalUrl: string): string`
  - `normalizeItem(item: RawFeedItem, source: Source, now: number): Omit<Article, 'simhash' | 'storyId' | 'contentType' | 'aiState'>`

- [ ] **Passo 1: Instalar o parser de HTML**

```bash
npm install -w @devhub/core htmlparser2
```

- [ ] **Passo 2: Escrever o teste que falha**

`packages/core/src/normalize/normalize.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { htmlToText, sanitizeHtml } from './html.js'
import { parseFeedDate } from './dates.js'
import { canonicalizeUrl, stableId } from './urls.js'
import { normalizeItem } from './article.js'
import type { RawFeedItem, Source } from '../types.js'

describe('htmlToText', () => {
  it('extrai texto e descarta marcação', () => {
    expect(htmlToText('<p>Olá <b>mundo</b></p>')).toBe('Olá mundo')
  })
  it('remove script e style inteiros, não só as tags', () => {
    expect(htmlToText('<p>a</p><script>alert(1)</script><style>p{}</style><p>b</p>'))
      .toBe('a b')
  })
  it('separa blocos com espaço em vez de colar palavras', () => {
    expect(htmlToText('<div>um</div><div>dois</div>')).toBe('um dois')
  })
  it('decodifica entidades', () => {
    expect(htmlToText('<p>caf&eacute; &amp; c&oacute;digo</p>')).toBe('café & código')
  })
  it('devolve string vazia em entrada vazia', () => {
    expect(htmlToText('')).toBe('')
  })
})

describe('sanitizeHtml', () => {
  it('mantém tags da allowlist', () => {
    expect(sanitizeHtml('<p>oi <strong>tudo</strong></p>')).toBe('<p>oi <strong>tudo</strong></p>')
  })
  it('remove script com o conteúdo', () => {
    expect(sanitizeHtml('<p>a</p><script>roubar()</script>')).toBe('<p>a</p>')
  })
  it('remove atributos de evento', () => {
    expect(sanitizeHtml('<p onclick="x()">a</p>')).toBe('<p>a</p>')
  })
  it('remove href javascript:', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
  })
  it('preserva href http e https', () => {
    expect(sanitizeHtml('<a href="https://a.com">x</a>')).toBe('<a href="https://a.com">x</a>')
  })
})

describe('parseFeedDate', () => {
  const FALLBACK = 1_700_000_000_000

  it('entende RFC 822 do RSS', () => {
    expect(parseFeedDate('Mon, 08 Sep 2026 14:30:00 GMT', FALLBACK))
      .toBe(Date.UTC(2026, 8, 8, 14, 30, 0))
  })
  it('entende ISO 8601 do Atom', () => {
    expect(parseFeedDate('2026-09-07T10:00:00Z', FALLBACK))
      .toBe(Date.UTC(2026, 8, 7, 10, 0, 0))
  })
  it('usa o fallback quando a data é nula', () => {
    expect(parseFeedDate(null, FALLBACK)).toBe(FALLBACK)
  })
  it('usa o fallback quando a data é lixo', () => {
    expect(parseFeedDate('ontem à tarde', FALLBACK)).toBe(FALLBACK)
  })
  it('não aceita data no futuro distante — usa o fallback', () => {
    expect(parseFeedDate('2199-01-01T00:00:00Z', FALLBACK)).toBe(FALLBACK)
  })
})

describe('canonicalizeUrl', () => {
  it('remove parâmetros de rastreamento', () => {
    expect(canonicalizeUrl('https://a.dev/p?utm_source=rss&utm_medium=x&id=7'))
      .toBe('https://a.dev/p?id=7')
  })
  it('remove fbclid e gclid', () => {
    expect(canonicalizeUrl('https://a.dev/p?fbclid=abc&gclid=def')).toBe('https://a.dev/p')
  })
  it('normaliza host para minúsculas e remove barra final', () => {
    expect(canonicalizeUrl('https://A.DEV/Post/')).toBe('https://a.dev/Post')
  })
  it('remove o fragmento', () => {
    expect(canonicalizeUrl('https://a.dev/p#secao')).toBe('https://a.dev/p')
  })
  it('devolve a entrada intacta se não for URL válida', () => {
    expect(canonicalizeUrl('nao-e-url')).toBe('nao-e-url')
  })
})

describe('stableId', () => {
  it('é determinístico', () => {
    expect(stableId('https://a.dev/p')).toBe(stableId('https://a.dev/p'))
  })
  it('difere para URLs diferentes', () => {
    expect(stableId('https://a.dev/p')).not.toBe(stableId('https://a.dev/q'))
  })
})

describe('normalizeItem', () => {
  const fonte: Source = {
    id: 'src1', name: 'Exemplo', url: 'https://a.dev', feedUrl: 'https://a.dev/feed',
    kind: 'news', trustWeight: 0.75, categoryHint: null, active: true,
    lastFetchedAt: null, etag: null, lastModified: null,
  }
  const item: RawFeedItem = {
    title: '  Rust 1.90 lançado  ',
    link: 'https://a.dev/rust?utm_source=rss',
    author: 'Ana', publishedAt: '2026-09-08T14:30:00Z',
    summary: '<p>Resumo com <b>html</b></p>',
    contentHtml: `<p>${'palavra '.repeat(440)}</p>`,
    imageUrl: null, guid: 'g1',
  }
  const NOW = 1_760_000_000_000
  const a = normalizeItem(item, fonte, NOW)

  it('apara o título', () => expect(a.title).toBe('Rust 1.90 lançado'))
  it('canonicaliza a URL e mantém a original', () => {
    expect(a.canonicalUrl).toBe('https://a.dev/rust')
    expect(a.url).toBe('https://a.dev/rust?utm_source=rss')
  })
  it('deriva o id do canonicalUrl', () => {
    expect(a.id).toBe(stableId('https://a.dev/rust'))
  })
  it('converte o conteúdo em texto puro', () => {
    expect(a.contentText).not.toContain('<p>')
    expect(a.contentText.startsWith('palavra')).toBe(true)
  })
  it('gera excerpt a partir do summary, sem html', () => {
    expect(a.excerpt).toBe('Resumo com html')
  })
  it('conta palavras e calcula o tempo de leitura a 220 ppm', () => {
    expect(a.wordCount).toBe(440)
    expect(a.readingMinutes).toBe(2)
  })
  it('usa o relógio injetado como fetchedAt', () => {
    expect(a.fetchedAt).toBe(NOW)
  })
  it('tempo de leitura é no mínimo 1 minuto', () => {
    const curto = normalizeItem({ ...item, contentHtml: '<p>oi</p>' }, fonte, NOW)
    expect(curto.readingMinutes).toBe(1)
  })
})
```

- [ ] **Passo 3: Rodar e ver falhar**

```bash
npm test -w @devhub/core -- normalize
```

Esperado: FALHA — módulos inexistentes.

- [ ] **Passo 4: Implementar `html.ts`**

```typescript
import { Parser } from 'htmlparser2'

const DESCARTAR_CONTEUDO = new Set(['script', 'style', 'noscript', 'iframe', 'svg'])

/** Extrai texto puro. Blocos viram separação por espaço. */
export function htmlToText(html: string): string {
  if (!html) return ''
  const partes: string[] = []
  let ignorando = 0

  const p = new Parser(
    {
      onopentag(nome) { if (DESCARTAR_CONTEUDO.has(nome)) ignorando++ },
      ontext(t) { if (ignorando === 0) partes.push(t) },
      onclosetag(nome) { if (DESCARTAR_CONTEUDO.has(nome) && ignorando > 0) ignorando-- },
    },
    { decodeEntities: true },
  )
  p.write(html)
  p.end()

  return partes.join(' ').replace(/\s+/g, ' ').trim()
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
```

- [ ] **Passo 5: Implementar `dates.ts`**

```typescript
/** Um ano à frente do relógio já é sinal de data quebrada no feed. */
const MARGEM_FUTURO_MS = 365 * 24 * 60 * 60 * 1000

/**
 * Date.parse já entende RFC 822 (RSS) e ISO 8601 (Atom). O trabalho aqui
 * é rejeitar o que ele aceita indevidamente e o que não faz sentido.
 */
export function parseFeedDate(raw: string | null, fallback: number): number {
  if (!raw) return fallback
  const t = Date.parse(raw.trim())
  if (Number.isNaN(t)) return fallback
  if (t <= 0) return fallback
  if (t > fallback + MARGEM_FUTURO_MS) return fallback
  return t
}
```

- [ ] **Passo 6: Implementar `urls.ts`**

```typescript
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
```

- [ ] **Passo 7: Implementar `article.ts`**

```typescript
import type { Article, RawFeedItem, Source } from '../types.js'
import { htmlToText, sanitizeHtml } from './html.js'
import { parseFeedDate } from './dates.js'
import { canonicalizeUrl, stableId } from './urls.js'

export type NormalizedArticle =
  Omit<Article, 'simhash' | 'storyId' | 'contentType' | 'aiState'>

const PALAVRAS_POR_MINUTO = 220
const TAMANHO_EXCERPT = 280

export function normalizeItem(
  item: RawFeedItem,
  source: Source,
  now: number,
): NormalizedArticle {
  const url = item.link.trim()
  const canonicalUrl = canonicalizeUrl(url)
  const contentText = htmlToText(item.contentHtml ?? item.summary ?? '')
  const wordCount = contentText ? contentText.split(/\s+/).filter(Boolean).length : 0

  const excerptBase = htmlToText(item.summary ?? '') || contentText
  const excerpt = excerptBase.length > TAMANHO_EXCERPT
    ? `${excerptBase.slice(0, TAMANHO_EXCERPT).trimEnd()}…`
    : excerptBase

  return {
    id: stableId(canonicalUrl),
    sourceId: source.id,
    url,
    canonicalUrl,
    title: item.title.trim(),
    subtitle: null,
    author: item.author?.trim() || null,
    publishedAt: parseFeedDate(item.publishedAt, now),
    fetchedAt: now,
    excerpt,
    contentText,
    contentHtml: item.contentHtml ? sanitizeHtml(item.contentHtml) : null,
    imageUrl: item.imageUrl,
    lang: 'en',
    wordCount,
    readingMinutes: Math.max(1, Math.ceil(wordCount / PALAVRAS_POR_MINUTO)),
  }
}
```

- [ ] **Passo 8: Rodar até passar**

```bash
npm test -w @devhub/core -- normalize
```

Esperado: PASSA (26 testes).

- [ ] **Passo 9: Commit**

```bash
git add packages/core/src/normalize package.json package-lock.json
git commit -m "feat: normalização de HTML, datas, URLs e artigos

Sanitização por allowlist descarta o conteúdo de script/style, não
só as tags, e rejeita href javascript:. Datas no futuro distante
caem no fallback em vez de envenenar o ranking por frescor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarefa 5: SimHash e Jaccard

**Files:**
- Create: `packages/core/src/dedup/simhash.ts`, `packages/core/src/dedup/jaccard.ts`
- Create: `packages/core/src/dedup/fingerprint.test.ts`

**Interfaces:**
- Consumes: nada
- Produces:
  - `simhash(text: string): string` — 16 chars hex (64 bits)
  - `hamming(a: string, b: string): number`
  - `trigrams(text: string): Set<string>`
  - `jaccard(a: Set<string>, b: Set<string>): number`

- [ ] **Passo 1: Escrever o teste que falha**

`packages/core/src/dedup/fingerprint.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { hamming, simhash } from './simhash.js'
import { jaccard, trigrams } from './jaccard.js'

describe('simhash', () => {
  it('produz 16 caracteres hexadecimais', () => {
    expect(simhash('Rust 1.90 lançado hoje')).toMatch(/^[0-9a-f]{16}$/)
  })

  it('é determinístico', () => {
    expect(simhash('mesmo texto aqui')).toBe(simhash('mesmo texto aqui'))
  })

  it('ignora ordem de palavras (é um saco de palavras)', () => {
    expect(simhash('alpha beta gama')).toBe(simhash('gama beta alpha'))
  })

  it('textos quase idênticos ficam a distância pequena', () => {
    const a = simhash('NVIDIA anuncia nova GPU para data centers com mais memória')
    const b = simhash('NVIDIA anuncia nova GPU para data centers com mais memoria HBM')
    expect(hamming(a, b)).toBeLessThanOrEqual(12)
  })

  it('textos sem relação ficam a distância grande', () => {
    const a = simhash('NVIDIA anuncia nova GPU para data centers')
    const b = simhash('Receita de bolo de cenoura com cobertura de chocolate')
    expect(hamming(a, b)).toBeGreaterThan(12)
  })

  it('devolve zeros em texto vazio', () => {
    expect(simhash('')).toBe('0000000000000000')
  })
})

describe('hamming', () => {
  it('é zero para hashes iguais', () => {
    expect(hamming('ffffffffffffffff', 'ffffffffffffffff')).toBe(0)
  })
  it('conta bits diferentes', () => {
    expect(hamming('0000000000000000', '0000000000000003')).toBe(2)
  })
  it('é 64 para complementos', () => {
    expect(hamming('0000000000000000', 'ffffffffffffffff')).toBe(64)
  })
})

describe('trigrams e jaccard', () => {
  it('gera trigramas de palavras normalizadas', () => {
    expect(trigrams('abcd')).toEqual(new Set(['abc', 'bcd']))
  })

  it('jaccard de conjuntos idênticos é 1', () => {
    expect(jaccard(trigrams('rust lancado'), trigrams('rust lancado'))).toBe(1)
  })

  it('jaccard de conjuntos disjuntos é 0', () => {
    expect(jaccard(new Set(['abc']), new Set(['xyz']))).toBe(0)
  })

  it('títulos parecidos passam de 0.7', () => {
    const a = trigrams('Rust 1.90 lancado com melhorias no borrow checker')
    const b = trigrams('Rust 1.90 lancado com melhorias no borrow checker hoje')
    expect(jaccard(a, b)).toBeGreaterThan(0.7)
  })

  it('dois conjuntos vazios dão 0, sem divisão por zero', () => {
    expect(jaccard(new Set(), new Set())).toBe(0)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -w @devhub/core -- fingerprint
```

Esperado: FALHA — módulos inexistentes.

- [ ] **Passo 3: Implementar `simhash.ts`**

```typescript
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
    .replace(/[̀-ͯ]/g, '')   // remove acentos
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
```

- [ ] **Passo 4: Implementar `jaccard.ts`**

```typescript
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
```

- [ ] **Passo 5: Rodar até passar**

```bash
npm test -w @devhub/core -- fingerprint
```

Esperado: PASSA (14 testes).

- [ ] **Passo 6: Commit**

```bash
git add packages/core/src/dedup
git commit -m "feat: fingerprint por SimHash de 64 bits e similaridade Jaccard

Usa BigInt em vez de operações de 32 bits para rodar igual no V8 e
no Hermes. Tokenização remove acentos para que 'memoria' e 'memória'
colidam no mesmo token.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarefa 6: Agrupamento em stories (dedup lexical)

**Files:**
- Create: `packages/core/src/dedup/cluster.ts`
- Create: `packages/core/src/dedup/cluster.test.ts`

**Interfaces:**
- Consumes: `simhash`, `hamming` (T5), `trigrams`, `jaccard` (T5), `Article` (T2)
- Produces:
  - `type ClusterInput = { id: string; title: string; simhash: string; publishedAt: number }`
  - `type Cluster = { members: string[]; primaryId: string; grayPairs: Array<[string, string]> }`
  - `clusterArticles(items: ClusterInput[]): Cluster[]`
  - Constantes exportadas: `HAMMING_MESMO = 3`, `HAMMING_CINZA = 12`, `JACCARD_MESMO = 0.7`, `JACCARD_CINZA = 0.45`

- [ ] **Passo 1: Escrever o teste que falha**

`packages/core/src/dedup/cluster.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { clusterArticles, type ClusterInput } from './cluster.js'
import { simhash } from './simhash.js'

function entrada(id: string, title: string, publishedAt = 1000): ClusterInput {
  return { id, title, simhash: simhash(title), publishedAt }
}

describe('clusterArticles', () => {
  it('artigo único vira cluster de um membro', () => {
    const c = clusterArticles([entrada('a', 'NVIDIA anuncia GPU nova')])
    expect(c).toHaveLength(1)
    expect(c[0]!.members).toEqual(['a'])
    expect(c[0]!.primaryId).toBe('a')
  })

  it('títulos idênticos entram no mesmo cluster', () => {
    const t = 'Rust 1.90 lancado com melhorias no borrow checker'
    const c = clusterArticles([entrada('a', t), entrada('b', t)])
    expect(c).toHaveLength(1)
    expect(c[0]!.members.sort()).toEqual(['a', 'b'])
  })

  it('títulos sem relação ficam em clusters separados', () => {
    const c = clusterArticles([
      entrada('a', 'NVIDIA anuncia GPU nova para data centers'),
      entrada('b', 'Receita de bolo de cenoura com cobertura'),
    ])
    expect(c).toHaveLength(2)
  })

  it('agrupamento é transitivo: a~b e b~c colocam a, b e c juntos', () => {
    const base = 'Kubernetes 1.35 traz melhorias de escalonamento no scheduler'
    const c = clusterArticles([
      entrada('a', base),
      entrada('b', `${base} padrao`),
      entrada('c', `${base} padrao hoje`),
    ])
    expect(c).toHaveLength(1)
    expect(c[0]!.members).toHaveLength(3)
  })

  it('o primário é o artigo publicado primeiro', () => {
    const t = 'Python 3.15 entra em beta com free-threading estavel'
    const c = clusterArticles([entrada('tarde', t, 5000), entrada('cedo', t, 1000)])
    expect(c[0]!.primaryId).toBe('cedo')
  })

  it('registra pares da zona cinzenta para a IA resolver depois', () => {
    const c = clusterArticles([
      entrada('a', 'Apple lanca chip M5 com nova arquitetura de GPU integrada'),
      entrada('b', 'Apple apresenta o M5: arquitetura de GPU redesenhada e mais nucleos'),
    ])
    const cinzas = c.flatMap((x) => x.grayPairs)
    // Ou entraram no mesmo cluster, ou ficaram registrados como duvidosos.
    expect(c.length === 1 || cinzas.length > 0).toBe(true)
  })

  it('lista vazia devolve lista vazia', () => {
    expect(clusterArticles([])).toEqual([])
  })

  it('é determinístico na ordem dos clusters', () => {
    const itens = [
      entrada('z', 'Docker melhora build cache em camadas'),
      entrada('a', 'Go 1.26 reduz pausas do coletor de lixo'),
    ]
    const um = clusterArticles(itens).map((c) => c.primaryId)
    const dois = clusterArticles(itens).map((c) => c.primaryId)
    expect(um).toEqual(dois)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -w @devhub/core -- cluster
```

Esperado: FALHA — `Cannot find module './cluster.js'`.

- [ ] **Passo 3: Implementar `cluster.ts`**

```typescript
import { hamming } from './simhash.js'
import { jaccard, trigrams } from './jaccard.js'

export const HAMMING_MESMO = 3
export const HAMMING_CINZA = 12
export const JACCARD_MESMO = 0.7
export const JACCARD_CINZA = 0.45

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
      const ra = achar(a); const rb = achar(b)
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
  const cinzas: Array<[string, string]> = []

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const dist = hamming(items[i]!.simhash, items[j]!.simhash)
      const sim = jaccard(tri[i]!, tri[j]!)

      if (dist <= HAMMING_MESMO || sim >= JACCARD_MESMO) {
        uniao.unir(i, j)
      } else if (dist <= HAMMING_CINZA || sim >= JACCARD_CINZA) {
        cinzas.push([items[i]!.id, items[j]!.id])
      }
    }
  }

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
      grayPairs: cinzas.filter(
        ([x, y]) => idsDoGrupo.has(x) !== idsDoGrupo.has(y),
      ),
    })
  }
  return clusters
}
```

- [ ] **Passo 4: Rodar até passar**

```bash
npm test -w @devhub/core -- cluster
```

Esperado: PASSA (8 testes).

- [ ] **Passo 5: Commit**

```bash
git add packages/core/src/dedup/cluster.ts packages/core/src/dedup/cluster.test.ts
git commit -m "feat: agrupamento lexical de artigos em stories

Union-find torna o agrupamento transitivo: se a~b e b~c, os três
caem na mesma história mesmo sem a e c se parecerem diretamente.
Pares duvidosos saem em grayPairs para a IA decidir na Fase 5.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarefa 7: Pré-filtro heurístico de relevância

**Files:**
- Create: `packages/core/src/filter/prefilter.ts`
- Create: `packages/core/src/filter/prefilter.test.ts`

**Interfaces:**
- Consumes: `tokenize` (T5)
- Produces:
  - `relevanceScore(title: string, text: string): number` — 0 a 1
  - `isRelevant(title: string, text: string, limiar?: number): boolean`
  - `LIMIAR_RELEVANCIA = 0.12`

- [ ] **Passo 1: Escrever o teste que falha**

`packages/core/src/filter/prefilter.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { isRelevant, relevanceScore } from './prefilter.js'

describe('relevanceScore', () => {
  it('pontua alto conteúdo claramente técnico', () => {
    const s = relevanceScore(
      'Rust 1.90 melhora o borrow checker',
      'A nova versão do compilador traz melhorias no borrow checker e no linker.',
    )
    expect(s).toBeGreaterThan(0.3)
  })

  it('pontua baixo conteúdo sem relação com tecnologia', () => {
    const s = relevanceScore(
      'Receita de bolo de cenoura',
      'Bata os ovos com o açúcar e acrescente a farinha aos poucos.',
    )
    expect(s).toBeLessThan(0.1)
  })

  it('dá peso maior a acerto no título do que no corpo', () => {
    const noTitulo = relevanceScore('Kubernetes em produção', 'texto qualquer sem termos')
    const noCorpo = relevanceScore('Texto qualquer sem termos', 'Kubernetes em produção')
    expect(noTitulo).toBeGreaterThan(noCorpo)
  })

  it('devolve 0 para entrada vazia', () => {
    expect(relevanceScore('', '')).toBe(0)
  })

  it('nunca passa de 1', () => {
    const s = relevanceScore(
      'Python JavaScript Rust Kubernetes Docker GPU CPU API',
      'Python JavaScript Rust Kubernetes Docker GPU CPU API compilador servidor',
    )
    expect(s).toBeLessThanOrEqual(1)
  })

  it('não é enganado por um único termo repetido', () => {
    const repetido = relevanceScore('api', 'api api api api api api api api api api')
    const variado = relevanceScore('API REST em Go', 'Construindo uma API REST com Go e Postgres')
    expect(variado).toBeGreaterThan(repetido)
  })
})

describe('isRelevant', () => {
  it('aceita artigo técnico', () => {
    expect(isRelevant('GPU nova da NVIDIA', 'Arquitetura com mais memória HBM')).toBe(true)
  })
  it('rejeita artigo fora de escopo', () => {
    expect(isRelevant('Resultado do campeonato', 'O time venceu por dois a um')).toBe(false)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -w @devhub/core -- prefilter
```

Esperado: FALHA — módulo inexistente.

- [ ] **Passo 3: Implementar `prefilter.ts`**

```typescript
import { tokenize } from '../dedup/simhash.js'

/**
 * Vocabulário de corte. Não precisa ser exaustivo: só suficiente para
 * separar "é sobre tecnologia" de "não é", antes de gastar cota de IA.
 * A classificação fina fica com a taxonomia (Tarefa 8).
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
  // hardware
  'gpu', 'cpu', 'ram', 'ssd', 'nvme', 'chip', 'processador', 'processor',
  'nvidia', 'amd', 'intel', 'arm', 'risc', 'qualcomm', 'snapdragon',
  'placa', 'motherboard', 'hardware', 'firmware', 'benchmark', 'overclock',
  // IA e pesquisa
  'ai', 'ia', 'llm', 'gpt', 'claude', 'gemini', 'machine', 'learning',
  'neural', 'transformer', 'embedding', 'inference', 'training', 'modelo',
  'dataset', 'quantum', 'robotics', 'robotica', 'algoritmo', 'algorithm',
  // segurança
  'security', 'seguranca', 'vulnerability', 'vulnerabilidade', 'cve',
  'exploit', 'patch', 'encryption', 'criptografia', 'malware', 'ransomware',
  // ecossistema
  'opensource', 'software', 'developer', 'desenvolvedor', 'programming',
  'programacao', 'code', 'codigo', 'release', 'version', 'versao',
  'beta', 'changelog', 'bug', 'feature', 'protocol', 'protocolo',
])

const PESO_TITULO = 3
export const LIMIAR_RELEVANCIA = 0.12

/**
 * Fração ponderada de termos técnicos *distintos* sobre o total de
 * tokens distintos. Contar distintos impede que repetir "api" dez vezes
 * finja relevância.
 */
export function relevanceScore(title: string, text: string): number {
  const tokensTitulo = new Set(tokenize(title))
  const tokensTexto = new Set(tokenize(text))
  if (tokensTitulo.size === 0 && tokensTexto.size === 0) return 0

  let acertos = 0
  for (const t of tokensTitulo) if (TERMOS_TECNICOS.has(t)) acertos += PESO_TITULO
  for (const t of tokensTexto) {
    if (tokensTitulo.has(t)) continue          // não conta duas vezes
    if (TERMOS_TECNICOS.has(t)) acertos += 1
  }

  const total = tokensTitulo.size * PESO_TITULO + (tokensTexto.size - tokensTitulo.size)
  if (total <= 0) return 0
  return Math.min(1, acertos / total)
}

export function isRelevant(
  title: string,
  text: string,
  limiar = LIMIAR_RELEVANCIA,
): boolean {
  return relevanceScore(title, text) >= limiar
}
```

- [ ] **Passo 4: Rodar até passar**

```bash
npm test -w @devhub/core -- prefilter
```

Esperado: PASSA (8 testes). Se `relevanceScore` de um caso real ficar no limite, ajuste `LIMIAR_RELEVANCIA` e registre o motivo no commit — o limiar é calibração, não regra fixa.

- [ ] **Passo 5: Commit**

```bash
git add packages/core/src/filter
git commit -m "feat: pré-filtro heurístico de relevância técnica

Mecanismo 3 dos oito de proteção de cota do spec: corta artigos fora
de escopo antes de gastar requisição de IA. Conta termos distintos,
não ocorrências, para não ser enganado por repetição.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarefa 8: Taxonomia (categorias, tags e tipo de conteúdo)

**Files:**
- Create: `packages/core/src/taxonomy/dictionary.ts`
- Create: `packages/core/src/taxonomy/classify.ts`
- Create: `packages/core/src/taxonomy/taxonomy.test.ts`

**Interfaces:**
- Consumes: `tokenize` (T5), `Category`, `ContentType`, `TagKind` (T2)
- Produces:
  - `type TagDef = { slug: string; name: string; kind: TagKind; category: Category; terms: string[] }`
  - `TAG_DICTIONARY: TagDef[]`
  - `tagsOf(title: string, text: string): Array<{ slug: string; confidence: number }>`
  - `categoryOf(title: string, text: string, hint: Category | null): Category`
  - `contentTypeOf(title: string, text: string): ContentType`

- [ ] **Passo 1: Escrever o teste que falha**

`packages/core/src/taxonomy/taxonomy.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { TAG_DICTIONARY } from './dictionary.js'
import { categoryOf, contentTypeOf, tagsOf } from './classify.js'

describe('TAG_DICTIONARY', () => {
  it('não tem slugs duplicados', () => {
    const slugs = TAG_DICTIONARY.map((t) => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
  it('cobre as três categorias do spec', () => {
    const cats = new Set(TAG_DICTIONARY.map((t) => t.category))
    expect(cats).toEqual(new Set(['technology', 'programming', 'innovation']))
  })
  it('todo termo está em minúsculas e sem acento', () => {
    for (const tag of TAG_DICTIONARY) {
      for (const termo of tag.terms) {
        expect(termo).toBe(termo.toLowerCase())
        expect(termo.normalize('NFD')).toBe(termo)
      }
    }
  })
})

describe('tagsOf', () => {
  it('encontra a linguagem no título', () => {
    const tags = tagsOf('Rust 1.90 lançado', 'Novidades do compilador')
    expect(tags.map((t) => t.slug)).toContain('rust')
  })
  it('encontra framework e linguagem juntos', () => {
    const slugs = tagsOf('React 20 com novo compilador', 'Escrito em TypeScript')
      .map((t) => t.slug)
    expect(slugs).toContain('react')
    expect(slugs).toContain('typescript')
  })
  it('dá confiança maior para acerto no título', () => {
    const noTitulo = tagsOf('Kubernetes escala melhor', 'texto neutro')
      .find((t) => t.slug === 'kubernetes')!
    const noCorpo = tagsOf('Texto neutro', 'Kubernetes escala melhor')
      .find((t) => t.slug === 'kubernetes')!
    expect(noTitulo.confidence).toBeGreaterThan(noCorpo.confidence)
  })
  it('ordena por confiança decrescente', () => {
    const tags = tagsOf('NVIDIA GPU nova', 'A GPU da NVIDIA usa CUDA e roda Python')
    for (let i = 1; i < tags.length; i++) {
      expect(tags[i - 1]!.confidence).toBeGreaterThanOrEqual(tags[i]!.confidence)
    }
  })
  it('devolve lista vazia sem acertos', () => {
    expect(tagsOf('Bolo de cenoura', 'Bata os ovos')).toEqual([])
  })
  it('não confunde "go" dentro de outra palavra', () => {
    const slugs = tagsOf('Google anuncia algo', 'O governo aprovou').map((t) => t.slug)
    expect(slugs).not.toContain('go')
  })
})

describe('categoryOf', () => {
  it('classifica linguagem como programming', () => {
    expect(categoryOf('Rust 1.90 lançado', 'borrow checker', null)).toBe('programming')
  })
  it('classifica hardware como technology', () => {
    expect(categoryOf('NVIDIA lança GPU', 'mais memória HBM', null)).toBe('technology')
  })
  it('usa o hint da fonte no empate sem acertos', () => {
    expect(categoryOf('Texto neutro', 'sem termos', 'innovation')).toBe('innovation')
  })
  it('cai em technology quando não há acerto nem hint', () => {
    expect(categoryOf('Texto neutro', 'sem termos', null)).toBe('technology')
  })
})

describe('contentTypeOf', () => {
  it('detecta anúncio oficial', () => {
    expect(contentTypeOf('Google announces Gemini update', '')).toBe('announcement')
  })
  it('detecta lançamento como anúncio', () => {
    expect(contentTypeOf('Rust 1.90 released', 'changelog completo')).toBe('announcement')
  })
  it('detecta rumor', () => {
    expect(contentTypeOf('Apple reportedly working on new chip', '')).toBe('rumor')
  })
  it('detecta opinião', () => {
    expect(contentTypeOf('Why I stopped using Kubernetes', '')).toBe('opinion')
  })
  it('detecta análise', () => {
    expect(contentTypeOf('Deep dive into the new GPU architecture', '')).toBe('analysis')
  })
  it('cai em news no caso genérico', () => {
    expect(contentTypeOf('NVIDIA GPU chega ao mercado', 'disponível hoje')).toBe('news')
  })
  it('rumor tem precedência sobre anúncio no mesmo título', () => {
    expect(contentTypeOf('Apple reportedly announces new chip', '')).toBe('rumor')
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -w @devhub/core -- taxonomy
```

Esperado: FALHA — módulos inexistentes.

- [ ] **Passo 3: Implementar `dictionary.ts`**

```typescript
import type { Category, TagKind } from '../types.js'

export interface TagDef {
  slug: string
  name: string
  kind: TagKind
  category: Category
  /** Termos em minúsculas, sem acento — casam com a saída de tokenize(). */
  terms: string[]
}

export const TAG_DICTIONARY: TagDef[] = [
  // ---- Linguagens (programming) ----
  { slug: 'python', name: 'Python', kind: 'language', category: 'programming', terms: ['python', 'cpython', 'pypi'] },
  { slug: 'javascript', name: 'JavaScript', kind: 'language', category: 'programming', terms: ['javascript', 'ecmascript'] },
  { slug: 'typescript', name: 'TypeScript', kind: 'language', category: 'programming', terms: ['typescript'] },
  { slug: 'rust', name: 'Rust', kind: 'language', category: 'programming', terms: ['rust', 'rustc', 'cargo', 'crates'] },
  { slug: 'go', name: 'Go', kind: 'language', category: 'programming', terms: ['golang'] },
  { slug: 'java', name: 'Java', kind: 'language', category: 'programming', terms: ['java', 'jvm', 'jdk', 'openjdk'] },
  { slug: 'kotlin', name: 'Kotlin', kind: 'language', category: 'programming', terms: ['kotlin'] },
  { slug: 'swift', name: 'Swift', kind: 'language', category: 'programming', terms: ['swift', 'swiftui'] },
  { slug: 'cpp', name: 'C++', kind: 'language', category: 'programming', terms: ['cpp'] },
  { slug: 'csharp', name: 'C#', kind: 'language', category: 'programming', terms: ['csharp', 'dotnet'] },
  { slug: 'php', name: 'PHP', kind: 'language', category: 'programming', terms: ['php'] },
  { slug: 'ruby', name: 'Ruby', kind: 'language', category: 'programming', terms: ['ruby'] },
  { slug: 'dart', name: 'Dart', kind: 'language', category: 'programming', terms: ['dart'] },
  { slug: 'sql', name: 'SQL', kind: 'language', category: 'programming', terms: ['sql'] },
  { slug: 'wasm', name: 'WebAssembly', kind: 'language', category: 'programming', terms: ['webassembly', 'wasm'] },

  // ---- Frameworks e ferramentas (programming) ----
  { slug: 'react', name: 'React', kind: 'framework', category: 'programming', terms: ['react', 'reactjs'] },
  { slug: 'nextjs', name: 'Next.js', kind: 'framework', category: 'programming', terms: ['nextjs'] },
  { slug: 'vue', name: 'Vue', kind: 'framework', category: 'programming', terms: ['vue', 'vuejs'] },
  { slug: 'angular', name: 'Angular', kind: 'framework', category: 'programming', terms: ['angular'] },
  { slug: 'svelte', name: 'Svelte', kind: 'framework', category: 'programming', terms: ['svelte', 'sveltekit'] },
  { slug: 'nodejs', name: 'Node.js', kind: 'framework', category: 'programming', terms: ['nodejs'] },
  { slug: 'deno', name: 'Deno', kind: 'framework', category: 'programming', terms: ['deno'] },
  { slug: 'bun', name: 'Bun', kind: 'framework', category: 'programming', terms: ['bun'] },
  { slug: 'django', name: 'Django', kind: 'framework', category: 'programming', terms: ['django'] },
  { slug: 'fastapi', name: 'FastAPI', kind: 'framework', category: 'programming', terms: ['fastapi'] },
  { slug: 'spring', name: 'Spring', kind: 'framework', category: 'programming', terms: ['spring'] },
  { slug: 'laravel', name: 'Laravel', kind: 'framework', category: 'programming', terms: ['laravel'] },
  { slug: 'flutter', name: 'Flutter', kind: 'framework', category: 'programming', terms: ['flutter'] },
  { slug: 'react-native', name: 'React Native', kind: 'framework', category: 'programming', terms: ['reactnative'] },
  { slug: 'electron', name: 'Electron', kind: 'framework', category: 'programming', terms: ['electron'] },
  { slug: 'tauri', name: 'Tauri', kind: 'framework', category: 'programming', terms: ['tauri'] },
  { slug: 'git', name: 'Git', kind: 'topic', category: 'programming', terms: ['git', 'github', 'gitlab'] },
  { slug: 'testing', name: 'Testes', kind: 'topic', category: 'programming', terms: ['testing', 'testes', 'pytest', 'vitest', 'jest'] },
  { slug: 'databases', name: 'Bancos de dados', kind: 'topic', category: 'programming', terms: ['postgres', 'postgresql', 'mysql', 'sqlite', 'mongodb', 'redis', 'database'] },
  { slug: 'devops', name: 'DevOps', kind: 'topic', category: 'programming', terms: ['devops', 'cicd', 'jenkins', 'terraform', 'ansible'] },
  { slug: 'docker', name: 'Docker', kind: 'framework', category: 'programming', terms: ['docker', 'containerd', 'podman'] },
  { slug: 'kubernetes', name: 'Kubernetes', kind: 'framework', category: 'programming', terms: ['kubernetes', 'k8s'] },
  { slug: 'api-design', name: 'APIs', kind: 'topic', category: 'programming', terms: ['api', 'rest', 'graphql', 'grpc', 'openapi'] },

  // ---- Hardware (technology) ----
  { slug: 'gpu', name: 'GPUs', kind: 'hardware', category: 'technology', terms: ['gpu', 'cuda', 'geforce', 'radeon', 'vram'] },
  { slug: 'cpu', name: 'CPUs', kind: 'hardware', category: 'technology', terms: ['cpu', 'processador', 'processor', 'ryzen', 'xeon'] },
  { slug: 'memory', name: 'Memória e armazenamento', kind: 'hardware', category: 'technology', terms: ['ram', 'ddr', 'hbm', 'ssd', 'nvme', 'storage'] },
  { slug: 'nvidia', name: 'NVIDIA', kind: 'company', category: 'technology', terms: ['nvidia'] },
  { slug: 'amd', name: 'AMD', kind: 'company', category: 'technology', terms: ['amd'] },
  { slug: 'intel', name: 'Intel', kind: 'company', category: 'technology', terms: ['intel'] },
  { slug: 'apple', name: 'Apple', kind: 'company', category: 'technology', terms: ['apple', 'macbook', 'iphone'] },
  { slug: 'arm', name: 'ARM', kind: 'hardware', category: 'technology', terms: ['arm', 'riscv', 'snapdragon', 'qualcomm'] },

  // ---- Plataformas e infra (technology) ----
  { slug: 'linux', name: 'Linux', kind: 'topic', category: 'technology', terms: ['linux', 'kernel', 'ubuntu', 'debian', 'fedora', 'arch'] },
  { slug: 'windows', name: 'Windows', kind: 'topic', category: 'technology', terms: ['windows', 'microsoft', 'powershell'] },
  { slug: 'android', name: 'Android', kind: 'topic', category: 'technology', terms: ['android'] },
  { slug: 'ios', name: 'iOS', kind: 'topic', category: 'technology', terms: ['ios', 'ipados'] },
  { slug: 'cloud', name: 'Cloud', kind: 'topic', category: 'technology', terms: ['cloud', 'aws', 'azure', 'gcp', 'serverless'] },
  { slug: 'security', name: 'Segurança', kind: 'topic', category: 'technology', terms: ['security', 'seguranca', 'vulnerability', 'cve', 'exploit', 'ransomware', 'malware', 'criptografia', 'encryption'] },
  { slug: 'networking', name: 'Redes', kind: 'topic', category: 'technology', terms: ['networking', 'redes', 'tcp', 'http3', 'dns', 'cdn'] },

  // ---- IA (technology) ----
  { slug: 'ai', name: 'Inteligência Artificial', kind: 'topic', category: 'technology', terms: ['ai', 'ia', 'artificial', 'llm', 'gpt', 'claude', 'gemini', 'chatbot'] },
  { slug: 'machine-learning', name: 'Machine Learning', kind: 'topic', category: 'technology', terms: ['machine', 'learning', 'neural', 'transformer', 'pytorch', 'tensorflow', 'embedding', 'inference'] },

  // ---- Inovação ----
  { slug: 'quantum', name: 'Computação quântica', kind: 'topic', category: 'innovation', terms: ['quantum', 'quantica', 'qubit'] },
  { slug: 'robotics', name: 'Robótica', kind: 'topic', category: 'innovation', terms: ['robotics', 'robotica', 'robot', 'drone'] },
  { slug: 'research', name: 'Pesquisa', kind: 'topic', category: 'innovation', terms: ['arxiv', 'paper', 'preprint', 'pesquisa', 'breakthrough'] },
  { slug: 'open-source', name: 'Open Source', kind: 'topic', category: 'innovation', terms: ['opensource', 'foss'] },
  { slug: 'startups', name: 'Startups', kind: 'topic', category: 'innovation', terms: ['startup', 'seed', 'funding'] },
  { slug: 'prototype', name: 'Protótipos', kind: 'topic', category: 'innovation', terms: ['prototype', 'prototipo', 'experimental', 'experiment'] },
]
```

- [ ] **Passo 4: Implementar `classify.ts`**

```typescript
import { tokenize } from '../dedup/simhash.js'
import type { Category, ContentType } from '../types.js'
import { TAG_DICTIONARY } from './dictionary.js'

const PESO_TITULO = 3
const PESO_CORPO = 1
/** Normalizador: acerto de título único já dá confiança respeitável. */
const SATURACAO = 6

/** Índice termo -> slug, montado uma vez. */
const INDICE = new Map<string, string[]>()
for (const tag of TAG_DICTIONARY) {
  for (const termo of tag.terms) {
    const lista = INDICE.get(termo)
    if (lista) lista.push(tag.slug)
    else INDICE.set(termo, [tag.slug])
  }
}

const POR_SLUG = new Map(TAG_DICTIONARY.map((t) => [t.slug, t]))

export function tagsOf(
  title: string,
  text: string,
): Array<{ slug: string; confidence: number }> {
  const pontos = new Map<string, number>()

  // tokenize() já quebra em palavras inteiras, então "governo" nunca
  // casa com o termo "go" — o casamento é por token, não por substring.
  for (const token of new Set(tokenize(title))) {
    for (const slug of INDICE.get(token) ?? []) {
      pontos.set(slug, (pontos.get(slug) ?? 0) + PESO_TITULO)
    }
  }
  for (const token of new Set(tokenize(text))) {
    for (const slug of INDICE.get(token) ?? []) {
      pontos.set(slug, (pontos.get(slug) ?? 0) + PESO_CORPO)
    }
  }

  return [...pontos.entries()]
    .map(([slug, p]) => ({ slug, confidence: Math.min(1, p / SATURACAO) }))
    .sort((a, b) => b.confidence - a.confidence || a.slug.localeCompare(b.slug))
}

export function categoryOf(
  title: string,
  text: string,
  hint: Category | null,
): Category {
  const tags = tagsOf(title, text)
  if (tags.length === 0) return hint ?? 'technology'

  const soma: Record<Category, number> = { technology: 0, programming: 0, innovation: 0 }
  for (const { slug, confidence } of tags) {
    const def = POR_SLUG.get(slug)
    if (def) soma[def.category] += confidence
  }

  // O hint da fonte entra como voto leve, não como decisão.
  if (hint) soma[hint] += 0.25

  let vencedora: Category = 'technology'
  for (const c of ['technology', 'programming', 'innovation'] as const) {
    if (soma[c] > soma[vencedora]) vencedora = c
  }
  return vencedora
}

/** Ordem importa: um rumor sobre um anúncio continua sendo rumor. */
const PADROES: Array<[ContentType, RegExp]> = [
  ['rumor', /\b(rumor|rumou?red|reportedly|leak(ed|s)?|allegedly|supostamente|vazou)\b/i],
  ['opinion', /\b(opinion|why i|i think|unpopular|rant|should stop|opiniao|por que eu)\b/i],
  ['analysis', /\b(deep dive|analysis|explained|benchmark|comparison|review|analise|comparativo)\b/i],
  ['announcement', /\b(announc\w*|introduc\w*|releas\w*|launch\w*|unveil\w*|now available|ships?|anuncia|lanca\w*|apresenta)\b/i],
  ['report', /\b(report|study|survey|research finds|relatorio|estudo|pesquisa aponta)\b/i],
]

export function contentTypeOf(title: string, text: string): ContentType {
  const alvo = `${title} ${text.slice(0, 400)}`
  for (const [tipo, padrao] of PADROES) {
    if (padrao.test(alvo)) return tipo
  }
  return 'news'
}
```

- [ ] **Passo 5: Rodar até passar**

```bash
npm test -w @devhub/core -- taxonomy
```

Esperado: PASSA (20 testes).

- [ ] **Passo 6: Commit**

```bash
git add packages/core/src/taxonomy
git commit -m "feat: taxonomia de tags, categorias e tipo de conteúdo

O casamento é por token inteiro, não por substring — 'governo' não
vira a linguagem Go. A ordem dos padrões de contentType garante que
um rumor sobre um anúncio continue classificado como rumor, que é o
que o spec pede ao distinguir notícia confirmada de boato.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarefa 9: `AIProvider` e `HeuristicProvider`

**Files:**
- Create: `packages/core/src/ai/provider.ts`
- Create: `packages/core/src/ai/heuristic.ts`
- Create: `packages/core/src/ai/heuristic.test.ts`

**Interfaces:**
- Consumes: `tagsOf`, `categoryOf`, `contentTypeOf` (T8); `Category`, `ContentType` (T2)
- Produces:
  - `interface ArticleForAI { id, title, excerpt, contentText, sourceTrust, categoryHint }`
  - `interface Classification { articleId, category, contentType, importance, tags, isAiGenerated }`
  - `interface Summary { text, keyPoints, provider, model, isAiGenerated }`
  - `interface ModelInfo { id, name }`
  - `interface AIProvider { name, listModels, classifyBatch, summarize }`
  - `class HeuristicProvider implements AIProvider`

- [ ] **Passo 1: Escrever o teste que falha**

`packages/core/src/ai/heuristic.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { HeuristicProvider } from './heuristic.js'
import type { ArticleForAI } from './provider.js'

const provider = new HeuristicProvider()

function artigo(over: Partial<ArticleForAI> = {}): ArticleForAI {
  return {
    id: 'a1',
    title: 'Rust 1.90 lançado com melhorias no borrow checker',
    excerpt: 'A nova versão do compilador melhora mensagens de erro.',
    contentText:
      'A equipe do Rust lançou a versão 1.90. O compilador agora produz ' +
      'mensagens de erro mais claras no borrow checker. O cargo ganhou ' +
      'suporte a builds incrementais mais rápidos. A comunidade recebeu bem.',
    sourceTrust: 0.9,
    categoryHint: null,
    ...over,
  }
}

describe('HeuristicProvider — identidade', () => {
  it('se identifica', () => expect(provider.name).toBe('heuristic'))
  it('anuncia um modelo sintético', async () => {
    const modelos = await provider.listModels()
    expect(modelos).toHaveLength(1)
    expect(modelos[0]!.id).toBe('heuristic-v1')
  })
})

describe('HeuristicProvider.classifyBatch', () => {
  it('devolve uma classificação por artigo, na mesma ordem', async () => {
    const r = await provider.classifyBatch([artigo({ id: 'x' }), artigo({ id: 'y' })])
    expect(r.map((c) => c.articleId)).toEqual(['x', 'y'])
  })

  it('classifica categoria e tipo de conteúdo', async () => {
    const [c] = await provider.classifyBatch([artigo()])
    expect(c!.category).toBe('programming')
    expect(c!.contentType).toBe('announcement')
  })

  it('extrai tags relevantes', async () => {
    const [c] = await provider.classifyBatch([artigo()])
    expect(c!.tags.map((t) => t.slug)).toContain('rust')
  })

  it('importância fica entre 0 e 1', async () => {
    const [c] = await provider.classifyBatch([artigo()])
    expect(c!.importance).toBeGreaterThanOrEqual(0)
    expect(c!.importance).toBeLessThanOrEqual(1)
  })

  it('fonte mais confiável produz importância maior', async () => {
    const [alta] = await provider.classifyBatch([artigo({ sourceTrust: 1.0 })])
    const [baixa] = await provider.classifyBatch([artigo({ sourceTrust: 0.4 })])
    expect(alta!.importance).toBeGreaterThan(baixa!.importance)
  })

  it('marca a saída como gerada automaticamente', async () => {
    const [c] = await provider.classifyBatch([artigo()])
    expect(c!.isAiGenerated).toBe(true)
  })

  it('lote vazio devolve lista vazia', async () => {
    expect(await provider.classifyBatch([])).toEqual([])
  })

  it('não lança com artigo de conteúdo vazio', async () => {
    const [c] = await provider.classifyBatch([
      artigo({ title: '', excerpt: '', contentText: '' }),
    ])
    expect(c!.articleId).toBe('a1')
  })
})

describe('HeuristicProvider.summarize', () => {
  it('produz resumo extrativo não vazio', async () => {
    const s = await provider.summarize(artigo(), 'short')
    expect(s.text.length).toBeGreaterThan(0)
  })

  it('o resumo usa frases do próprio artigo', async () => {
    const a = artigo()
    const s = await provider.summarize(a, 'short')
    for (const frase of s.text.split(/(?<=\.)\s+/)) {
      if (frase.trim()) expect(a.contentText).toContain(frase.trim().replace(/\.$/, ''))
    }
  })

  it('o resumo profundo é maior ou igual ao curto', async () => {
    const curto = await provider.summarize(artigo(), 'short')
    const fundo = await provider.summarize(artigo(), 'deep')
    expect(fundo.text.length).toBeGreaterThanOrEqual(curto.text.length)
  })

  it('marca como gerado automaticamente e identifica o gerador', async () => {
    const s = await provider.summarize(artigo(), 'short')
    expect(s.isAiGenerated).toBe(true)
    expect(s.provider).toBe('heuristic')
    expect(s.model).toBe('heuristic-v1')
  })

  it('devolve texto vazio sem lançar quando não há conteúdo', async () => {
    const s = await provider.summarize(artigo({ contentText: '', excerpt: '' }), 'short')
    expect(s.text).toBe('')
    expect(s.keyPoints).toEqual([])
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -w @devhub/core -- heuristic
```

Esperado: FALHA — módulos inexistentes.

- [ ] **Passo 3: Implementar `provider.ts`**

```typescript
import type { Category, ContentType } from '../types.js'

export interface ArticleForAI {
  id: string
  title: string
  excerpt: string
  contentText: string
  sourceTrust: number
  categoryHint: Category | null
}

export interface Classification {
  articleId: string
  category: Category
  contentType: ContentType
  importance: number
  tags: Array<{ slug: string; confidence: number }>
  /** Sempre true: nenhuma saída automática é exibida sem rótulo. */
  isAiGenerated: true
}

export interface Summary {
  text: string
  keyPoints: string[]
  provider: string
  model: string
  isAiGenerated: true
}

export interface ModelInfo {
  id: string
  name: string
}

/**
 * Contrato da camada de IA. O GeminiProvider da Fase 5 implementa esta
 * mesma interface; o HeuristicProvider é a rede de segurança que mantém
 * o app funcional sem chave, sem cota e sem internet.
 */
export interface AIProvider {
  readonly name: string
  listModels(): Promise<ModelInfo[]>
  classifyBatch(articles: ArticleForAI[]): Promise<Classification[]>
  summarize(article: ArticleForAI, kind: 'short' | 'deep'): Promise<Summary>
}
```

- [ ] **Passo 4: Implementar `heuristic.ts`**

```typescript
import { tokenize } from '../dedup/simhash.js'
import { categoryOf, contentTypeOf, tagsOf } from '../taxonomy/classify.js'
import type {
  AIProvider, ArticleForAI, Classification, ModelInfo, Summary,
} from './provider.js'

const MODELO = 'heuristic-v1'
const FRASES_CURTO = 2
const FRASES_FUNDO = 4

/** Tipos de conteúdo que merecem mais destaque no ranking. */
const PESO_TIPO: Record<string, number> = {
  announcement: 1.0, news: 0.85, report: 0.75,
  analysis: 0.65, opinion: 0.45, rumor: 0.35,
}

function frases(texto: string): string[] {
  return texto
    .split(/(?<=[.!?])\s+/)
    .map((f) => f.trim())
    .filter((f) => f.length >= 30)
}

/**
 * Resumo extrativo: pontua cada frase pela sobreposição com o título e
 * por posição (início do texto vale mais), devolve as melhores na ordem
 * original. Não inventa texto — todo trecho existe no artigo.
 */
function extrair(title: string, texto: string, quantas: number): string[] {
  const candidatas = frases(texto)
  if (candidatas.length === 0) return []

  const termosTitulo = new Set(tokenize(title))
  const pontuadas = candidatas.map((frase, indice) => {
    const tokens = tokenize(frase)
    let acertos = 0
    for (const t of new Set(tokens)) if (termosTitulo.has(t)) acertos++
    const relevancia = tokens.length > 0 ? acertos / Math.sqrt(tokens.length) : 0
    const posicao = 1 / (1 + indice * 0.35)
    return { frase, indice, pontos: relevancia + posicao * 0.5 }
  })

  return pontuadas
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, quantas)
    .sort((a, b) => a.indice - b.indice)   // devolve na ordem do artigo
    .map((p) => p.frase)
}

export class HeuristicProvider implements AIProvider {
  readonly name = 'heuristic'

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: MODELO, name: 'Heurística local (sem IA)' }]
  }

  async classifyBatch(articles: ArticleForAI[]): Promise<Classification[]> {
    return articles.map((a) => {
      const corpo = a.contentText || a.excerpt
      const tags = tagsOf(a.title, corpo)
      const contentType = contentTypeOf(a.title, corpo)

      // Importância = confiança da fonte x peso do tipo x densidade de tags.
      const densidade = Math.min(1, tags.reduce((s, t) => s + t.confidence, 0) / 3)
      const importance = Math.min(
        1,
        a.sourceTrust * (PESO_TIPO[contentType] ?? 0.6) * (0.5 + densidade * 0.5),
      )

      return {
        articleId: a.id,
        category: categoryOf(a.title, corpo, a.categoryHint),
        contentType,
        importance,
        tags: tags.slice(0, 8),
        isAiGenerated: true,
      }
    })
  }

  async summarize(article: ArticleForAI, kind: 'short' | 'deep'): Promise<Summary> {
    const corpo = article.contentText || article.excerpt
    const quantas = kind === 'deep' ? FRASES_FUNDO : FRASES_CURTO
    const escolhidas = extrair(article.title, corpo, quantas)

    return {
      text: escolhidas.join(' '),
      keyPoints: escolhidas,
      provider: this.name,
      model: MODELO,
      isAiGenerated: true,
    }
  }
}
```

- [ ] **Passo 5: Rodar até passar**

```bash
npm test -w @devhub/core -- heuristic
```

Esperado: PASSA (15 testes).

- [ ] **Passo 6: Commit**

```bash
git add packages/core/src/ai
git commit -m "feat: interface AIProvider e HeuristicProvider

Mecanismo 7 dos oito de proteção de cota: é a rede de segurança que
mantém o Dev Hub 100% funcional sem chave, sem cota e sem internet.
O resumo é estritamente extrativo — nenhuma frase é inventada, toda
sentença existe no artigo original — e sai marcada como gerada
automaticamente para nunca ser exibida sem rótulo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarefa 10: Ranking, frescor e breaking news

**Files:**
- Create: `packages/core/src/rank/freshness.ts`, `score.ts`, `breaking.ts`
- Create: `packages/core/src/rank/rank.test.ts`

**Interfaces:**
- Consumes: `Category` (T2)
- Produces:
  - `freshness(publishedAt: number, now: number, halfLifeHours: number): number`
  - `MEIA_VIDA_HORAS: Record<Category, number>`
  - `interface ScoreInput { publishedAt, now, category, trustWeight, importance, followMatches, articleCount }`
  - `interface ScoreBreakdown { freshness, trust, importance, affinity, dedupPenalty, total }`
  - `scoreStory(input: ScoreInput): ScoreBreakdown`
  - `interface BreakingInput { importance, articleCount, firstSeenAt, lastArticleAt, hasTrustedSource }`
  - `isBreaking(input: BreakingInput): boolean`

- [ ] **Passo 1: Escrever o teste que falha**

`packages/core/src/rank/rank.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { MEIA_VIDA_HORAS, freshness } from './freshness.js'
import { scoreStory, type ScoreInput } from './score.js'
import { isBreaking } from './breaking.js'

const HORA = 3_600_000
const AGORA = 1_760_000_000_000

describe('freshness', () => {
  it('vale 1 no instante da publicação', () => {
    expect(freshness(AGORA, AGORA, 18)).toBe(1)
  })

  it('vale exatamente 0.5 após uma meia-vida', () => {
    expect(freshness(AGORA - 18 * HORA, AGORA, 18)).toBeCloseTo(0.5, 6)
  })

  it('vale 0.25 após duas meias-vidas', () => {
    expect(freshness(AGORA - 36 * HORA, AGORA, 18)).toBeCloseTo(0.25, 6)
  })

  it('decai monotonicamente', () => {
    const a = freshness(AGORA - 1 * HORA, AGORA, 18)
    const b = freshness(AGORA - 10 * HORA, AGORA, 18)
    expect(a).toBeGreaterThan(b)
  })

  it('trata data futura como recém-publicada, sem estourar acima de 1', () => {
    expect(freshness(AGORA + 5 * HORA, AGORA, 18)).toBe(1)
  })

  it('Innovation envelhece mais devagar que Technology', () => {
    expect(MEIA_VIDA_HORAS.innovation).toBeGreaterThan(MEIA_VIDA_HORAS.technology)
  })
})

describe('scoreStory', () => {
  function entrada(over: Partial<ScoreInput> = {}): ScoreInput {
    return {
      publishedAt: AGORA, now: AGORA, category: 'technology',
      trustWeight: 0.8, importance: 0.6, followMatches: [], articleCount: 1,
      ...over,
    }
  }

  it('devolve a decomposição completa, para o painel "por que estou vendo isto"', () => {
    const b = scoreStory(entrada())
    expect(Object.keys(b).sort()).toEqual(
      ['affinity', 'dedupPenalty', 'freshness', 'importance', 'total', 'trust'],
    )
  })

  it('o total é o produto dos fatores', () => {
    const b = scoreStory(entrada())
    expect(b.total).toBeCloseTo(
      b.freshness * b.trust * b.importance * b.affinity * b.dedupPenalty, 9,
    )
  })

  it('artigo mais recente pontua mais que o mesmo artigo antigo', () => {
    const novo = scoreStory(entrada()).total
    const velho = scoreStory(entrada({ publishedAt: AGORA - 48 * HORA })).total
    expect(novo).toBeGreaterThan(velho)
  })

  it('fonte mais confiável pontua mais', () => {
    expect(scoreStory(entrada({ trustWeight: 1.0 })).total)
      .toBeGreaterThan(scoreStory(entrada({ trustWeight: 0.5 })).total)
  })

  it('seguir um tópico aumenta a afinidade acima de 1', () => {
    const b = scoreStory(entrada({
      followMatches: [{ weight: 1.0, tagConfidence: 0.9 }],
    }))
    expect(b.affinity).toBeGreaterThan(1)
  })

  it('afinidade satura em 3 mesmo com muitos follows', () => {
    const b = scoreStory(entrada({
      followMatches: Array.from({ length: 20 }, () => ({ weight: 1, tagConfidence: 1 })),
    }))
    expect(b.affinity).toBeLessThanOrEqual(3)
  })

  it('sem follows a afinidade é exatamente 1, neutra', () => {
    expect(scoreStory(entrada()).affinity).toBe(1)
  })

  it('história com muitos artigos duplicados é penalizada', () => {
    const um = scoreStory(entrada({ articleCount: 1 })).dedupPenalty
    const cinco = scoreStory(entrada({ articleCount: 5 })).dedupPenalty
    expect(cinco).toBeLessThan(um)
    expect(um).toBe(1)
  })

  it('importância zero zera o total', () => {
    expect(scoreStory(entrada({ importance: 0 })).total).toBe(0)
  })
})

describe('isBreaking', () => {
  const base = {
    importance: 0.9, articleCount: 3,
    firstSeenAt: AGORA - 2 * HORA, lastArticleAt: AGORA,
    hasTrustedSource: true,
  }

  it('marca quando todas as condições valem', () => {
    expect(isBreaking(base)).toBe(true)
  })

  it('não marca com importância baixa', () => {
    expect(isBreaking({ ...base, importance: 0.5 })).toBe(false)
  })

  it('não marca com menos de 3 artigos', () => {
    expect(isBreaking({ ...base, articleCount: 2 })).toBe(false)
  })

  it('não marca se os artigos se espalharam por mais de 6 horas', () => {
    expect(isBreaking({ ...base, firstSeenAt: AGORA - 10 * HORA })).toBe(false)
  })

  it('não marca sem nenhuma fonte confiável — evita boato replicado', () => {
    expect(isBreaking({ ...base, hasTrustedSource: false })).toBe(false)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -w @devhub/core -- rank
```

Esperado: FALHA — módulos inexistentes.

- [ ] **Passo 3: Implementar `freshness.ts`**

```typescript
import type { Category } from '../types.js'

/** Spec §7.1: Innovation envelhece devagar; notícia de hardware, rápido. */
export const MEIA_VIDA_HORAS: Record<Category, number> = {
  technology: 18,
  programming: 18,
  innovation: 36,
}

const MS_POR_HORA = 3_600_000

/** Decaimento exponencial. Vale 1 no instante zero e 0.5 a cada meia-vida. */
export function freshness(
  publishedAt: number,
  now: number,
  halfLifeHours: number,
): number {
  const horas = Math.max(0, (now - publishedAt) / MS_POR_HORA)
  return Math.exp((-Math.LN2 * horas) / halfLifeHours)
}
```

- [ ] **Passo 4: Implementar `score.ts`**

```typescript
import type { Category } from '../types.js'
import { MEIA_VIDA_HORAS, freshness } from './freshness.js'

export interface FollowMatch {
  weight: number         // peso do follow definido pelo usuário
  tagConfidence: number  // confiança da tag no artigo
}

export interface ScoreInput {
  publishedAt: number
  now: number
  category: Category
  trustWeight: number
  importance: number
  followMatches: FollowMatch[]
  articleCount: number
}

export interface ScoreBreakdown {
  freshness: number
  trust: number
  importance: number
  affinity: number
  dedupPenalty: number
  total: number
}

const AFINIDADE_MAX = 3
const FATOR_DUPLICATA = 0.15

/**
 * Spec §7.1. Devolve a decomposição inteira, não só o total: a interface
 * mostra ao usuário por que um item está no topo. Nada de caixa-preta.
 */
export function scoreStory(input: ScoreInput): ScoreBreakdown {
  const f = freshness(input.publishedAt, input.now, MEIA_VIDA_HORAS[input.category])
  const trust = input.trustWeight
  const importance = input.importance

  const soma = input.followMatches.reduce(
    (acc, m) => acc + m.weight * m.tagConfidence, 0,
  )
  const affinity = Math.min(AFINIDADE_MAX, 1 + soma)

  const dedupPenalty = 1 / (1 + FATOR_DUPLICATA * Math.max(0, input.articleCount - 1))

  return {
    freshness: f,
    trust,
    importance,
    affinity,
    dedupPenalty,
    total: f * trust * importance * affinity * dedupPenalty,
  }
}
```

- [ ] **Passo 5: Implementar `breaking.ts`**

```typescript
export interface BreakingInput {
  importance: number
  articleCount: number
  firstSeenAt: number
  lastArticleAt: number
  /** Alguma fonte do grupo é oficial ou tem trustWeight >= 0.8. */
  hasTrustedSource: boolean
}

export const IMPORTANCIA_MINIMA = 0.85
export const ARTIGOS_MINIMOS = 3
export const JANELA_HORAS = 6

const MS_POR_HORA = 3_600_000

/**
 * Spec §7.2. As três condições valem em conjunto — a exigência de fonte
 * confiável é o que impede um boato replicado por agregadores de virar
 * manchete de "última hora".
 */
export function isBreaking(input: BreakingInput): boolean {
  if (input.importance <= IMPORTANCIA_MINIMA) return false
  if (input.articleCount < ARTIGOS_MINIMOS) return false
  if (!input.hasTrustedSource) return false

  const janela = (input.lastArticleAt - input.firstSeenAt) / MS_POR_HORA
  return janela <= JANELA_HORAS
}
```

- [ ] **Passo 6: Rodar até passar**

```bash
npm test -w @devhub/core -- rank
```

Esperado: PASSA (20 testes).

- [ ] **Passo 7: Commit**

```bash
git add packages/core/src/rank
git commit -m "feat: ranking por frescor, confiança, importância e afinidade

scoreStory devolve a decomposição inteira em vez de só o total: é o
que alimenta o painel 'por que estou vendo isto' exigido pelo spec.
isBreaking exige fonte confiável no grupo, impedindo que um boato
replicado por agregadores vire manchete de última hora.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarefa 11: Esquema SQLite, migrações e driver

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`
- Create: `packages/db/src/driver.ts`, `schema.ts`, `migrate.ts`, `index.ts`
- Create: `packages/db/src/drivers/node-sqlite.ts`
- Create: `packages/db/src/migrate.test.ts`

**Interfaces:**
- Consumes: tipos de `@devhub/core` (T2)
- Produces:
  - `interface SqlDriver { exec(sql), all<T>(sql, params?), get<T>(sql, params?), run(sql, params?), transaction<T>(fn), close() }`
  - `type SqlParams = Record<string, string | number | null> | Array<string | number | null>`
  - `class NodeSqliteDriver implements SqlDriver`
  - `MIGRATIONS: Array<{ version: number; up: string }>`
  - `migrate(db: SqlDriver): number` — devolve a versão final

- [ ] **Passo 1: Criar o pacote `db`**

`packages/db/package.json`:

```json
{
  "name": "@devhub/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run" },
  "dependencies": { "@devhub/core": "*" }
}
```

`packages/db/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "references": [{ "path": "../core" }]
}
```

- [ ] **Passo 2: Escrever o teste que falha**

`packages/db/src/migrate.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { NodeSqliteDriver } from './drivers/node-sqlite.js'
import { MIGRATIONS, migrate } from './index.js'

function db() {
  const d = new NodeSqliteDriver(':memory:')
  migrate(d)
  return d
}

describe('MIGRATIONS', () => {
  it('tem versões únicas e crescentes a partir de 1', () => {
    const vs = MIGRATIONS.map((m) => m.version)
    expect(vs).toEqual([...vs].sort((a, b) => a - b))
    expect(new Set(vs).size).toBe(vs.length)
    expect(vs[0]).toBe(1)
  })
})

describe('migrate', () => {
  it('cria todas as tabelas do spec §5', () => {
    const d = db()
    const nomes = d.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type IN ('table','view')",
    ).map((r) => r.name)

    for (const t of [
      'sources', 'articles', 'stories', 'story_articles', 'summaries',
      'tags', 'article_tags', 'follows', 'saved_articles',
      'reading_history', 'ai_usage', 'settings', 'articles_fts',
    ]) {
      expect(nomes).toContain(t)
    }
    d.close()
  })

  it('é idempotente — rodar duas vezes não quebra nem duplica', () => {
    const d = new NodeSqliteDriver(':memory:')
    const v1 = migrate(d)
    const v2 = migrate(d)
    expect(v2).toBe(v1)
    d.close()
  })

  it('registra a versão aplicada', () => {
    const d = db()
    const v = d.get<{ v: number }>('PRAGMA user_version')
    expect(v!.v).toBe(MIGRATIONS[MIGRATIONS.length - 1]!.version)
    d.close()
  })

  it('liga as chaves estrangeiras', () => {
    const d = db()
    expect(d.get<{ foreign_keys: number }>('PRAGMA foreign_keys')!.foreign_keys).toBe(1)
    d.close()
  })

  it('rejeita artigo com sourceId inexistente', () => {
    const d = db()
    expect(() =>
      d.run(
        'INSERT INTO articles (id, source_id, url, canonical_url, title, published_at, fetched_at, excerpt, content_text, lang, simhash, word_count, reading_minutes, content_type, ai_state) ' +
        "VALUES ('a','NAO_EXISTE','u','u','t',1,1,'','','en','0',0,1,'news','pending')",
      ),
    ).toThrow()
    d.close()
  })

  it('impede canonical_url duplicada', () => {
    const d = db()
    d.run("INSERT INTO sources (id,name,url,feed_url,kind,trust_weight,active) VALUES ('s','S','u','f','news',0.8,1)")
    const ins = (id: string) =>
      d.run(
        'INSERT INTO articles (id, source_id, url, canonical_url, title, published_at, fetched_at, excerpt, content_text, lang, simhash, word_count, reading_minutes, content_type, ai_state) ' +
        `VALUES ('${id}','s','https://a/x','https://a/x','t',1,1,'','','en','0',0,1,'news','pending')`,
      )
    ins('a1')
    expect(() => ins('a2')).toThrow()
    d.close()
  })

  it('a tabela FTS aceita inserção e busca com ranking', () => {
    const d = db()
    d.run(
      'INSERT INTO articles_fts (article_id, title, excerpt, content_text, tags_flat) VALUES (?,?,?,?,?)',
      ['a1', 'Rust 1.90', 'compilador', 'borrow checker mais rapido', 'rust'],
    )
    const r = d.all<{ article_id: string }>(
      'SELECT article_id FROM articles_fts WHERE articles_fts MATCH ? ORDER BY rank',
      ['borrow'],
    )
    expect(r.map((x) => x.article_id)).toEqual(['a1'])
    d.close()
  })
})

describe('NodeSqliteDriver', () => {
  it('transaction confirma em sucesso', () => {
    const d = db()
    d.transaction(() => {
      d.run("INSERT INTO settings (key, value) VALUES ('tema','escuro')")
    })
    expect(d.get<{ value: string }>("SELECT value FROM settings WHERE key='tema'")!.value)
      .toBe('escuro')
    d.close()
  })

  it('transaction desfaz tudo em erro', () => {
    const d = db()
    expect(() =>
      d.transaction(() => {
        d.run("INSERT INTO settings (key, value) VALUES ('a','1')")
        throw new Error('falhou no meio')
      }),
    ).toThrow('falhou no meio')
    expect(d.get("SELECT value FROM settings WHERE key='a'")).toBeUndefined()
    d.close()
  })

  it('aceita parâmetros posicionais e nomeados', () => {
    const d = db()
    d.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['p', '1'])
    d.run('INSERT INTO settings (key, value) VALUES (:k, :v)', { k: 'n', v: '2' })
    expect(d.all('SELECT key FROM settings ORDER BY key')).toHaveLength(2)
    d.close()
  })
})
```

- [ ] **Passo 3: Rodar e ver falhar**

```bash
npm install
npm test -w @devhub/db
```

Esperado: FALHA — módulos inexistentes.

- [ ] **Passo 4: Implementar `driver.ts`**

```typescript
export type SqlValue = string | number | null
export type SqlParams = Record<string, SqlValue> | SqlValue[]

/**
 * Única superfície de banco que o resto do app conhece. A Fase 1 traz o
 * driver node:sqlite (desktop e CLI); a Fase 3 acrescenta um driver
 * expo-sqlite para o Android implementando este mesmo contrato.
 */
export interface SqlDriver {
  exec(sql: string): void
  all<T = Record<string, unknown>>(sql: string, params?: SqlParams): T[]
  get<T = Record<string, unknown>>(sql: string, params?: SqlParams): T | undefined
  run(sql: string, params?: SqlParams): void
  transaction<T>(fn: () => T): T
  close(): void
}
```

- [ ] **Passo 5: Implementar `drivers/node-sqlite.ts`**

```typescript
import { DatabaseSync } from 'node:sqlite'
import type { SqlDriver, SqlParams } from '../driver.js'

export class NodeSqliteDriver implements SqlDriver {
  private readonly db: DatabaseSync

  constructor(caminho = ':memory:') {
    this.db = new DatabaseSync(caminho)
    this.db.exec('PRAGMA foreign_keys = ON')
    this.db.exec('PRAGMA journal_mode = WAL')
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  all<T = Record<string, unknown>>(sql: string, params?: SqlParams): T[] {
    const st = this.db.prepare(sql)
    return (params === undefined
      ? st.all()
      : Array.isArray(params) ? st.all(...params) : st.all(params)) as T[]
  }

  get<T = Record<string, unknown>>(sql: string, params?: SqlParams): T | undefined {
    const st = this.db.prepare(sql)
    return (params === undefined
      ? st.get()
      : Array.isArray(params) ? st.get(...params) : st.get(params)) as T | undefined
  }

  run(sql: string, params?: SqlParams): void {
    const st = this.db.prepare(sql)
    if (params === undefined) st.run()
    else if (Array.isArray(params)) st.run(...params)
    else st.run(params)
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN')
    try {
      const r = fn()
      this.db.exec('COMMIT')
      return r
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  close(): void {
    this.db.close()
  }
}
```

- [ ] **Passo 6: Implementar `schema.ts`**

```typescript
export interface Migration {
  version: number
  up: string
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: `
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  feed_url TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('official','news','blog','aggregator','research')),
  trust_weight REAL NOT NULL CHECK (trust_weight BETWEEN 0 AND 1),
  category_hint TEXT CHECK (category_hint IN ('technology','programming','innovation')),
  active INTEGER NOT NULL DEFAULT 1,
  last_fetched_at INTEGER,
  etag TEXT,
  last_modified TEXT
);

CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  canonical_title TEXT NOT NULL,
  canonical_summary TEXT,
  category TEXT NOT NULL CHECK (category IN ('technology','programming','innovation')),
  importance REAL NOT NULL DEFAULT 0.5 CHECK (importance BETWEEN 0 AND 1),
  is_breaking INTEGER NOT NULL DEFAULT 0,
  first_seen_at INTEGER NOT NULL,
  last_updated_at INTEGER NOT NULL,
  article_count INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  canonical_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  author TEXT,
  published_at INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  content_html TEXT,
  image_url TEXT,
  lang TEXT NOT NULL DEFAULT 'en',
  simhash TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  reading_minutes INTEGER NOT NULL DEFAULT 1,
  story_id TEXT REFERENCES stories(id) ON DELETE SET NULL,
  content_type TEXT NOT NULL DEFAULT 'news'
    CHECK (content_type IN ('news','announcement','report','rumor','opinion','analysis')),
  ai_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (ai_state IN ('pending','prefiltered_out','classified','summarized','failed'))
);

CREATE INDEX idx_articles_published ON articles(published_at DESC);
CREATE INDEX idx_articles_story ON articles(story_id);
CREATE INDEX idx_articles_source ON articles(source_id);
CREATE INDEX idx_articles_ai_state ON articles(ai_state);
CREATE INDEX idx_stories_updated ON stories(last_updated_at DESC);

CREATE TABLE story_articles (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (story_id, article_id)
);

CREATE TABLE summaries (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('short','deep')),
  text TEXT NOT NULL,
  key_points TEXT NOT NULL DEFAULT '[]',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  generated_at INTEGER NOT NULL,
  -- Nunca exibir texto gerado sem rótulo: o spec exige atribuição explícita.
  is_ai_generated INTEGER NOT NULL DEFAULT 1,
  UNIQUE (article_id, kind)
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('language','framework','hardware','company','topic','product')),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE article_tags (
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  confidence REAL NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
  source TEXT NOT NULL DEFAULT 'rule' CHECK (source IN ('ai','rule','user')),
  PRIMARY KEY (article_id, tag_id)
);
CREATE INDEX idx_article_tags_tag ON article_tags(tag_id);

CREATE TABLE follows (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('tag','category','source')),
  target_id TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1 CHECK (weight BETWEEN 0 AND 1),
  created_at INTEGER NOT NULL,
  UNIQUE (target_kind, target_id)
);

CREATE TABLE saved_articles (
  article_id TEXT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  saved_at INTEGER NOT NULL,
  note TEXT
);

CREATE TABLE reading_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  opened_at INTEGER NOT NULL,
  dwell_seconds INTEGER NOT NULL DEFAULT 0,
  scroll_pct REAL NOT NULL DEFAULT 0
);
CREATE INDEX idx_history_article ON reading_history(article_id);

CREATE TABLE ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  UNIQUE (day, provider, model)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Tabela FTS independente (não "external content"): o pipeline escreve
-- nela explicitamente, o que evita gatilhos e mantém o controle no código.
CREATE VIRTUAL TABLE articles_fts USING fts5(
  article_id UNINDEXED,
  title,
  excerpt,
  content_text,
  tags_flat
);
`,
  },
]
```

- [ ] **Passo 7: Implementar `migrate.ts` e `index.ts`**

`packages/db/src/migrate.ts`:

```typescript
import type { SqlDriver } from './driver.js'
import { MIGRATIONS } from './schema.js'

/**
 * Aplica as migrações pendentes usando PRAGMA user_version como marcador.
 * Idempotente: chamar duas vezes não reaplica nada.
 */
export function migrate(db: SqlDriver): number {
  const atual = db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0
  let versao = atual

  for (const m of MIGRATIONS) {
    if (m.version <= atual) continue
    db.transaction(() => { db.exec(m.up) })
    // PRAGMA não aceita parâmetro vinculado; a versão vem de constante do código.
    db.exec(`PRAGMA user_version = ${m.version}`)
    versao = m.version
  }
  return versao
}
```

`packages/db/src/index.ts`:

```typescript
export type { SqlDriver, SqlParams, SqlValue } from './driver.js'
export { NodeSqliteDriver } from './drivers/node-sqlite.js'
export { MIGRATIONS, type Migration } from './schema.js'
export { migrate } from './migrate.js'
```

- [ ] **Passo 8: Rodar até passar**

```bash
npm test -w @devhub/db
```

Esperado: PASSA (11 testes).

- [ ] **Passo 9: Commit**

```bash
git add packages/db package.json package-lock.json
git commit -m "feat: esquema SQLite, migrações e driver node:sqlite

Usa o node:sqlite embutido no Node 24 — sem dependência nativa e sem
compilação. A interface SqlDriver é o ponto de troca para o driver
expo-sqlite do Android na Fase 3.

Restrições CHECK no banco espelham os tipos do core, para que dados
inválidos sejam rejeitados mesmo se alguém escrever SQL na mão.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarefa 12: Repositórios e busca FTS5

**Files:**
- Create: `packages/db/src/repos/{sources,articles,stories,tags,search}.ts`
- Create: `packages/db/src/repos/repos.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `SqlDriver` (T11), tipos de `@devhub/core` (T2)
- Produces:
  - `SourcesRepo`: `upsert(s: Source)`, `listActive(): Source[]`, `markFetched(id, at, etag, lastModified)`, `deactivate(id)`
  - `ArticlesRepo`: `upsert(a: Article)`, `existsByCanonicalUrl(url): boolean`, `byId(id)`, `pendingAi(limit): Article[]`, `setStory(articleId, storyId)`, `setAiState(id, state)`
  - `StoriesRepo`: `upsert(s: Story)`, `linkArticle(storyId, articleId, isPrimary)`, `topRanked(limit, category?): RankedStory[]`
  - `TagsRepo`: `ensure(slug, name, kind): string`, `attach(articleId, tagId, confidence, source)`, `tagsFor(articleId): string[]`
  - `SearchRepo`: `index(a: { id, title, excerpt, contentText, tags })`, `query(termo, limit): string[]`

- [ ] **Passo 1: Escrever o teste que falha**

`packages/db/src/repos/repos.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import type { Article, Source, Story } from '@devhub/core'
import { NodeSqliteDriver } from '../drivers/node-sqlite.js'
import { migrate } from '../migrate.js'
import { ArticlesRepo } from './articles.js'
import { SearchRepo } from './search.js'
import { SourcesRepo } from './sources.js'
import { StoriesRepo } from './stories.js'
import { TagsRepo } from './tags.js'

let db: NodeSqliteDriver
let sources: SourcesRepo
let articles: ArticlesRepo
let stories: StoriesRepo
let tags: TagsRepo
let search: SearchRepo

const FONTE: Source = {
  id: 's1', name: 'Exemplo', url: 'https://a.dev', feedUrl: 'https://a.dev/feed',
  kind: 'news', trustWeight: 0.8, categoryHint: null, active: true,
  lastFetchedAt: null, etag: null, lastModified: null,
}

function artigo(over: Partial<Article> = {}): Article {
  return {
    id: 'a1', sourceId: 's1', url: 'https://a.dev/p', canonicalUrl: 'https://a.dev/p',
    title: 'Rust 1.90 lançado', subtitle: null, author: 'Ana',
    publishedAt: 1000, fetchedAt: 2000, excerpt: 'resumo',
    contentText: 'borrow checker mais rápido', contentHtml: null, imageUrl: null,
    lang: 'en', simhash: '00ff00ff00ff00ff', wordCount: 4, readingMinutes: 1,
    storyId: null, contentType: 'announcement', aiState: 'pending',
    ...over,
  }
}

beforeEach(() => {
  db = new NodeSqliteDriver(':memory:')
  migrate(db)
  sources = new SourcesRepo(db)
  articles = new ArticlesRepo(db)
  stories = new StoriesRepo(db)
  tags = new TagsRepo(db)
  search = new SearchRepo(db)
  sources.upsert(FONTE)
})

describe('SourcesRepo', () => {
  it('insere e lista fontes ativas', () => {
    expect(sources.listActive().map((s) => s.id)).toEqual(['s1'])
  })

  it('upsert atualiza em vez de duplicar', () => {
    sources.upsert({ ...FONTE, name: 'Renomeada' })
    const lista = sources.listActive()
    expect(lista).toHaveLength(1)
    expect(lista[0]!.name).toBe('Renomeada')
  })

  it('markFetched grava etag e last-modified', () => {
    sources.markFetched('s1', 9999, 'W/"abc"', 'Mon, 08 Sep 2026 00:00:00 GMT')
    const s = sources.listActive()[0]!
    expect(s.lastFetchedAt).toBe(9999)
    expect(s.etag).toBe('W/"abc"')
  })

  it('deactivate tira a fonte da listagem ativa', () => {
    sources.deactivate('s1')
    expect(sources.listActive()).toEqual([])
  })

  it('converte active 0/1 do SQLite para boolean', () => {
    expect(typeof sources.listActive()[0]!.active).toBe('boolean')
  })
})

describe('ArticlesRepo', () => {
  it('insere e recupera por id', () => {
    articles.upsert(artigo())
    expect(articles.byId('a1')!.title).toBe('Rust 1.90 lançado')
  })

  it('upsert do mesmo artigo não duplica', () => {
    articles.upsert(artigo())
    articles.upsert(artigo({ title: 'Título corrigido' }))
    expect(articles.byId('a1')!.title).toBe('Título corrigido')
    expect(db.all('SELECT id FROM articles')).toHaveLength(1)
  })

  it('detecta URL canônica já ingerida', () => {
    expect(articles.existsByCanonicalUrl('https://a.dev/p')).toBe(false)
    articles.upsert(artigo())
    expect(articles.existsByCanonicalUrl('https://a.dev/p')).toBe(true)
  })

  it('pendingAi devolve só os pendentes, respeitando o limite', () => {
    articles.upsert(artigo({ id: 'a1', canonicalUrl: 'https://a.dev/1', aiState: 'pending' }))
    articles.upsert(artigo({ id: 'a2', canonicalUrl: 'https://a.dev/2', aiState: 'classified' }))
    articles.upsert(artigo({ id: 'a3', canonicalUrl: 'https://a.dev/3', aiState: 'pending' }))
    expect(articles.pendingAi(10).map((a) => a.id).sort()).toEqual(['a1', 'a3'])
    expect(articles.pendingAi(1)).toHaveLength(1)
  })

  it('setAiState atualiza o estado', () => {
    articles.upsert(artigo())
    articles.setAiState('a1', 'classified')
    expect(articles.byId('a1')!.aiState).toBe('classified')
  })

  it('byId devolve undefined para id inexistente', () => {
    expect(articles.byId('nao-existe')).toBeUndefined()
  })
})

describe('StoriesRepo', () => {
  const historia: Story = {
    id: 'st1', canonicalTitle: 'Rust 1.90', canonicalSummary: null,
    category: 'programming', importance: 0.9, isBreaking: false,
    firstSeenAt: 1000, lastUpdatedAt: 1000, articleCount: 1,
  }

  it('insere história e vincula artigo', () => {
    articles.upsert(artigo())
    stories.upsert(historia)
    stories.linkArticle('st1', 'a1', true)
    articles.setStory('a1', 'st1')
    expect(articles.byId('a1')!.storyId).toBe('st1')
  })

  it('topRanked ordena por score decrescente', () => {
    articles.upsert(artigo({ id: 'a1', canonicalUrl: 'https://a.dev/1' }))
    articles.upsert(artigo({ id: 'a2', canonicalUrl: 'https://a.dev/2' }))
    stories.upsert({ ...historia, id: 'st1', importance: 0.9, lastUpdatedAt: 5000 })
    stories.upsert({ ...historia, id: 'st2', importance: 0.2, lastUpdatedAt: 5000 })
    stories.linkArticle('st1', 'a1', true)
    stories.linkArticle('st2', 'a2', true)

    const top = stories.topRanked(10, null, 10_000)
    expect(top[0]!.story.importance).toBeGreaterThan(top[1]!.story.importance)
  })

  it('topRanked filtra por categoria', () => {
    articles.upsert(artigo())
    stories.upsert({ ...historia, category: 'programming' })
    stories.linkArticle('st1', 'a1', true)
    expect(stories.topRanked(10, 'technology', 10_000)).toEqual([])
    expect(stories.topRanked(10, 'programming', 10_000)).toHaveLength(1)
  })

  it('converte is_breaking 0/1 para boolean', () => {
    articles.upsert(artigo())
    stories.upsert({ ...historia, isBreaking: true })
    stories.linkArticle('st1', 'a1', true)
    expect(stories.topRanked(10, null, 10_000)[0]!.story.isBreaking).toBe(true)
  })
})

describe('TagsRepo', () => {
  it('ensure cria a tag uma vez e devolve o mesmo id', () => {
    const a = tags.ensure('rust', 'Rust', 'language')
    const b = tags.ensure('rust', 'Rust', 'language')
    expect(a).toBe(b)
    expect(db.all('SELECT id FROM tags')).toHaveLength(1)
  })

  it('attach vincula tag ao artigo e tagsFor devolve os slugs', () => {
    articles.upsert(artigo())
    const id = tags.ensure('rust', 'Rust', 'language')
    tags.attach('a1', id, 0.9, 'rule')
    expect(tags.tagsFor('a1')).toEqual(['rust'])
  })

  it('attach duas vezes não duplica o vínculo', () => {
    articles.upsert(artigo())
    const id = tags.ensure('rust', 'Rust', 'language')
    tags.attach('a1', id, 0.9, 'rule')
    tags.attach('a1', id, 0.5, 'rule')
    expect(tags.tagsFor('a1')).toEqual(['rust'])
  })
})

describe('SearchRepo', () => {
  beforeEach(() => {
    articles.upsert(artigo())
    search.index({
      id: 'a1', title: 'Rust 1.90 lançado',
      excerpt: 'melhorias no compilador',
      contentText: 'o borrow checker ficou mais rápido',
      tags: ['rust', 'programming'],
    })
  })

  it('encontra por termo do corpo', () => {
    expect(search.query('borrow', 10)).toEqual(['a1'])
  })

  it('encontra por tag', () => {
    expect(search.query('rust', 10)).toEqual(['a1'])
  })

  it('não encontra termo ausente', () => {
    expect(search.query('kubernetes', 10)).toEqual([])
  })

  it('reindexar não duplica o resultado', () => {
    search.index({
      id: 'a1', title: 'Rust 1.90 lançado', excerpt: 'outro',
      contentText: 'o borrow checker ficou mais rápido', tags: ['rust'],
    })
    expect(search.query('borrow', 10)).toEqual(['a1'])
  })

  it('consulta vazia devolve lista vazia sem lançar', () => {
    expect(search.query('   ', 10)).toEqual([])
  })

  it('não lança com sintaxe FTS inválida do usuário', () => {
    expect(() => search.query('"aspas sem fechar AND (', 10)).not.toThrow()
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -w @devhub/db -- repos
```

Esperado: FALHA — módulos inexistentes.

- [ ] **Passo 3: Implementar `sources.ts`**

```typescript
import type { Source } from '@devhub/core'
import type { SqlDriver } from '../driver.js'

interface LinhaSource {
  id: string; name: string; url: string; feed_url: string; kind: string
  trust_weight: number; category_hint: string | null; active: number
  last_fetched_at: number | null; etag: string | null; last_modified: string | null
}

function paraSource(r: LinhaSource): Source {
  return {
    id: r.id, name: r.name, url: r.url, feedUrl: r.feed_url,
    kind: r.kind as Source['kind'], trustWeight: r.trust_weight,
    categoryHint: r.category_hint as Source['categoryHint'],
    active: r.active === 1,                    // SQLite não tem boolean
    lastFetchedAt: r.last_fetched_at, etag: r.etag, lastModified: r.last_modified,
  }
}

export class SourcesRepo {
  constructor(private readonly db: SqlDriver) {}

  upsert(s: Source): void {
    this.db.run(
      `INSERT INTO sources
         (id,name,url,feed_url,kind,trust_weight,category_hint,active,last_fetched_at,etag,last_modified)
       VALUES (:id,:name,:url,:feed,:kind,:trust,:hint,:active,:fetched,:etag,:lm)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, url=excluded.url, feed_url=excluded.feed_url,
         kind=excluded.kind, trust_weight=excluded.trust_weight,
         category_hint=excluded.category_hint, active=excluded.active`,
      {
        id: s.id, name: s.name, url: s.url, feed: s.feedUrl, kind: s.kind,
        trust: s.trustWeight, hint: s.categoryHint, active: s.active ? 1 : 0,
        fetched: s.lastFetchedAt, etag: s.etag, lm: s.lastModified,
      },
    )
  }

  listActive(): Source[] {
    return this.db
      .all<LinhaSource>('SELECT * FROM sources WHERE active = 1 ORDER BY id')
      .map(paraSource)
  }

  markFetched(id: string, at: number, etag: string | null, lastModified: string | null): void {
    this.db.run(
      'UPDATE sources SET last_fetched_at=:at, etag=:etag, last_modified=:lm WHERE id=:id',
      { at, etag, lm: lastModified, id },
    )
  }

  deactivate(id: string): void {
    this.db.run('UPDATE sources SET active = 0 WHERE id = ?', [id])
  }
}
```

- [ ] **Passo 4: Implementar `articles.ts`**

```typescript
import type { Article } from '@devhub/core'
import type { SqlDriver } from '../driver.js'

interface LinhaArticle {
  id: string; source_id: string; url: string; canonical_url: string
  title: string; subtitle: string | null; author: string | null
  published_at: number; fetched_at: number; excerpt: string
  content_text: string; content_html: string | null; image_url: string | null
  lang: string; simhash: string; word_count: number; reading_minutes: number
  story_id: string | null; content_type: string; ai_state: string
}

export function paraArticle(r: LinhaArticle): Article {
  return {
    id: r.id, sourceId: r.source_id, url: r.url, canonicalUrl: r.canonical_url,
    title: r.title, subtitle: r.subtitle, author: r.author,
    publishedAt: r.published_at, fetchedAt: r.fetched_at, excerpt: r.excerpt,
    contentText: r.content_text, contentHtml: r.content_html, imageUrl: r.image_url,
    lang: r.lang, simhash: r.simhash, wordCount: r.word_count,
    readingMinutes: r.reading_minutes, storyId: r.story_id,
    contentType: r.content_type as Article['contentType'],
    aiState: r.ai_state as Article['aiState'],
  }
}

export class ArticlesRepo {
  constructor(private readonly db: SqlDriver) {}

  upsert(a: Article): void {
    this.db.run(
      `INSERT INTO articles
         (id,source_id,url,canonical_url,title,subtitle,author,published_at,fetched_at,
          excerpt,content_text,content_html,image_url,lang,simhash,word_count,
          reading_minutes,story_id,content_type,ai_state)
       VALUES (:id,:src,:url,:canon,:title,:sub,:author,:pub,:fetch,
               :excerpt,:text,:html,:img,:lang,:hash,:wc,:rm,:story,:ctype,:ai)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title, subtitle=excluded.subtitle, author=excluded.author,
         excerpt=excluded.excerpt, content_text=excluded.content_text,
         content_html=excluded.content_html, image_url=excluded.image_url,
         content_type=excluded.content_type, ai_state=excluded.ai_state`,
      {
        id: a.id, src: a.sourceId, url: a.url, canon: a.canonicalUrl,
        title: a.title, sub: a.subtitle, author: a.author,
        pub: a.publishedAt, fetch: a.fetchedAt, excerpt: a.excerpt,
        text: a.contentText, html: a.contentHtml, img: a.imageUrl,
        lang: a.lang, hash: a.simhash, wc: a.wordCount, rm: a.readingMinutes,
        story: a.storyId, ctype: a.contentType, ai: a.aiState,
      },
    )
  }

  existsByCanonicalUrl(url: string): boolean {
    return this.db.get('SELECT 1 AS x FROM articles WHERE canonical_url = ?', [url]) !== undefined
  }

  byId(id: string): Article | undefined {
    const r = this.db.get<LinhaArticle>('SELECT * FROM articles WHERE id = ?', [id])
    return r ? paraArticle(r) : undefined
  }

  pendingAi(limit: number): Article[] {
    return this.db
      .all<LinhaArticle>(
        "SELECT * FROM articles WHERE ai_state = 'pending' ORDER BY published_at DESC LIMIT ?",
        [limit],
      )
      .map(paraArticle)
  }

  setStory(articleId: string, storyId: string): void {
    this.db.run('UPDATE articles SET story_id = ? WHERE id = ?', [storyId, articleId])
  }

  setAiState(id: string, state: Article['aiState']): void {
    this.db.run('UPDATE articles SET ai_state = ? WHERE id = ?', [state, id])
  }
}
```

- [ ] **Passo 5: Implementar `stories.ts`**

```typescript
import type { Category, Story } from '@devhub/core'
import { MEIA_VIDA_HORAS, scoreStory, type ScoreBreakdown } from '@devhub/core'
import type { SqlDriver } from '../driver.js'

export interface RankedStory {
  story: Story
  primaryArticleId: string
  breakdown: ScoreBreakdown
}

interface LinhaStory {
  id: string; canonical_title: string; canonical_summary: string | null
  category: string; importance: number; is_breaking: number
  first_seen_at: number; last_updated_at: number; article_count: number
  primary_article_id: string | null; trust_weight: number | null
  published_at: number | null
}

export class StoriesRepo {
  constructor(private readonly db: SqlDriver) {}

  upsert(s: Story): void {
    this.db.run(
      `INSERT INTO stories
         (id,canonical_title,canonical_summary,category,importance,is_breaking,
          first_seen_at,last_updated_at,article_count)
       VALUES (:id,:title,:summary,:cat,:imp,:brk,:first,:last,:count)
       ON CONFLICT(id) DO UPDATE SET
         canonical_title=excluded.canonical_title,
         canonical_summary=excluded.canonical_summary,
         category=excluded.category, importance=excluded.importance,
         is_breaking=excluded.is_breaking, last_updated_at=excluded.last_updated_at,
         article_count=excluded.article_count`,
      {
        id: s.id, title: s.canonicalTitle, summary: s.canonicalSummary,
        cat: s.category, imp: s.importance, brk: s.isBreaking ? 1 : 0,
        first: s.firstSeenAt, last: s.lastUpdatedAt, count: s.articleCount,
      },
    )
  }

  linkArticle(storyId: string, articleId: string, isPrimary: boolean): void {
    this.db.run(
      `INSERT INTO story_articles (story_id, article_id, is_primary)
       VALUES (?,?,?)
       ON CONFLICT(story_id, article_id) DO UPDATE SET is_primary = excluded.is_primary`,
      [storyId, articleId, isPrimary ? 1 : 0],
    )
  }

  /**
   * O SQL só traz os fatores; o score é calculado em TypeScript pela mesma
   * função que a UI usa. Isso garante que o número exibido no painel
   * "por que estou vendo isto" é exatamente o que ordenou a lista.
   */
  topRanked(limit: number, category: Category | null, now: number): RankedStory[] {
    const linhas = this.db.all<LinhaStory>(
      `SELECT st.*,
              sa.article_id AS primary_article_id,
              src.trust_weight,
              a.published_at
         FROM stories st
         LEFT JOIN story_articles sa ON sa.story_id = st.id AND sa.is_primary = 1
         LEFT JOIN articles a ON a.id = sa.article_id
         LEFT JOIN sources src ON src.id = a.source_id
        WHERE (:cat IS NULL OR st.category = :cat)
        ORDER BY st.last_updated_at DESC
        LIMIT :lim`,
      { cat: category, lim: limit * 4 },   // folga: reordenamos em memória
    )

    return linhas
      .filter((r) => r.primary_article_id !== null)
      .map((r) => {
        const story: Story = {
          id: r.id, canonicalTitle: r.canonical_title,
          canonicalSummary: r.canonical_summary,
          category: r.category as Category, importance: r.importance,
          isBreaking: r.is_breaking === 1,
          firstSeenAt: r.first_seen_at, lastUpdatedAt: r.last_updated_at,
          articleCount: r.article_count,
        }
        return {
          story,
          primaryArticleId: r.primary_article_id!,
          breakdown: scoreStory({
            publishedAt: r.published_at ?? r.first_seen_at,
            now,
            category: story.category,
            trustWeight: r.trust_weight ?? 0.5,
            importance: story.importance,
            followMatches: [],           // Fase 4 preenche isto
            articleCount: story.articleCount,
          }),
        }
      })
      .sort((a, b) => b.breakdown.total - a.breakdown.total)
      .slice(0, limit)
  }
}

export { MEIA_VIDA_HORAS }
```

- [ ] **Passo 6: Implementar `tags.ts` e `search.ts`**

`packages/db/src/repos/tags.ts`:

```typescript
import type { ArticleTag, TagKind } from '@devhub/core'
import type { SqlDriver } from '../driver.js'

export class TagsRepo {
  constructor(private readonly db: SqlDriver) {}

  /** O slug é o id: estável, legível e naturalmente único. */
  ensure(slug: string, name: string, kind: TagKind): string {
    this.db.run(
      `INSERT INTO tags (id, kind, name, slug) VALUES (?,?,?,?)
       ON CONFLICT(slug) DO NOTHING`,
      [slug, kind, name, slug],
    )
    return slug
  }

  attach(
    articleId: string,
    tagId: string,
    confidence: number,
    source: ArticleTag['source'],
  ): void {
    this.db.run(
      `INSERT INTO article_tags (article_id, tag_id, confidence, source)
       VALUES (?,?,?,?)
       ON CONFLICT(article_id, tag_id) DO UPDATE SET
         confidence = MAX(article_tags.confidence, excluded.confidence),
         source = excluded.source`,
      [articleId, tagId, confidence, source],
    )
  }

  tagsFor(articleId: string): string[] {
    return this.db
      .all<{ slug: string }>(
        `SELECT t.slug FROM article_tags at
           JOIN tags t ON t.id = at.tag_id
          WHERE at.article_id = ?
          ORDER BY at.confidence DESC, t.slug`,
        [articleId],
      )
      .map((r) => r.slug)
  }
}
```

`packages/db/src/repos/search.ts`:

```typescript
import type { SqlDriver } from '../driver.js'

export interface IndexInput {
  id: string
  title: string
  excerpt: string
  contentText: string
  tags: string[]
}

/**
 * Escapa a consulta do usuário como uma sequência de termos literais.
 * Sem isso, um `"` solto ou um `(` derrubariam a busca com erro de
 * sintaxe do FTS5 — que é entrada de usuário, não bug do sistema.
 */
function comoTermosLiterais(q: string): string {
  const termos = q
    .split(/\s+/)
    .map((t) => t.replace(/"/g, ''))
    .filter((t) => t.length > 0)
  if (termos.length === 0) return ''
  return termos.map((t) => `"${t}"`).join(' ')
}

export class SearchRepo {
  constructor(private readonly db: SqlDriver) {}

  index(a: IndexInput): void {
    this.db.run('DELETE FROM articles_fts WHERE article_id = ?', [a.id])
    this.db.run(
      `INSERT INTO articles_fts (article_id, title, excerpt, content_text, tags_flat)
       VALUES (?,?,?,?,?)`,
      [a.id, a.title, a.excerpt, a.contentText, a.tags.join(' ')],
    )
  }

  /** Devolve ids ordenados por relevância BM25 (rank mais negativo primeiro). */
  query(termo: string, limit: number): string[] {
    const expr = comoTermosLiterais(termo)
    if (!expr) return []
    try {
      return this.db
        .all<{ article_id: string }>(
          `SELECT article_id FROM articles_fts
            WHERE articles_fts MATCH ?
            ORDER BY rank
            LIMIT ?`,
          [expr, limit],
        )
        .map((r) => r.article_id)
    } catch {
      return []
    }
  }
}
```

- [ ] **Passo 7: Exportar tudo e rodar até passar**

`packages/db/src/index.ts` — acrescentar ao final:

```typescript
export { SourcesRepo } from './repos/sources.js'
export { ArticlesRepo } from './repos/articles.js'
export { StoriesRepo, type RankedStory } from './repos/stories.js'
export { TagsRepo } from './repos/tags.js'
export { SearchRepo, type IndexInput } from './repos/search.js'
```

Também é preciso exportar o ranking do core. Em `packages/core/src/index.ts`, acrescentar:

```typescript
export * from './rank/freshness.js'
export * from './rank/score.js'
export * from './rank/breaking.js'
export * from './ai/provider.js'
export { HeuristicProvider } from './ai/heuristic.js'
export * from './feeds/index.js'
export * from './normalize/article.js'
export * from './normalize/html.js'
export * from './normalize/dates.js'
export * from './normalize/urls.js'
export * from './dedup/simhash.js'
export * from './dedup/jaccard.js'
export * from './dedup/cluster.js'
export * from './filter/prefilter.js'
export * from './taxonomy/dictionary.js'
export * from './taxonomy/classify.js'
```

```bash
npm test -w @devhub/db
```

Esperado: PASSA (32 testes).

- [ ] **Passo 8: Commit**

```bash
git add packages/db/src packages/core/src/index.ts
git commit -m "feat: repositórios de fontes, artigos, histórias, tags e busca

O score não é calculado em SQL: topRanked traz os fatores e chama a
mesma scoreStory que a UI usa, garantindo que o número mostrado no
painel 'por que estou vendo isto' é o mesmo que ordenou a lista.

A busca escapa a consulta como termos literais — aspas ou parênteses
soltos digitados pelo usuário não derrubam o FTS5 com erro de sintaxe.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarefa 13: Registro de fontes

**Files:**
- Create: `packages/core/src/sources/registry.ts`
- Create: `packages/core/src/sources/registry.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `Source` (T2)
- Produces: `SOURCES: Source[]` — no mínimo 30 fontes verificadas

> **Nota para quem implementar:** as URLs abaixo são um ponto de partida. Feeds
> mudam de endereço e saem do ar. O Passo 4 desta tarefa **verifica cada uma
> contra a rede de verdade** e o critério de aceitação é *30 ou mais fontes
> respondendo*, não *as 36 listadas*. Substitua ou remova o que estiver morto e
> registre a troca na mensagem de commit.

- [ ] **Passo 1: Escrever o teste que falha**

`packages/core/src/sources/registry.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { SOURCES } from './registry.js'

describe('SOURCES', () => {
  it('tem no mínimo 30 fontes, como exige a Fase 1', () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(30)
  })

  it('não tem ids duplicados', () => {
    const ids = SOURCES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('não tem feedUrl duplicada', () => {
    const urls = SOURCES.map((s) => s.feedUrl)
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('toda feedUrl é https', () => {
    for (const s of SOURCES) {
      expect(s.feedUrl.startsWith('https://'), `${s.id}: ${s.feedUrl}`).toBe(true)
    }
  })

  it('os pesos de confiança seguem a escala do spec §4.1', () => {
    const esperado: Record<string, number> = {
      official: 1.0, research: 0.9, news: 0.75, blog: 0.6, aggregator: 0.5,
    }
    for (const s of SOURCES) {
      expect(s.trustWeight, `${s.id}`).toBe(esperado[s.kind])
    }
  })

  it('cobre os cinco tipos de fonte', () => {
    const kinds = new Set(SOURCES.map((s) => s.kind))
    expect(kinds).toEqual(
      new Set(['official', 'news', 'blog', 'aggregator', 'research']),
    )
  })

  it('cobre as três categorias nos hints', () => {
    const hints = new Set(SOURCES.map((s) => s.categoryHint).filter(Boolean))
    expect(hints).toEqual(new Set(['technology', 'programming', 'innovation']))
  })

  it('toda fonte começa ativa e sem estado de fetch', () => {
    for (const s of SOURCES) {
      expect(s.active).toBe(true)
      expect(s.lastFetchedAt).toBeNull()
      expect(s.etag).toBeNull()
    }
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -w @devhub/core -- registry
```

Esperado: FALHA — módulo inexistente.

- [ ] **Passo 3: Implementar `registry.ts`**

```typescript
import type { Category, Source, SourceKind } from '../types.js'

/** Spec §4.1: o peso é função do tipo, não escolhido caso a caso. */
const PESO: Record<SourceKind, number> = {
  official: 1.0,
  research: 0.9,
  news: 0.75,
  blog: 0.6,
  aggregator: 0.5,
}

function fonte(
  id: string,
  name: string,
  url: string,
  feedUrl: string,
  kind: SourceKind,
  categoryHint: Category | null,
): Source {
  return {
    id, name, url, feedUrl, kind,
    trustWeight: PESO[kind],
    categoryHint,
    active: true,
    lastFetchedAt: null,
    etag: null,
    lastModified: null,
  }
}

export const SOURCES: Source[] = [
  // ---- Oficiais: linguagens e runtimes ----
  fonte('rust-blog', 'Rust Blog', 'https://blog.rust-lang.org', 'https://blog.rust-lang.org/feed.xml', 'official', 'programming'),
  fonte('go-blog', 'The Go Blog', 'https://go.dev/blog', 'https://go.dev/blog/feed.atom', 'official', 'programming'),
  fonte('python-insider', 'Python Insider', 'https://blog.python.org', 'https://blog.python.org/feeds/posts/default', 'official', 'programming'),
  fonte('nodejs-blog', 'Node.js Blog', 'https://nodejs.org/en/blog', 'https://nodejs.org/en/feed/blog.xml', 'official', 'programming'),
  fonte('deno-blog', 'Deno Blog', 'https://deno.com/blog', 'https://deno.com/feed', 'official', 'programming'),
  fonte('react-blog', 'React Blog', 'https://react.dev/blog', 'https://react.dev/rss.xml', 'official', 'programming'),
  fonte('kubernetes-blog', 'Kubernetes Blog', 'https://kubernetes.io/blog', 'https://kubernetes.io/feed.xml', 'official', 'programming'),
  fonte('docker-blog', 'Docker Blog', 'https://www.docker.com/blog', 'https://www.docker.com/blog/feed/', 'official', 'programming'),
  fonte('gitlab-blog', 'GitLab Blog', 'https://about.gitlab.com/blog', 'https://about.gitlab.com/atom.xml', 'official', 'programming'),
  fonte('github-blog', 'GitHub Blog', 'https://github.blog', 'https://github.blog/feed/', 'official', 'programming'),

  // ---- Oficiais: plataformas e nuvem ----
  fonte('ms-devblogs', 'Microsoft DevBlogs', 'https://devblogs.microsoft.com', 'https://devblogs.microsoft.com/feed/', 'official', 'programming'),
  fonte('android-devs', 'Android Developers Blog', 'https://android-developers.googleblog.com', 'https://android-developers.googleblog.com/feeds/posts/default', 'official', 'technology'),
  fonte('apple-news', 'Apple Developer News', 'https://developer.apple.com/news/', 'https://developer.apple.com/news/rss/news.rss', 'official', 'technology'),
  fonte('aws-blog', 'AWS News Blog', 'https://aws.amazon.com/blogs/aws/', 'https://aws.amazon.com/blogs/aws/feed/', 'official', 'technology'),
  fonte('chromium-blog', 'Chromium Blog', 'https://blog.chromium.org', 'https://blog.chromium.org/feeds/posts/default', 'official', 'technology'),
  fonte('mozilla-hacks', 'Mozilla Hacks', 'https://hacks.mozilla.org', 'https://hacks.mozilla.org/feed/', 'official', 'programming'),
  fonte('cloudflare-blog', 'Cloudflare Blog', 'https://blog.cloudflare.com', 'https://blog.cloudflare.com/rss/', 'official', 'technology'),

  // ---- Blogs de engenharia ----
  fonte('netflix-tech', 'Netflix TechBlog', 'https://netflixtechblog.com', 'https://netflixtechblog.com/feed', 'blog', 'programming'),
  fonte('meta-eng', 'Engineering at Meta', 'https://engineering.fb.com', 'https://engineering.fb.com/feed/', 'blog', 'programming'),
  fonte('stackoverflow-blog', 'Stack Overflow Blog', 'https://stackoverflow.blog', 'https://stackoverflow.blog/feed/', 'blog', 'programming'),
  fonte('martinfowler', 'Martin Fowler', 'https://martinfowler.com', 'https://martinfowler.com/feed.atom', 'blog', 'programming'),

  // ---- Notícias de tecnologia ----
  fonte('arstechnica', 'Ars Technica', 'https://arstechnica.com', 'https://arstechnica.com/feed/', 'news', 'technology'),
  fonte('theverge', 'The Verge', 'https://www.theverge.com', 'https://www.theverge.com/rss/index.xml', 'news', 'technology'),
  fonte('techcrunch', 'TechCrunch', 'https://techcrunch.com', 'https://techcrunch.com/feed/', 'news', 'technology'),
  fonte('ieee-spectrum', 'IEEE Spectrum', 'https://spectrum.ieee.org', 'https://spectrum.ieee.org/rss', 'news', 'innovation'),
  fonte('phoronix', 'Phoronix', 'https://www.phoronix.com', 'https://www.phoronix.com/rss.php', 'news', 'technology'),
  fonte('tomshardware', "Tom's Hardware", 'https://www.tomshardware.com', 'https://www.tomshardware.com/feeds/all', 'news', 'technology'),
  fonte('theregister', 'The Register', 'https://www.theregister.com', 'https://www.theregister.com/headlines.atom', 'news', 'technology'),
  fonte('bleepingcomputer', 'BleepingComputer', 'https://www.bleepingcomputer.com', 'https://www.bleepingcomputer.com/feed/', 'news', 'technology'),
  fonte('krebs', 'Krebs on Security', 'https://krebsonsecurity.com', 'https://krebsonsecurity.com/feed/', 'news', 'technology'),
  fonte('hackernews-sec', 'The Hacker News', 'https://thehackernews.com', 'https://feeds.feedburner.com/TheHackersNews', 'news', 'technology'),

  // ---- Agregadores ----
  fonte('hn-frontpage', 'Hacker News', 'https://news.ycombinator.com', 'https://hnrss.org/frontpage', 'aggregator', null),
  fonte('lobsters', 'Lobsters', 'https://lobste.rs', 'https://lobste.rs/rss', 'aggregator', 'programming'),
  fonte('devto', 'DEV Community', 'https://dev.to', 'https://dev.to/feed', 'aggregator', 'programming'),

  // ---- Pesquisa ----
  fonte('arxiv-ai', 'arXiv cs.AI', 'https://arxiv.org/list/cs.AI/recent', 'https://rss.arxiv.org/rss/cs.AI', 'research', 'innovation'),
  fonte('arxiv-lg', 'arXiv cs.LG', 'https://arxiv.org/list/cs.LG/recent', 'https://rss.arxiv.org/rss/cs.LG', 'research', 'innovation'),
  fonte('arxiv-se', 'arXiv cs.SE', 'https://arxiv.org/list/cs.SE/recent', 'https://rss.arxiv.org/rss/cs.SE', 'research', 'programming'),
]
```

- [ ] **Passo 4: Verificar as fontes contra a rede de verdade**

Este passo é obrigatório — a lista acima é um ponto de partida, não uma
garantia. Salve como `tools/verify-sources.mjs` e rode:

```javascript
import { SOURCES } from '../packages/core/src/sources/registry.ts'

const resultados = await Promise.all(SOURCES.map(async (s) => {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 15000)
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
  } finally { clearTimeout(t) }
}))

const vivas = resultados.filter((r) => r.ok)
const mortas = resultados.filter((r) => !r.ok)

console.table(resultados.map(({ id, status, bytes, ok }) => ({ id, status, bytes, ok })))
console.log(`\nVIVAS: ${vivas.length} / ${resultados.length}`)
if (mortas.length) {
  console.log('\nMORTAS (corrigir ou remover do registry):')
  for (const m of mortas) console.log(`  ${m.id.padEnd(22)} ${m.status || m.erro}  ${m.url}`)
}
process.exit(vivas.length >= 30 ? 0 : 1)
```

```bash
npx tsx tools/verify-sources.mjs
```

Esperado: **30 ou mais fontes vivas**. Para cada morta: encontre a URL nova do
feed (geralmente no `<link rel="alternate" type="application/rss+xml">` da
página inicial do site) e corrija; se o site não tiver mais feed, remova a
entrada e acrescente outra da mesma categoria para manter o mínimo de 30.

- [ ] **Passo 5: Exportar e rodar até passar**

Em `packages/core/src/index.ts`, acrescentar:

```typescript
export { SOURCES } from './sources/registry.js'
```

```bash
npm test -w @devhub/core -- registry
```

Esperado: PASSA (8 testes).

- [ ] **Passo 6: Commit**

```bash
git add packages/core/src/sources packages/core/src/index.ts tools/verify-sources.mjs
git commit -m "feat: registro de fontes de notícias verificadas

O peso de confiança é função do tipo da fonte, não escolhido caso a
caso — isso mantém a escala do spec §4.1 consistente conforme o
registro cresce.

Inclui verify-sources.mjs, que checa cada feed contra a rede e falha
se menos de 30 responderem. Registre aqui qualquer feed substituído.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tarefa 14: Pipeline de ingestão e CLI

**Files:**
- Create: `packages/core/src/ingest/pipeline.ts`
- Create: `packages/core/src/ingest/pipeline.test.ts`
- Create: `tools/cli/package.json`, `tools/cli/tsconfig.json`
- Create: `tools/cli/src/platform-node.ts`, `tools/cli/src/index.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: tudo das Tarefas 2 a 13
- Produces:
  - `interface IngestDeps { platform: Platform; sources: SourcesRepo; articles: ArticlesRepo; stories: StoriesRepo; tags: TagsRepo; search: SearchRepo; ai: AIProvider }`
  - `interface IngestReport { fontesLidas, fontesComErro, itensVistos, itensNovos, itensFiltrados, historiasCriadas }`
  - `runIngest(deps: IngestDeps): Promise<IngestReport>`

- [ ] **Passo 1: Escrever o teste que falha**

`packages/core/src/ingest/pipeline.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { NodeSqliteDriver, ArticlesRepo, SearchRepo, SourcesRepo, StoriesRepo, TagsRepo, migrate } from '@devhub/db'
import { HeuristicProvider } from '../ai/heuristic.js'
import { fakeClock, fakeHttp, silentLogger, fakeSecrets } from '../testing/fakes.js'
import type { Source } from '../types.js'
import { runIngest, type IngestDeps } from './pipeline.js'

const AGORA = 1_760_000_000_000

function feedRss(itens: Array<{ t: string; u: string; d: string }>): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>F</title>${
    itens.map((i) =>
      `<item><title>${i.t}</title><link>${i.u}</link>` +
      `<pubDate>Mon, 08 Sep 2026 12:00:00 GMT</pubDate>` +
      `<description>${i.d}</description></item>`).join('')
  }</channel></rss>`
}

function fonte(id: string, feedUrl: string): Source {
  return {
    id, name: id, url: 'https://x.dev', feedUrl, kind: 'official',
    trustWeight: 1.0, categoryHint: null, active: true,
    lastFetchedAt: null, etag: null, lastModified: null,
  }
}

function montar(rotas: Record<string, { body: string; status?: number }>, fontes: Source[]) {
  const db = new NodeSqliteDriver(':memory:')
  migrate(db)
  const sources = new SourcesRepo(db)
  for (const f of fontes) sources.upsert(f)

  const deps: IngestDeps = {
    platform: {
      http: fakeHttp(rotas), clock: fakeClock(AGORA),
      logger: silentLogger, secrets: fakeSecrets(),
    },
    sources,
    articles: new ArticlesRepo(db),
    stories: new StoriesRepo(db),
    tags: new TagsRepo(db),
    search: new SearchRepo(db),
    ai: new HeuristicProvider(),
  }
  return { db, deps }
}

describe('runIngest', () => {
  it('ingere artigos de um feed e os persiste', async () => {
    const { db, deps } = montar(
      { 'https://f/1': { body: feedRss([
        { t: 'Rust 1.90 released with borrow checker fixes', u: 'https://x.dev/rust', d: 'compiler and cargo improvements' },
      ]) } },
      [fonte('s1', 'https://f/1')],
    )

    const r = await runIngest(deps)
    expect(r.itensNovos).toBe(1)
    expect(db.all('SELECT id FROM articles')).toHaveLength(1)
    db.close()
  })

  it('filtra artigos fora de escopo antes de gastar IA', async () => {
    const { db, deps } = montar(
      { 'https://f/1': { body: feedRss([
        { t: 'Receita de bolo de cenoura', u: 'https://x.dev/bolo', d: 'bata os ovos com acucar e farinha' },
      ]) } },
      [fonte('s1', 'https://f/1')],
    )

    const r = await runIngest(deps)
    expect(r.itensFiltrados).toBe(1)
    expect(r.itensNovos).toBe(0)
    db.close()
  })

  it('não reingere o mesmo artigo na segunda rodada', async () => {
    const body = feedRss([
      { t: 'Kubernetes 1.35 released with scheduler changes', u: 'https://x.dev/k8s', d: 'container orchestration' },
    ])
    const { db, deps } = montar({ 'https://f/1': { body } }, [fonte('s1', 'https://f/1')])

    await runIngest(deps)
    const segunda = await runIngest(deps)
    expect(segunda.itensNovos).toBe(0)
    expect(db.all('SELECT id FROM articles')).toHaveLength(1)
    db.close()
  })

  it('agrupa artigos duplicados de fontes diferentes numa história só', async () => {
    const titulo = 'NVIDIA announces new GPU architecture for data centers'
    const { db, deps } = montar(
      {
        'https://f/1': { body: feedRss([{ t: titulo, u: 'https://a.dev/gpu', d: 'gpu memory bandwidth cuda' }]) },
        'https://f/2': { body: feedRss([{ t: titulo, u: 'https://b.dev/gpu', d: 'gpu memory bandwidth cuda' }]) },
      },
      [fonte('s1', 'https://f/1'), fonte('s2', 'https://f/2')],
    )

    const r = await runIngest(deps)
    expect(r.itensNovos).toBe(2)
    expect(r.historiasCriadas).toBe(1)
    expect(db.all('SELECT id FROM stories')).toHaveLength(1)
    db.close()
  })

  it('uma fonte quebrada não impede as outras de serem ingeridas', async () => {
    const { db, deps } = montar(
      {
        'https://f/1': { body: '<<< xml quebrado' },
        'https://f/2': { body: feedRss([
          { t: 'Go 1.26 released with faster garbage collector', u: 'https://b.dev/go', d: 'golang runtime compiler' },
        ]) },
      },
      [fonte('s1', 'https://f/1'), fonte('s2', 'https://f/2')],
    )

    const r = await runIngest(deps)
    expect(r.itensNovos).toBe(1)
    db.close()
  })

  it('erro de rede numa fonte é contado, não propagado', async () => {
    const { db, deps } = montar(
      { 'https://f/2': { body: feedRss([
        { t: 'Python 3.15 released with free-threading', u: 'https://b.dev/py', d: 'cpython interpreter gil' },
      ]) } },
      [fonte('s1', 'https://f/INEXISTENTE'), fonte('s2', 'https://f/2')],
    )

    const r = await runIngest(deps)
    expect(r.fontesComErro).toBe(1)
    expect(r.itensNovos).toBe(1)
    db.close()
  })

  it('respeita 304 Not Modified sem criar artigos', async () => {
    const { db, deps } = montar(
      { 'https://f/1': { body: '', status: 304 } },
      [fonte('s1', 'https://f/1')],
    )

    const r = await runIngest(deps)
    expect(r.itensNovos).toBe(0)
    expect(r.fontesComErro).toBe(0)
    db.close()
  })

  it('indexa o artigo na busca FTS', async () => {
    const { db, deps } = montar(
      { 'https://f/1': { body: feedRss([
        { t: 'Rust 1.90 released with borrow checker fixes', u: 'https://x.dev/rust', d: 'compiler improvements' },
      ]) } },
      [fonte('s1', 'https://f/1')],
    )

    await runIngest(deps)
    const search = new SearchRepo(db)
    expect(search.query('borrow', 10)).toHaveLength(1)
    db.close()
  })

  it('grava as tags derivadas da taxonomia', async () => {
    const { db, deps } = montar(
      { 'https://f/1': { body: feedRss([
        { t: 'Rust 1.90 released with borrow checker fixes', u: 'https://x.dev/rust', d: 'compiler and cargo' },
      ]) } },
      [fonte('s1', 'https://f/1')],
    )

    await runIngest(deps)
    const slugs = db.all<{ slug: string }>('SELECT slug FROM tags').map((r) => r.slug)
    expect(slugs).toContain('rust')
    db.close()
  })

  it('marca o artigo como classificado após o passe heurístico', async () => {
    const { db, deps } = montar(
      { 'https://f/1': { body: feedRss([
        { t: 'Docker improves layer build cache performance', u: 'https://x.dev/d', d: 'container image build' },
      ]) } },
      [fonte('s1', 'https://f/1')],
    )

    await runIngest(deps)
    const estados = db.all<{ ai_state: string }>('SELECT ai_state FROM articles')
    expect(estados[0]!.ai_state).toBe('classified')
    db.close()
  })

  it('sem fontes ativas devolve relatório zerado sem lançar', async () => {
    const { db, deps } = montar({}, [])
    const r = await runIngest(deps)
    expect(r).toEqual({
      fontesLidas: 0, fontesComErro: 0, itensVistos: 0,
      itensNovos: 0, itensFiltrados: 0, historiasCriadas: 0,
    })
    db.close()
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -w @devhub/core -- pipeline
```

Esperado: FALHA — módulo inexistente.

- [ ] **Passo 3: Implementar `pipeline.ts`**

```typescript
import type {
  ArticlesRepo, SearchRepo, SourcesRepo, StoriesRepo, TagsRepo,
} from '@devhub/db'
import type { AIProvider, ArticleForAI } from '../ai/provider.js'
import { clusterArticles, type ClusterInput } from '../dedup/cluster.js'
import { simhash } from '../dedup/simhash.js'
import { parseFeed } from '../feeds/index.js'
import { isRelevant } from '../filter/prefilter.js'
import { normalizeItem } from '../normalize/article.js'
import type { Platform } from '../platform.js'
import { isBreaking } from '../rank/breaking.js'
import { TAG_DICTIONARY } from '../taxonomy/dictionary.js'
import type { Article, Story } from '../types.js'

export interface IngestDeps {
  platform: Platform
  sources: SourcesRepo
  articles: ArticlesRepo
  stories: StoriesRepo
  tags: TagsRepo
  search: SearchRepo
  ai: AIProvider
}

export interface IngestReport {
  fontesLidas: number
  fontesComErro: number
  itensVistos: number
  itensNovos: number
  itensFiltrados: number
  historiasCriadas: number
}

const POR_SLUG = new Map(TAG_DICTIONARY.map((t) => [t.slug, t]))
const TRUST_CONFIAVEL = 0.8
const LOTE_IA = 12

/**
 * Executa o pipeline do spec §4 de ponta a ponta. Cada fonte é isolada:
 * uma exceção em qualquer etapa dela é contada e a ingestão segue nas
 * demais (constraint global do plano).
 */
export async function runIngest(deps: IngestDeps): Promise<IngestReport> {
  const { platform, sources, articles, stories, tags, search, ai } = deps
  const agora = platform.clock.now()

  const rel: IngestReport = {
    fontesLidas: 0, fontesComErro: 0, itensVistos: 0,
    itensNovos: 0, itensFiltrados: 0, historiasCriadas: 0,
  }

  const novos: Article[] = []

  // ---- Etapas 1 a 6: buscar, parsear, normalizar, filtrar, fingerprint ----
  for (const fonte of sources.listActive()) {
    try {
      const res = await platform.http.get({
        url: fonte.feedUrl,
        etag: fonte.etag,
        lastModified: fonte.lastModified,
        timeoutMs: 20_000,
      })

      rel.fontesLidas++
      sources.markFetched(
        fonte.id, agora,
        res.headers['etag'] ?? fonte.etag,
        res.headers['last-modified'] ?? fonte.lastModified,
      )

      if (res.status === 304) continue          // nada mudou: custo zero
      if (res.status >= 400) { rel.fontesComErro++; continue }

      for (const item of parseFeed(res.body)) {
        rel.itensVistos++

        const base = normalizeItem(item, fonte, agora)
        if (articles.existsByCanonicalUrl(base.canonicalUrl)) continue

        // Mecanismo 3 de proteção de cota: cortar antes de gastar IA.
        if (!isRelevant(base.title, base.contentText || base.excerpt)) {
          rel.itensFiltrados++
          continue
        }

        novos.push({
          ...base,
          simhash: simhash(`${base.title} ${base.contentText.slice(0, 500)}`),
          storyId: null,
          contentType: 'news',       // definido pela classificação abaixo
          aiState: 'pending',
        })
      }
    } catch (e) {
      rel.fontesComErro++
      platform.logger.warn(`falha na fonte ${fonte.id}`, e)
    }
  }

  if (novos.length === 0) return rel

  // Persiste antes de classificar: se a IA falhar, os artigos ficam
  // gravados como 'pending' e são reprocessados na próxima rodada.
  for (const a of novos) articles.upsert(a)
  rel.itensNovos = novos.length

  // ---- Etapa 7: classificação em lote ----
  const trustPorFonte = new Map(sources.listActive().map((s) => [s.id, s]))
  const classificacoes = new Map<string, Awaited<ReturnType<AIProvider['classifyBatch']>>[number]>()

  for (let i = 0; i < novos.length; i += LOTE_IA) {
    const lote: ArticleForAI[] = novos.slice(i, i + LOTE_IA).map((a) => {
      const f = trustPorFonte.get(a.sourceId)
      return {
        id: a.id, title: a.title, excerpt: a.excerpt, contentText: a.contentText,
        sourceTrust: f?.trustWeight ?? 0.5, categoryHint: f?.categoryHint ?? null,
      }
    })

    try {
      for (const c of await ai.classifyBatch(lote)) classificacoes.set(c.articleId, c)
    } catch (e) {
      platform.logger.warn('lote de classificação falhou; artigos seguem pendentes', e)
    }
  }

  for (const a of novos) {
    const c = classificacoes.get(a.id)
    if (!c) continue

    articles.upsert({ ...a, contentType: c.contentType, aiState: 'classified' })

    for (const t of c.tags) {
      const def = POR_SLUG.get(t.slug)
      if (!def) continue
      tags.attach(a.id, tags.ensure(def.slug, def.name, def.kind), t.confidence, 'rule')
    }

    search.index({
      id: a.id, title: a.title, excerpt: a.excerpt,
      contentText: a.contentText, tags: c.tags.map((t) => t.slug),
    })
  }

  // ---- Etapas 8 e 9: agrupar em histórias, pontuar, marcar breaking ----
  const entradas: ClusterInput[] = novos.map((a) => ({
    id: a.id, title: a.title, simhash: a.simhash, publishedAt: a.publishedAt,
  }))
  const porId = new Map(novos.map((a) => [a.id, a]))

  for (const cluster of clusterArticles(entradas)) {
    const primario = porId.get(cluster.primaryId)!
    const membros = cluster.members.map((id) => porId.get(id)!)
    const cPrimario = classificacoes.get(primario.id)

    const datas = membros.map((m) => m.publishedAt)
    const importancia = cPrimario?.importance ?? 0.5
    const confiavel = membros.some((m) => {
      const f = trustPorFonte.get(m.sourceId)
      return f !== undefined && (f.kind === 'official' || f.trustWeight >= TRUST_CONFIAVEL)
    })

    const historia: Story = {
      id: `st_${primario.id}`,
      canonicalTitle: primario.title,
      canonicalSummary: primario.excerpt || null,
      category: cPrimario?.category ?? 'technology',
      importance: importancia,
      isBreaking: isBreaking({
        importance: importancia,
        articleCount: membros.length,
        firstSeenAt: Math.min(...datas),
        lastArticleAt: Math.max(...datas),
        hasTrustedSource: confiavel,
      }),
      firstSeenAt: Math.min(...datas),
      lastUpdatedAt: agora,
      articleCount: membros.length,
    }

    stories.upsert(historia)
    for (const m of membros) {
      stories.linkArticle(historia.id, m.id, m.id === primario.id)
      articles.setStory(m.id, historia.id)
    }
    rel.historiasCriadas++
  }

  return rel
}
```

- [ ] **Passo 4: Rodar até passar**

```bash
npm test -w @devhub/core -- pipeline
```

Esperado: PASSA (11 testes).

- [ ] **Passo 5: Criar o pacote da CLI**

`tools/cli/package.json`:

```json
{
  "name": "@devhub/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "devhub": "./src/index.ts" },
  "scripts": { "dev": "tsx src/index.ts" },
  "dependencies": { "@devhub/core": "*", "@devhub/db": "*" }
}
```

`tools/cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "references": [{ "path": "../../packages/core" }, { "path": "../../packages/db" }]
}
```

- [ ] **Passo 6: Implementar o adaptador de plataforma do Node**

`tools/cli/src/platform-node.ts`:

```typescript
import type { HttpClient, HttpRequest, Logger, Platform, SecretStore } from '@devhub/core'

/** Implementa HttpClient com fetch do Node. Status HTTP nunca vira exceção. */
const http: HttpClient = {
  async get(req: HttpRequest) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 20_000)
    try {
      const cabecalhos: Record<string, string> = {
        'user-agent': 'DevHub/0.1 (+feed reader)',
        accept: 'application/rss+xml, application/atom+xml, application/json, text/xml;q=0.9, */*;q=0.8',
      }
      if (req.etag) cabecalhos['if-none-match'] = req.etag
      if (req.lastModified) cabecalhos['if-modified-since'] = req.lastModified

      const r = await fetch(req.url, {
        headers: cabecalhos, signal: ctrl.signal, redirect: 'follow',
      })
      // 304 não tem corpo; ler mesmo assim é seguro e devolve ''.
      const body = r.status === 304 ? '' : await r.text()
      return { status: r.status, body, headers: Object.fromEntries(r.headers) }
    } finally {
      clearTimeout(timer)
    }
  },
}

const logger: Logger = {
  debug(m, meta) { if (process.env['DEVHUB_DEBUG']) console.debug(`[debug] ${m}`, meta ?? '') },
  info(m) { console.log(m) },
  warn(m, meta) { console.warn(`[aviso] ${m}`, meta ?? '') },
  error(m, meta) { console.error(`[erro] ${m}`, meta ?? '') },
}

/**
 * Placeholder da Fase 1: a CLI não lê nenhuma chave. As Fases 2 e 3
 * substituem por safeStorage (Electron) e expo-secure-store (Android).
 */
const secrets: SecretStore = {
  async get() { return null },
  async set() { throw new Error('armazenamento seguro indisponível na CLI') },
  async delete() {},
}

export const nodePlatform: Platform = {
  http,
  clock: { now: () => Date.now() },
  logger,
  secrets,
}
```

- [ ] **Passo 7: Implementar a CLI**

`tools/cli/src/index.ts`:

```typescript
#!/usr/bin/env -S npx tsx
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  HeuristicProvider, SOURCES, runIngest, type Category,
} from '@devhub/core'
import {
  ArticlesRepo, NodeSqliteDriver, SearchRepo, SourcesRepo, StoriesRepo,
  TagsRepo, migrate,
} from '@devhub/db'
import { nodePlatform } from './platform-node.js'

const CAMINHO_DB = resolve(process.cwd(), 'data/devhub.db')
const CATEGORIAS: Category[] = ['technology', 'programming', 'innovation']

function abrir() {
  mkdirSync(dirname(CAMINHO_DB), { recursive: true })
  const db = new NodeSqliteDriver(CAMINHO_DB)
  migrate(db)
  return db
}

function quandoFoi(ts: number, agora: number): string {
  const h = Math.floor((agora - ts) / 3_600_000)
  if (h < 1) return 'agora'
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

async function cmdIngest() {
  const db = abrir()
  const sources = new SourcesRepo(db)
  for (const s of SOURCES) sources.upsert(s)

  console.log(`Ingerindo ${sources.listActive().length} fontes…\n`)
  const inicio = Date.now()

  const r = await runIngest({
    platform: nodePlatform,
    sources,
    articles: new ArticlesRepo(db),
    stories: new StoriesRepo(db),
    tags: new TagsRepo(db),
    search: new SearchRepo(db),
    ai: new HeuristicProvider(),
  })

  console.log(`Fontes lidas ......... ${r.fontesLidas}`)
  console.log(`Fontes com erro ...... ${r.fontesComErro}`)
  console.log(`Itens vistos ......... ${r.itensVistos}`)
  console.log(`Filtrados (sem IA) ... ${r.itensFiltrados}`)
  console.log(`Artigos novos ........ ${r.itensNovos}`)
  console.log(`Histórias criadas .... ${r.historiasCriadas}`)
  console.log(`\nConcluído em ${((Date.now() - inicio) / 1000).toFixed(1)}s`)
  db.close()
}

function cmdFeed(categoria: Category | null, limite: number) {
  const db = abrir()
  const stories = new StoriesRepo(db)
  const articles = new ArticlesRepo(db)
  const tags = new TagsRepo(db)
  const agora = Date.now()

  const top = stories.topRanked(limite, categoria, agora)
  if (top.length === 0) {
    console.log('Nada no feed ainda. Rode:  npm run dev -w @devhub/cli -- ingest')
    db.close()
    return
  }

  console.log(`\nDEV HUB — ${categoria ?? 'todas as categorias'}\n${'─'.repeat(76)}`)

  for (const [i, item] of top.entries()) {
    const a = articles.byId(item.primaryArticleId)
    const b = item.breakdown
    const selo = item.story.isBreaking ? ' [ÚLTIMA HORA]' : ''
    const slugs = tags.tagsFor(item.primaryArticleId).slice(0, 4)

    console.log(`\n${String(i + 1).padStart(2)}. ${item.story.canonicalTitle}${selo}`)
    console.log(`    ${item.story.category} · ${a ? quandoFoi(a.publishedAt, agora) : '?'}` +
      ` · ${a?.contentType ?? '?'}` +
      `${item.story.articleCount > 1 ? ` · ${item.story.articleCount} fontes` : ''}` +
      `${slugs.length ? ` · ${slugs.join(', ')}` : ''}`)
    // O spec exige que o ranking seja inspecionável, não caixa-preta.
    console.log(`    score ${b.total.toFixed(4)}  =  fresc ${b.freshness.toFixed(2)}` +
      ` × conf ${b.trust.toFixed(2)} × imp ${b.importance.toFixed(2)}` +
      ` × afin ${b.affinity.toFixed(2)} × dedup ${b.dedupPenalty.toFixed(2)}`)
    if (a) console.log(`    ${a.url}`)
  }
  console.log()
  db.close()
}

function cmdSearch(termo: string, limite: number) {
  const db = abrir()
  const ids = new SearchRepo(db).query(termo, limite)
  const articles = new ArticlesRepo(db)
  const agora = Date.now()

  if (ids.length === 0) {
    console.log(`Nenhum resultado para "${termo}".`)
    db.close()
    return
  }

  console.log(`\n${ids.length} resultado(s) para "${termo}"\n${'─'.repeat(76)}`)
  for (const id of ids) {
    const a = articles.byId(id)
    if (!a) continue
    console.log(`\n  ${a.title}`)
    console.log(`  ${quandoFoi(a.publishedAt, agora)} · ${a.readingMinutes} min · ${a.contentType}`)
    console.log(`  ${a.url}`)
  }
  console.log()
  db.close()
}

function cmdSources() {
  const db = abrir()
  const sources = new SourcesRepo(db)
  for (const s of SOURCES) sources.upsert(s)

  const ativas = sources.listActive()
  console.log(`\n${ativas.length} fontes ativas\n${'─'.repeat(76)}`)
  for (const s of ativas) {
    const quando = s.lastFetchedAt ? quandoFoi(s.lastFetchedAt, Date.now()) : 'nunca'
    console.log(`  ${s.id.padEnd(22)} ${s.kind.padEnd(11)} peso ${s.trustWeight.toFixed(2)}  lido: ${quando}`)
  }
  console.log()
  db.close()
}

function ajuda() {
  console.log(`
DEV HUB — CLI da Fase 1

  ingest                      Busca todas as fontes e processa o pipeline
  feed [categoria] [limite]   Mostra o feed ranqueado (padrão: todas, 20)
                              categoria: technology | programming | innovation
  search <termo> [limite]     Busca no índice FTS5 (padrão: 20)
  sources                     Lista as fontes e quando foram lidas

Exemplos:
  npm run dev -w @devhub/cli -- ingest
  npm run dev -w @devhub/cli -- feed programming 10
  npm run dev -w @devhub/cli -- search "rust compiler"
`)
}

const [comando, ...args] = process.argv.slice(2)

try {
  switch (comando) {
    case 'ingest':
      await cmdIngest()
      break
    case 'feed': {
      const cat = CATEGORIAS.includes(args[0] as Category) ? (args[0] as Category) : null
      const lim = Number(args[cat ? 1 : 0]) || 20
      cmdFeed(cat, lim)
      break
    }
    case 'search':
      if (!args[0]) { console.error('Informe o termo de busca.'); process.exit(1) }
      cmdSearch(args[0], Number(args[1]) || 20)
      break
    case 'sources':
      cmdSources()
      break
    default:
      ajuda()
  }
} catch (e) {
  console.error('[erro fatal]', e)
  process.exit(1)
}
```

- [ ] **Passo 8: Rodar contra a internet de verdade — o entregável da Fase 1**

```bash
npm install
npm run dev -w @devhub/cli -- ingest
```

Esperado: relatório com `fontesLidas` ≥ 30 e `itensNovos` > 0.

```bash
npm run dev -w @devhub/cli -- feed 15
```

Esperado: lista ranqueada de notícias reais, cada uma com a decomposição
do score visível.

```bash
npm run dev -w @devhub/cli -- search rust
npm run dev -w @devhub/cli -- feed programming 10
npm run dev -w @devhub/cli -- ingest
```

A segunda execução de `ingest` deve mostrar `itensNovos` bem menor — a
maioria dos artigos já está no banco e não é reprocessada.

- [ ] **Passo 9: Rodar a suíte inteira e o typecheck**

```bash
npm test
npm run typecheck
```

Esperado: tudo verde, sem erros de tipo.

- [ ] **Passo 10: Commit**

```bash
git add packages/core/src/ingest packages/core/src/index.ts tools/cli package.json package-lock.json
git commit -m "feat: pipeline de ingestão e CLI da Fase 1

Fecha a fatia vertical: a CLI busca 30+ feeds reais, deduplica,
classifica por heurística, ranqueia e imprime o feed.

Artigos são persistidos ANTES da classificação. Se a IA falhar, eles
ficam gravados como 'pending' e são reprocessados na rodada seguinte
em vez de se perderem — é o mesmo caminho que a Fase 5 usará quando a
cota do Gemini se esgotar.

A CLI imprime a decomposição do score em cada item, cumprindo a
exigência do spec de que o ranking seja inspecionável.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Auto-revisão do plano

Conferência contra o spec, feita após escrever todas as tarefas.

**1. Cobertura do spec (Fase 1)**

| Requisito do spec | Tarefa |
|---|---|
| §3 Monorepo com `core` e `db` | 1, 11 |
| §3.1 Regra de dependência do núcleo | 2 (com teste automatizado que a impõe) |
| §4 Pipeline de 10 etapas | 3, 4, 5, 6, 7, 14 |
| §4.1 30+ fontes com peso por tipo | 13 |
| §4.2 Dedup em dois estágios | 5, 6 (`grayPairs` prontos para a IA da Fase 5) |
| §5 Esquema SQLite completo | 11 |
| §6.1 Interface `AIProvider` | 9 |
| §6.4.3 Pré-filtro heurístico | 7 |
| §6.4.7 Degradação graciosa | 9, 14 (artigos persistidos como `pending`) |
| §6.5 Rótulo de conteúdo gerado | 9 (`isAiGenerated`), 11 (coluna `is_ai_generated`) |
| §7.1 Fórmula de ranking inspecionável | 10, 12, 14 |
| §7.2 Breaking news com fonte confiável | 10, 14 |
| §8 Camada 1 — busca FTS5 | 11, 12 |
| §15 Falha de fonte não derruba pipeline | 3, 14 |
| §16 Estratégia de testes | todas (TDD em cada tarefa) |

Requisitos do spec **deliberadamente fora desta fase**, cada um com destino
registrado: §6.2/§6.3/§6.4 restantes (Fase 5), §7.3 trending (Fase 5), §8
camada 2 (Fase 5), §9 armazenamento seguro de chave (Fases 2 e 3), §10 e §11
interfaces (Fases 2 e 3), §12 tokens de design (Fase 2), §13 acessibilidade
(Fases 2 e 3), §14 metas de performance de UI (Fases 2 e 3).

**2. Varredura de placeholders**

Sem `TBD`, sem `TODO`, sem "similar à Tarefa N", sem "trate os casos de borda".
Todo passo de código traz o código. A única indireção deliberada é a lista de
feeds da Tarefa 13, e ela vem com script de verificação e critério numérico de
aceitação em vez de ser deixada em aberto.

**3. Consistência de tipos**

Verificado que os nomes casam entre tarefas que os produzem e consomem:
`tokenize` (T5 → T7, T8, T9); `tagsOf`/`categoryOf`/`contentTypeOf` (T8 → T9);
`scoreStory`/`ScoreBreakdown` (T10 → T12, T14); `SqlDriver` (T11 → T12);
`ClusterInput`/`Cluster.grayPairs` (T6 → T14); `ArticleForAI`/`Classification`
(T9 → T14); `normalizeItem` devolve `NormalizedArticle`, e a T14 completa
`simhash`/`storyId`/`contentType`/`aiState` para formar o `Article` inteiro.

Uma correção aplicada durante esta revisão: `StoriesRepo.topRanked` recebe
`now` como terceiro parâmetro (o teste da T12 já o passa) porque o `core`
proíbe `Date.now()` — o relógio vem de fora, inclusive aqui.

---

## Próximo passo

Ao terminar a Tarefa 14, a Fase 1 está completa e verificável. A Fase 2
(desktop Electron) recebe seu próprio ciclo spec → plano → implementação,
partindo deste mesmo `packages/core` sem alterá-lo.
