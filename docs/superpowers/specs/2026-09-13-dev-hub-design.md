# Dev Hub — Documento de Design

**Data:** 2026-09-13
**Status:** Aprovado para planejamento
**Tagline:** Technology. Code. Innovation.

---

## 1. Visão Geral

Dev Hub é uma plataforma de notícias de tecnologia para Windows e Android,
voltada a desenvolvedores e profissionais de tecnologia. Cobre três eixos:
**Tecnologia**, **Programação & Desenvolvimento** e **Inovação**.

O produto é **local-first**: não há servidor, não há conta a criar, não há
custo mensal de infraestrutura. Cada instalação busca as notícias, processa e
armazena tudo localmente em SQLite. As fronteiras do código são desenhadas
para que um backend em nuvem possa ser acrescentado depois sem reescrita.

### Princípios que governam as decisões deste documento

1. **Custo zero de operação.** A camada de IA usa a cota gratuita do Gemini
   API e é projetada para nunca encostar nela.
2. **O app nunca quebra por causa da IA.** Sem chave, sem cota ou sem internet,
   o Dev Hub continua funcionando com qualidade reduzida, nunca com tela de erro.
3. **Transparência.** Todo resumo gerado por IA é rotulado como tal. O score de
   relevância é inspecionável. A fonte original é sempre atribuída e linkável.
4. **Cada plataforma com o que ela faz melhor.** Electron no desktop (layouts
   densos multi-coluna, atalhos de teclado), React Native no Android (rolagem,
   gestos e bateria nativos).

---

## 2. Decisões de Arquitetura

### 2.1 Stack

| Camada | Escolha |
|---|---|
| Núcleo de lógica | TypeScript puro, sem dependência de plataforma |
| Desktop | Electron + React DOM + Vite |
| Mobile | React Native via Expo |
| Persistência | SQLite (`better-sqlite3` no desktop, `expo-sqlite` no mobile) |
| Estado | Zustand (funciona idêntico em web e native) |
| Busca | SQLite FTS5 |
| IA | Gemini API (cota gratuita) atrás de uma interface trocável |

### 2.2 Por que esta combinação

React DOM e React Native **não compartilham componentes de tela** — RN usa
`View`/`Text`/`StyleSheet`, não `div` e CSS. A camada visual é portanto escrita
duas vezes. Isso é uma escolha deliberada, não um acidente: o dashboard do
desktop precisa de grid multi-coluna denso e navegação por teclado, coisas que
o modelo de layout do React Native não expressa bem; o Android precisa de
listas virtualizadas nativas e gestos de verdade, que o DOM num WebView não
entrega com a mesma fluidez.

O custo é limitado porque **só a apresentação duplica**. Ingestão, dedup,
ranking, banco, estado, hooks e tokens de design são um código só — cerca de
70% do total.

### 2.3 Alternativas consideradas e rejeitadas

| Alternativa | Motivo da rejeição |
|---|---|
| Capacitor no lugar de React Native | UI compartilhada, mas rolagem e gestos inferiores no Android |
| React Native Windows | Exige Visual Studio com workload C++ (~20 GB); historicamente instável |
| Flutter | Exige Flutter SDK + Android Studio + JDK 17 + Visual Studio antes da primeira linha útil; Dart; sem SDKs oficiais para os provedores de IA |
| Tauri no lugar de Electron | App muito mais leve, mas exige Rust + MSVC Build Tools (~6 GB). Migração possível depois: a casca é fina de propósito |
| Backend em nuvem | Custo mensal, deploy e auth antes de qualquer tela aparecer |
| Site do Gemini (gemini.google.com) | **Não tem API.** Automatizar o navegador viola os Termos de Serviço do Google e quebra a cada mudança de layout |

---

## 3. Estrutura do Monorepo

```
dev-hub/
├─ packages/
│  ├─ core/          Ingestão, parsing, dedup, ranking, trending, IA. TS puro.
│  ├─ db/            Esquema SQLite, migrações e repositórios. 1 interface, 2 drivers.
│  ├─ state/         Stores Zustand, seletores e hooks. Compartilhado web + native.
│  └─ tokens/        Design tokens: cores, tipografia, espaçamento, raios.
├─ apps/
│  ├─ desktop/       Electron + React DOM + Vite.
│  └─ mobile/        Expo (React Native).
└─ docs/superpowers/
   ├─ specs/         Documentos de design.
   └─ plans/         Planos de implementação.
```

Gerenciado com workspaces do npm. TypeScript em modo `strict` em todos os pacotes.

### 3.1 A regra de dependência

`core` **não importa nada de plataforma**. Sem `fs`, sem `fetch` global, sem
`window`, sem APIs do Electron ou do React Native. Tudo que precisa do mundo
externo entra por injeção:

```typescript
interface Platform {
  http: HttpClient          // fetch com timeout, retry e respeito a ETag
  clock: Clock              // now(); injetável para testes determinísticos
  logger: Logger
  secrets: SecretStore      // safeStorage (Windows) | expo-secure-store (Android)
}
```

Isso é o que torna literal a exigência do briefing de *"suportar plataformas
futuras sem mudanças arquiteturais"*: web, iOS, Linux e macOS viram trabalho de
casca, não de reescrita. E torna o `core` testável sem rede e sem sistema de
arquivos.

---

## 4. Pipeline de Ingestão

```
Fontes (RSS / Atom / JSON Feed / APIs públicas)
   |
   +-- 1. Fetch condicional ....... ETag + If-Modified-Since; 304 custa zero
   +-- 2. Parse .................. RSS 2.0, Atom, JSON Feed
   +-- 3. Normalizar ............. limpar HTML, extrair texto, resolver datas
   |                               e autores, canonicalizar URL
   +-- 4. Pre-filtro heuristico .. relevancia lexical + idioma
   |                               descarta o que claramente nao e tecnologia
   +-- 5. Fingerprint ............ SimHash 64-bit de titulo + 500 chars
   +-- 6. Dedup lexical .......... Hamming <= 3 -> mesma historia
   +-- 7. IA em lote ............. classificar + taggear + resumo curto
   |                               + resolver a zona cinzenta do dedup
   +-- 8. Agrupar em Story ....... N artigos sobre o mesmo evento -> 1 historia
   +-- 9. Score + breaking ....... ranking transparente
   +-- 10. Persistir ............. SQLite + indice FTS5
```

Cada etapa é uma função pura testável isoladamente, exceto 1 e 10.

### 4.1 Fontes iniciais

Mínimo de 30 feeds, com `trust_weight` atribuído por tipo:

- **Oficiais** (peso 1.0): blogs de engenharia e release notes de projetos e
  empresas — Python, Rust, Go, Node.js, React, Chrome, Android, Kubernetes,
  cloud providers, fabricantes de hardware.
- **Notícias** (peso 0.75): publicações estabelecidas de tecnologia.
- **Blogs/análise** (peso 0.6): blogs técnicos individuais e corporativos.
- **Agregadores** (peso 0.5): Hacker News, dev.to, Lobsters, GitHub Trending.
- **Pesquisa** (peso 0.9): arXiv (cs.AI, cs.LG, cs.SE), papers e preprints.

A lista concreta de URLs vai no plano de implementação da Fase 1.

### 4.2 Deduplicação em dois estágios

**Estágio 1 — lexical, custo zero.** SimHash de 64 bits sobre título
normalizado + primeiros 500 caracteres. Distância de Hamming menor ou igual a 3
significa mesma história. Complementado por Jaccard de trigramas do título
maior ou igual a 0.7. Resolve cerca de 80% dos casos sem tocar na IA.

**Estágio 2 — IA, só na zona cinzenta.** Hamming entre 4 e 12, ou Jaccard
entre 0.45 e 0.7, vira um par candidato. Esses pares **viajam de carona no lote
de classificação que já está sendo enviado** — o prompt pergunta quais se
referem ao mesmo evento. Custo marginal: praticamente zero.

---

## 5. Modelo de Dados

SQLite com migrações versionadas. Esquema idêntico nas duas plataformas.

```sql
sources
  id, name, url, feed_url, kind, trust_weight REAL, category_hint,
  active, last_fetched_at, etag, last_modified

articles
  id, source_id, url UNIQUE, canonical_url, title, subtitle, author,
  published_at, fetched_at, excerpt, content_text, content_html, image_url,
  lang, simhash, word_count, reading_minutes, story_id,
  content_type,        -- news | announcement | report | rumor | opinion | analysis
  ai_state             -- pending | prefiltered_out | classified | summarized | failed

stories
  id, canonical_title, canonical_summary, category, importance REAL,
  is_breaking, first_seen_at, last_updated_at, article_count

story_articles          story_id, article_id, is_primary

summaries
  id, article_id, kind,          -- short | deep
  text, key_points JSON, provider, model,
  prompt_tokens, completion_tokens, generated_at,
  is_ai_generated DEFAULT 1      -- nunca exibir sem rotulo

tags                    id, kind, name, slug UNIQUE
                        -- kind: language | framework | hardware | company | topic | product
article_tags            article_id, tag_id, confidence REAL, source  -- ai | rule | user

follows                 id, target_kind, target_id, weight REAL, created_at
saved_articles          article_id, saved_at, note
reading_history         article_id, opened_at, dwell_seconds, scroll_pct

articles_fts            -- FTS5: title, excerpt, content_text, tags_flat

ai_usage                id, day, provider, model, requests,
                        prompt_tokens, completion_tokens

settings                key PRIMARY KEY, value
```

A chave da API **não fica aqui**. Vive no armazenamento seguro do sistema
operacional (seção 9).

### 5.1 Categorias

Três categorias de topo, conforme o briefing, cada uma com subcategorias
usadas para os atalhos da home e os filtros de busca:

- **Technology** — IA/ML, hardware, CPUs/GPUs, mobile, cloud, segurança,
  sistemas operacionais, redes, quantum, robótica.
- **Programming** — linguagens, frameworks, ferramentas, DevOps, bancos de
  dados, arquitetura, testes, open source.
- **Innovation** — projetos experimentais, pesquisa, protótipos, startups,
  arquiteturas novas, usos criativos de tecnologia.

---

## 6. Camada de IA e Proteção de Cota

### 6.1 Interface

```typescript
interface AIProvider {
  readonly name: string
  listModels(): Promise<ModelInfo[]>
  classifyBatch(articles: ArticleForAI[]): Promise<Classification[]>
  summarize(article: ArticleForAI, kind: 'short' | 'deep'): Promise<Summary>
}
```

Implementações: `GeminiProvider` (padrão) e `HeuristicProvider` (sem IA, sempre
disponível, nunca falha). A interface é fina e existe **a serviço da proteção
de cota** — é o que permite a degradação graciosa do item 6.4.7.

O modelo **não é fixado no código**. O app chama `listModels()` em tempo de
execução e apresenta um dropdown nas Configurações. Isso evita depender de um
nome de modelo que pode mudar ou não existir.

### 6.2 Os dois passes

**Passe 1 — todo artigo, em lote.** Classifica categoria, extrai tags tipadas,
determina `content_type`, pontua importância, gera resumo curto e resolve pares
duvidosos de dedup. **12 artigos por requisição.**

**Passe 2 — sob demanda.** Resumo rico com pontos-chave, tecnologias
relacionadas e links relevantes. Disparado quando o usuário abre um artigo.
Resultado é cacheado para sempre.

### 6.3 Aritmética da cota

| | Ingênuo | Com agrupamento |
|---|---|---|
| Classificar ~300 artigos/dia | 300 requisições | **25** |
| Resumir sob demanda (~15/dia) | 15 | 15 |
| **Total/dia** | ~315 | **~40** |

### 6.4 Os oito mecanismos de proteção

1. **Agrupamento** — 12 artigos por requisição.
2. **Cache permanente por hash de conteúdo** — cada artigo é processado uma
   única vez na vida. Reinstalar o app não reprocessa o que já está no banco.
3. **Pré-filtro heurístico** — artigos claramente fora de escopo e duplicatas
   lexicais óbvias nunca chegam à IA. Corta 30-50% do volume sem gastar nada.
4. **Governador de cota** — token bucket por minuto + contador diário, com teto
   configurável e margem de segurança de 20% sobre a cota conhecida.
5. **Fila persistente com backoff exponencial** — um HTTP 429 pausa a fila e
   reagenda. Nada se perde; o trabalho retoma de onde parou.
6. **Ingestão em janelas agendadas** — 3 a 4 vezes por dia, não contínua.
7. **Degradação graciosa** — cota esgotada aciona o `HeuristicProvider`:
   resumo extrativo por pontuação de sentenças, classificação por regras e
   pesos, tags por dicionário. O app segue 100% funcional. Os artigos ficam em
   `ai_state = 'pending'` e são reprocessados quando a cota voltar.
8. **Painel de consumo** — requisições e tokens do dia visíveis nas
   Configurações, com o teto ajustável pelo usuário.

### 6.5 Transparência obrigatória

Todo texto gerado por IA carrega o rótulo **"Resumo gerado por IA"** na
interface, junto do nome do modelo usado. O texto original e o link para a
fonte estão sempre a um clique. Nenhuma informação gerada automaticamente é
apresentada como fato confirmado — o campo `content_type` distingue notícia
confirmada, anúncio oficial, reportagem, rumor, opinião e análise, e isso vira
um selo visível no card.

### 6.6 Ressalvas sobre a cota gratuita

Registradas explicitamente por honestidade:

1. Provedores tipicamente usam dados da camada gratuita para treinar modelos.
   Para notícias públicas de tecnologia isso é inofensivo, mas o usuário deve
   saber — e haverá um aviso nas Configurações.
2. Os limites mudam sem aviso prévio.
3. Camadas gratuitas podem ser descontinuadas.

Os mecanismos 4, 5 e 7 são o seguro contra os três cenários.

---

## 7. Ranking, Breaking News e Trending

### 7.1 Fórmula de relevância

```
score = frescor x confianca_da_fonte x importancia x afinidade x penalidade_duplicata

frescor              = exp(-ln(2) x horas_desde_publicacao / meia_vida)
                       meia_vida = 18h (36h para Innovation, que envelhece devagar)
confianca_da_fonte   = sources.trust_weight                      [0.4 .. 1.0]
importancia          = stories.importance (IA)                   [0 .. 1], 0.5 se pendente
afinidade            = 1 + soma(follow.weight x confianca_da_tag)  [1.0 .. 3.0]
penalidade_duplicata = 1 / (1 + 0.15 x (article_count - 1))
```

Cada fator é inspecionável na interface — um painel "por que estou vendo isto"
mostra a decomposição do score. Nada de caixa-preta.

### 7.2 Breaking news

Marcado quando **todas** as condições valem:

- `importance` maior que 0.85
- 3 ou mais artigos sobre a mesma história em até 6 horas
- ao menos uma fonte com `kind = 'official'` ou `trust_weight` maior ou igual a 0.8

Isso evita que um boato replicado por agregadores vire manchete.

### 7.3 Trending

Frequência de tag numa janela deslizante de 48h comparada à linha de base dos
14 dias anteriores, via z-score. Exige contagem mínima absoluta para evitar que
uma tag rara com dois artigos apareça como tendência.

---

## 8. Busca

**Camada 1 — FTS5 local.** Instantânea, offline, sem custo. Índice sobre
título, resumo, corpo e tags achatadas. Ranking BM25 combinado com o score de
relevância.

**Camada 2 — expansão de consulta por IA.** Opcional e sob demanda: transforma
"novidades de placa de vídeo" em um conjunto rico de termos e sinônimos
técnicos antes de consultar o FTS5. Uma requisição por busca, só quando o
usuário pede.

**Filtros:** categoria, intervalo de datas, tecnologia, linguagem, framework,
fonte, `content_type`. **Ordenação:** mais relevante, mais recente, em alta.

---

## 9. Segurança

| Preocupação | Tratamento |
|---|---|
| Chave da API | `safeStorage` do Electron (DPAPI do Windows) / `expo-secure-store` (Android Keystore). Nunca no repositório, nunca em SQLite puro, nunca em log |
| Origem das chamadas de IA | Processo *main* do Electron (Node, sem CORS) e runtime nativo no React Native. Nunca do renderer |
| HTML de terceiros | Sanitizado na ingestão com allowlist de tags. O leitor renderiza texto estruturado, não HTML bruto |
| Isolamento do Electron | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. IPC por canais tipados e explicitamente registrados |
| Navegação externa | Links abrem no navegador do sistema, nunca dentro da janela do app |
| Validação de entrada | Todo dado de feed passa por schema Zod antes de tocar o banco |
| Telemetria | Nenhuma. Nada sai da máquina exceto as requisições de feed e de IA |

---

## 10. Aplicativo Desktop (Windows)

**Navegação lateral:** Home, Latest, Technology, Programming, Innovation,
Trending, Saved, Following, Settings.

**Layout:** grid responsivo de 1 a 4 colunas conforme a largura da janela.
A home segue a hierarquia do briefing: breaking news no topo, destaques,
tópicos em alta, últimas de tecnologia, últimas de programação, destaques de
inovação, recomendados e salvos.

**Atalhos de teclado:**

| Atalho | Ação |
|---|---|
| `Ctrl+K` | Busca global |
| `J` / `K` | Navegar entre artigos |
| `Enter` | Abrir artigo |
| `S` | Salvar |
| `R` | Atualizar feed |
| `1` a `9` | Ir para seção da barra lateral |
| `Ctrl+B` | Recolher barra lateral |
| `Ctrl` mais `+` / `-` | Tamanho do texto |
| `Esc` | Voltar |
| `Ctrl+,` | Configurações |

**Notificações:** nativas do Windows, via `Notification` do Electron.

---

## 11. Aplicativo Mobile (Android)

**Navegação inferior:** Home, Explore, Saved, Following, Profile.

**Comportamentos nativos:** puxar para atualizar, listas virtualizadas
(`FlashList`), gestos de deslizar nos cards para salvar e dispensar, leitura
offline do conteúdo já sincronizado, imagens com `expo-image` e cache em disco.

**Consciência de bateria e dados:** sincronização em segundo plano apenas em
Wi-Fi por padrão e enquanto carregando, configurável. Ingestão agendada via
`expo-background-task`.

**Empacotamento:** o `.apk` é gerado por **EAS Build**, na nuvem. Não é
necessário instalar Android Studio nem JDK 17 na máquina de desenvolvimento —
isso só é preciso para rodar emulador local, que é opcional.

---

## 12. Design System e Temas

Tokens definidos uma vez em `packages/tokens` como objetos TypeScript puros,
consumidos como variáveis CSS no desktop e como `StyleSheet` no mobile. Isso
mantém as duas interfaces visualmente idênticas apesar de o código de
apresentação ser separado.

**Claro:**
```
bg #FFFFFF   surface #F7F8FA   surfaceAlt #EEF0F4
border #E2E5EA   borderStrong #CBD1DA
text #0F1115   textMuted #5A6472   textFaint #8A93A0
accent #2F6FED
technology #2F6FED   programming #7C3AED   innovation #0E9F6E
```

**Escuro:**
```
bg #0B0D11   surface #13161C   surfaceAlt #1A1E26
border #242A34   borderStrong #333B48
text #E8EBF0   textMuted #9AA4B2   textFaint #6B7482
accent #5B8DEF
technology #5B8DEF   programming #A78BFA   innovation #34D399
```

**Tipografia:** Inter para interface, JetBrains Mono para metadados técnicos e
código. Escala 12 / 13 / 14 / 16 / 18 / 22 / 28 / 36.
**Espaçamento:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.
**Raios:** 6 / 10 / 14 / pill.

O tema segue a preferência do sistema por padrão, com sobreposição manual
persistida nas configurações.

---

## 13. Acessibilidade

- Contraste mínimo WCAG AA (4.5:1 para texto corrido) verificado em ambos os
  temas por teste automatizado sobre os tokens.
- Tamanho de texto ajustável, respeitando a escala de fonte do sistema.
- Rótulos acessíveis em todos os controles; landmarks semânticos no desktop.
- Navegação completa por teclado no desktop, com estados de foco visíveis.
- Alvos de toque de no mínimo 44x44 dp no mobile.
- `prefers-reduced-motion` desativa transições não essenciais.

---

## 14. Performance

| Alvo | Meta |
|---|---|
| Inicialização a frio (desktop) | menos de 2s até conteúdo interativo |
| Inicialização a frio (mobile) | menos de 2.5s em aparelho intermediário |
| Rolagem | 60fps com listas virtualizadas nas duas plataformas |
| Consulta ao feed | menos de 50ms para 10.000 artigos (índices em `published_at`, `story_id`, `score`) |
| Busca FTS5 | menos de 100ms |
| Memória (desktop) | menos de 400 MB em uso normal |

Estratégias: virtualização de listas, imagens preguiçosas com placeholder de
proporção fixa, ingestão em worker separado do processo de UI, paginação por
cursor em vez de `OFFSET`.

---

## 15. Tratamento de Erros

O princípio: **falha em qualquer fonte nunca derruba o pipeline**.

- Feed fora do ar, XML malformado ou schema inválido: erro registrado no
  `sources`, feed pulado nesta rodada, ingestão continua nos demais.
- IA indisponível ou sem cota: `HeuristicProvider` assume, artigos ficam
  `pending` para reprocessamento.
- Banco corrompido: detectado na inicialização, backup automático e
  recriação do índice FTS.
- Estados de interface explícitos para carregando, vazio, offline e erro —
  nunca uma tela em branco.

---

## 16. Estratégia de Testes

Desenvolvimento guiado por testes, conforme o fluxo do projeto.

| Camada | Ferramenta | Cobertura |
|---|---|---|
| `core` | Vitest | Parsers com fixtures de XML real (incluindo malformado), SimHash, dedup, ranking, governador de cota, `HeuristicProvider` |
| `db` | Vitest + SQLite em memória | Migrações, repositórios, consultas FTS |
| `state` | Vitest | Stores, seletores, transições |
| Desktop | Playwright | Fluxos ponta a ponta, atalhos de teclado |
| Mobile | React Native Testing Library | Componentes e navegação |
| Tokens | Vitest | Contraste WCAG AA calculado em ambos os temas |

O `core` é testável inteiramente sem rede e sem sistema de arquivos, graças à
injeção de plataforma da seção 3.1. O relógio é injetado para tornar
determinísticos os testes de frescor e de janela de trending.

---

## 17. Fases de Implementação

Cada fase recebe seu próprio plano de implementação e é entregue funcionando
antes da seguinte começar.

| Fase | Entrega | Resultado verificável |
|---|---|---|
| **1** | Núcleo: monorepo, ingestão, SQLite, 30+ fontes, dedup lexical, ranking, `HeuristicProvider` | CLI que ingere feeds reais e imprime o feed ranqueado |
| **2** | Desktop: Electron, barra lateral, dashboard, leitor, busca FTS5, temas, atalhos | App Windows funcionando com notícias reais |
| **3** | Mobile: Expo RN, navegação inferior, cards, leitor, offline, puxar-para-atualizar | App Android funcionando no emulador ou aparelho |
| **4** | Personalização: seguir, salvos, histórico, feed personalizado, recomendações | Feed que reage ao que o usuário segue |
| **5** | IA: `GeminiProvider`, os dois passes, os oito mecanismos de cota, dedup semântico, trending, expansão de busca | Resumos e classificação reais, rotulados, dentro da cota |
| **6** | Notificações e empacotamento: `.exe` instalável, `.apk` via EAS, notificações nativas, ícones e splash | Instaladores prontos para as duas plataformas |

A Fase 1 entrega valor verificável sozinha e é a fundação de tudo. A ordem
2 e 3 antes de 4 e 5 é deliberada: é melhor ter duas interfaces funcionando com
heurística do que uma interface com IA perfeita.

---

## 18. Restrições Conhecidas

1. **O `.apk` não compila nesta máquina hoje.** Não há Android SDK nem Android
   Studio, e o Java instalado é um JRE 1.8 — o Gradle moderno exige JDK 17+.
   Contornado pelo EAS Build (compilação na nuvem). Rodar emulador local
   continuaria exigindo a instalação completa.
2. **Tauri fora por ora.** Exigiria Rust + MSVC Build Tools. O Electron pesa
   mais (~150 MB de instalador), o que é uma concessão consciente à meta de
   baixo consumo de memória.
3. **Limites da cota gratuita não verificados.** As ferramentas de busca web
   estavam indisponíveis durante o design. Os números da seção 6.3 são
   estimativas de volume próprio, não limites confirmados do provedor. O
   governador de cota da seção 6.4 é configurável exatamente por isso — os
   valores reais serão medidos e ajustados na Fase 5.
4. **A camada de apresentação é escrita duas vezes.** Consequência aceita da
   escolha Electron + React Native.

---

## 19. Fora de Escopo

Explicitamente não incluído, para manter o projeto implementável:

- Backend em nuvem, contas de servidor e sincronização multi-dispositivo.
  As fronteiras existem para acrescentar isso depois sem reescrita.
- iOS, macOS, Linux e versão web. Viabilizados pela arquitetura, não entregues.
- Comentários, recursos sociais e conteúdo gerado por usuários.
- Scraping de sites que não oferecem feed.
- Tradução de artigos.
