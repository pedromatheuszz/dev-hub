# Dev Hub

**Technology. Code. Innovation.**

Plataforma de notícias de tecnologia para **Windows** e **Android**, voltada a
desenvolvedores. Cobre Tecnologia, Programação e Inovação, de 37 fontes reais.

É **local-first**: não há servidor, não há conta a criar, não há custo mensal.
O próprio app busca as notícias, processa e guarda tudo em SQLite no aparelho.

---

## Rodar

```bash
npm install
```

### Desktop (Windows)

```bash
npm run dev -w @devhub/desktop
```

Instaladores prontos em `apps/desktop/dist/`:

| Arquivo | O que é |
|---|---|
| `DevHub-0.1.0-x64.exe` | Instalador com atalhos no menu Iniciar e na área de trabalho |
| `DevHub-0.1.0-portable.exe` | Executável avulso, sem instalar |

Para gerar de novo: `npm run dist -w @devhub/desktop`

> O instalador não é assinado digitalmente (o certificado é pago), então o
> Windows mostra o aviso do SmartScreen na primeira execução. Clique em
> "Mais informações" → "Executar assim mesmo".

### Android

```bash
cd apps/mobile
npx expo start
```

Leia o QR code com o app **Expo Go**. Para gerar o `.apk`, veja
[Gerar o APK](#gerar-o-apk) abaixo.

### CLI (ferramenta de desenvolvimento)

```bash
npm run dev -w @devhub/cli -- ingest          # busca as 37 fontes
npm run dev -w @devhub/cli -- feed 15         # feed ranqueado
npm run dev -w @devhub/cli -- search "rust"   # busca no índice local
npm run dev -w @devhub/cli -- sources         # lista as fontes
```

---

## Arquitetura

```
packages/
  core/     Ingestão, dedup, ranking, taxonomia, IA.  TypeScript puro.
  db/       Esquema SQLite e repositórios. 1 interface, 2 drivers.
  state/    Store Zustand compartilhado entre as plataformas.
  tokens/   Paleta, tipografia e espaçamento. Uma fonte só de verdade.
apps/
  desktop/  Electron + React DOM
  mobile/   Expo + React Native
tools/
  cli/      CLI de ingestão e inspeção
```

O `core` **não importa nada de plataforma** — nem `node:fs`, nem `window`, nem
Electron, nem React Native. Tudo externo entra pela interface `Platform`, por
injeção. Um teste automatizado impõe essa regra: se alguém importar `node:*`
dentro de `packages/core`, a suíte quebra.

É isso que faz o mesmo núcleo rodar no V8 do Electron e no Hermes do Android.

### Por que a interface é escrita duas vezes

React DOM e React Native não compartilham componentes. O desktop precisa de
grid multi-coluna denso e navegação por teclado; o Android precisa de listas
virtualizadas nativas e gestos de verdade. Só a camada de apresentação
duplica — cerca de 30% do código. O resto é um só.

---

## Como o ranking funciona

```
score = frescor × confiança_da_fonte × importância × afinidade × penalidade_duplicata
```

Cada card mostra a decomposição: `0.280 · F.62 C.75 I.60 A1.0 D1.0`. Passe o
mouse para ver o que cada letra significa. Nada de caixa-preta — o número
exibido é exatamente o que ordenou a lista.

**Última hora** exige três condições simultâneas: importância acima de 0.85,
três ou mais artigos em até 6 horas, e ao menos uma fonte oficial ou de alta
confiança. Isso impede que um boato replicado por agregadores vire manchete.

---

## Tradução automática

As fontes são internacionais e publicam em inglês. O Dev Hub detecta o idioma
de cada artigo e, **com a chave do Gemini configurada**, traduz título e resumo
para português junto da classificação — sem requisição extra, porque o título
já ia no prompt de qualquer forma. O corpo completo é traduzido quando você
abre o artigo.

Todo artigo traduzido leva o selo **⇄ Traduzido**, e no leitor há um botão
"Ver original" para conferir o texto como foi publicado.

**Sem a chave, nada é traduzido** — e o app diz isso em Configurações, em vez
de fingir. Traduzir exige um modelo de linguagem; um dicionário palavra a
palavra daria ao leitor a impressão falsa de estar lendo tradução confiável.

A detecção de idioma é por palavras funcionais, mas **metade dos artigos é só
título**, sem corpo: `"GitLab 19.3 released"` não tem uma palavra funcional
sequer. Por isso o idioma é resolvido também no nível da **fonte** — um blog
publica num idioma só, então os artigos curtos herdam o idioma dominante dos
artigos longos daquela fonte. Medido: a detecção saiu de 50% de desconhecidos
para 100% identificados.

---

## Inteligência artificial

O Dev Hub funciona **sem nenhuma chave de API**. Por padrão usa classificação
por regras e resumo extrativo, que rodam localmente e sem custo.

Com uma chave do Gemini (grátis em `aistudio.google.com/apikey`), você ganha
classificação e resumos gerados por modelo. Configure em **Configurações →
Inteligência artificial**.

Oito mecanismos protegem a cota gratuita:

| # | Mecanismo |
|---|---|
| 1 | 12 artigos por requisição, não um por artigo |
| 2 | Cache permanente: cada artigo é processado uma vez na vida |
| 3 | Pré-filtro heurístico corta o que está fora de escopo antes de gastar |
| 4 | Governador de cota com 20% de margem, restaurado do banco ao reiniciar |
| 5 | Backoff exponencial com jitter em 429 e 5xx |
| 6 | Ingestão automática uma vez por dia, às 5h |
| 7 | Degradação para heurística: sem chave, sem cota ou sem internet, o app segue inteiro |
| 8 | Painel de consumo com requisições e tokens do dia |

A tradução é o melhor exemplo do mecanismo 1: ela pega carona no lote de
classificação que já roda, então traduzir 1.800 artigos não custa nenhuma
requisição a mais.

Toda saída do modelo é validada antes de tocar o banco: tag que não existe na
taxonomia é descartada, categoria inválida cai no padrão, importância fora de
0..1 é limitada.

**Todo texto gerado automaticamente é rotulado como tal na interface.**

---

## Gerar o APK

O projeto Android nativo já está gerado em `apps/mobile/android/`. Duas formas
de compilar:

### A) Na nuvem, sem instalar nada (recomendado)

```bash
cd apps/mobile
npx eas login
npx eas build --platform android --profile preview
```

Precisa de uma conta Expo (gratuita). O APK sai por link no fim.

### B) Localmente

```bash
powershell -ExecutionPolicy Bypass -File tools/setup-android.ps1
```

O script verifica JDK 17+ e Android SDK, e compila. Ele **não instala o SDK
sozinho** porque isso exige aceitar as licenças do Google, que é um acordo em
seu nome.

---

## Segurança

| Preocupação | Tratamento |
|---|---|
| Chave da API | `safeStorage`/DPAPI no Windows, Keystore no Android. Só entra, nunca volta para a interface |
| Isolamento do renderer | `contextIsolation`, `nodeIntegration: false`, `sandbox: true` |
| CSP | Sem `eval`, sem script remoto, sem conexão de saída do renderer |
| IPC | Canais tipados e explícitos; todo argumento validado no processo main |
| HTML de terceiros | Sanitizado por allowlist na ingestão; `javascript:` e atributos de evento removidos |
| Links externos | Abrem no navegador do sistema, nunca dentro da janela |
| Telemetria | Nenhuma. Só saem requisições de feed e, se configurada, de IA |

---

## Testes

```bash
npm test              # 303 testes
npm run typecheck
```

Verificações que não são testes unitários:

```bash
npx tsx tools/verify-sources.mjs                  # checa os 37 feeds contra a rede
cd apps/desktop && npx electron . --smoke         # sobe o app e valida o DOM
cd apps/desktop && npx electron . --screenshot x.png --rota "Configurações"
cd apps/mobile  && npx expo export --platform android
```

O teste de contraste em `packages/tokens` verifica WCAG AA nas duas paletas e
quebra o build se alguém escurecer um texto além do permitido.

---

## Atualização automática

O Dev Hub busca as notícias **todo dia às 5h da manhã**, para o feed já estar
pronto quando você acorda. Dá para desligar em Configurações.

**No desktop**, um batimento de 10 minutos verifica se a janela das 5h foi
cruzada. É deliberadamente um batimento, e não um `setTimeout` de horas: um
temporizador longo não sobrevive à suspensão do notebook — o relógio avança e
ele simplesmente não dispara. Com o batimento, se o computador estiver
desligado às 5h, a busca acontece na primeira vez que você abrir o app depois
disso.

**No Android**, a tarefa roda em segundo plano. Aqui vale uma ressalva honesta:
**o Android não garante horário exato** — o sistema decide quando acordar a
tarefa, conforme bateria, rede e uso do aparelho. O que o app garante é que,
na primeira oportunidade depois das 5h, a ingestão roda; e que ela roda também
quando você abre o app, se a janela tiver passado em branco.

O botão "Buscar agora" ignora a janela e roda na hora, sempre.

---

## Limitações conhecidas

1. **O instalador não é assinado.** Certificado de assinatura é pago, então o
   Windows mostra o aviso do SmartScreen na primeira execução.
2. **Não há sincronização entre dispositivos.** Desktop e Android têm bancos
   independentes. As fronteiras do código permitem acrescentar isso sem
   reescrita.
3. **Duplicatas entre fontes diferentes são raras neste acervo.** As 37 fontes
   publicam sobretudo conteúdo próprio, então o agrupamento de histórias quase
   não dispara hoje. Ele existe e é testado — passa a importar quando várias
   publicações cobrirem o mesmo evento.

### Corrigidas

- ~~Tags com ruído~~ — um artigo sobre CPU da AMD recebia `intel`. Medido:
  1542 de 2707 tags (57%) vinham de **menção única** no corpo, e eram coisas
  como `linux` num artigo sobre a primeira pilha elétrica. O corpo passou a
  contar **ocorrências** em vez de termos distintos, com limiar de confiança.
  Resultado: 0 tags fracas.
- ~~Releases próximos agrupavam~~ — `Node.js 26.8.0` e `26.8.1` viravam a mesma
  história, assim como `Linux 7.3-rc3`/`rc4` e `Python 3.15.0 alpha 4`/`5`.
  Agora versões diferentes no título nunca viram o mesmo evento, por mais
  parecidos que sejam os títulos. Resultado: 0 agrupamentos falsos.
