import { join } from 'node:path'
import { BrowserWindow, app, nativeTheme, shell } from 'electron'
import { abrirBanco, fecharBanco } from './db.js'
import { registrarIpc } from './ipc.js'

const ehDev = !app.isPackaged

// Define antes de qualquer app.getPath('userData'): o nome do pacote é
// "@devhub/desktop", que viraria um diretório com barra no APPDATA.
app.setName('Dev Hub')

function criarJanela(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 720,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0B0D11' : '#FFFFFF',
    title: 'Dev Hub',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      // Spec §9: o renderer não alcança o Node. Toda ponte passa pelo IPC.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  })

  // Evita o flash de janela em branco durante a montagem do React.
  win.once('ready-to-show', () => win.show())

  // Qualquer tentativa de abrir janela vai para o navegador do sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // E qualquer navegação para fora da app também.
  win.webContents.on('will-navigate', (e, url) => {
    const permitida = ehDev
      ? url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost')
      : url.startsWith('file://')
    if (!permitida) {
      e.preventDefault()
      if (url.startsWith('https://') || url.startsWith('http://')) {
        void shell.openExternal(url)
      }
    }
  })

  const urlDev = process.env['ELECTRON_RENDERER_URL']
  if (ehDev && urlDev) void win.loadURL(urlDev)
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))

  return win
}

/**
 * Teste de fumaça: sobe o app inteiro (banco, IPC, janela, renderer) e sai
 * com código 0 se tudo carregou, ou 1 com o motivo. Roda em CI sem precisar
 * de olho humano, e é o que prova que o preload e a CSP não quebraram.
 */
function rodarSmokeTest(win: BrowserWindow): void {
  const limite = setTimeout(() => {
    console.error('SMOKE FALHOU: renderer não carregou em 30s')
    app.exit(1)
  }, 30_000)

  win.webContents.on('did-fail-load', (_e, codigo, desc) => {
    clearTimeout(limite)
    console.error(`SMOKE FALHOU: did-fail-load ${codigo} ${desc}`)
    app.exit(1)
  })

  win.webContents.on('did-finish-load', () => {
    void win.webContents
      .executeJavaScript(`(() => {
        const raiz = document.getElementById('root')
        const itens = [...document.querySelectorAll('.nav-item .nav-text')]
          .map((e) => e.textContent)
        return {
          montou: !!raiz && raiz.children.length > 0,
          temPonte: typeof window.devhub === 'object' && window.devhub !== null,
          temSidebar: !!document.querySelector('.sidebar'),
          temDezItensDeNav: itens.length === 10,
          temConfiguracoes: itens.includes('Configurações'),
          temBuscaGlobal: !!document.querySelector('.search-trigger'),
          navItens: itens,
          titulo: document.querySelector('.topbar h1')?.textContent ?? null,
        }
      })()`)
      .then((r: Record<string, unknown>) => {
        clearTimeout(limite)
        const falhas = Object.entries(r)
          .filter(([k, v]) => k.startsWith('tem') || k === 'montou' ? !v : false)
          .map(([k]) => k)
        if (falhas.length > 0) {
          console.error('SMOKE FALHOU:', falhas.join(', '), JSON.stringify(r))
          app.exit(1)
        } else {
          console.log('SMOKE OK:', JSON.stringify(r))
          app.exit(0)
        }
      })
      .catch((e: unknown) => {
        clearTimeout(limite)
        console.error('SMOKE FALHOU ao avaliar:', e)
        app.exit(1)
      })
  })
}

/** Captura a janela em PNG e sai. Permite revisar a UI sem olho humano. */
function capturarTela(win: BrowserWindow, destino: string, rota?: string): void {
  win.webContents.once('did-finish-load', () => {
    const navegar = rota
      ? win.webContents.executeJavaScript(
        `[...document.querySelectorAll('.nav-item .nav-text')]
           .find((e) => e.textContent === ${JSON.stringify(rota)})
           ?.closest('button')?.click()`,
      )
      : Promise.resolve()

    // Navega primeiro, depois espera o React re-renderizar, só então fotografa.
    void navegar
      .then(() => new Promise((r) => setTimeout(r, rota ? 3000 : 2500)))
      .then(() => win.webContents.capturePage())
      .then(async (img) => {
        const { writeFile } = await import('node:fs/promises')
        await writeFile(destino, img.toPNG())
        console.log(`SCREENSHOT OK: ${destino}`)
        app.exit(0)
      })
      .catch((e: unknown) => {
        console.error('SCREENSHOT FALHOU:', e)
        app.exit(1)
      })
  })
}

app.whenReady().then(() => {
  registrarIpc(abrirBanco())
  const win = criarJanela()

  if (process.argv.includes('--smoke')) rodarSmokeTest(win)

  const iShot = process.argv.indexOf('--screenshot')
  if (iShot !== -1) {
    const destino = process.argv[iShot + 1]
    const iRota = process.argv.indexOf('--rota')
    if (destino) capturarTela(win, destino, iRota !== -1 ? process.argv[iRota + 1] : undefined)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela()
  })
})

app.on('window-all-closed', () => {
  fecharBanco()
  if (process.platform !== 'darwin') app.quit()
})
