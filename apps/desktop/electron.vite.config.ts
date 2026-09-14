import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

/**
 * Os pacotes do workspace são TypeScript puro, com `main` apontando para
 * src/index.ts. Externalizá-los faria o Electron tentar carregar .ts em
 * runtime e quebrar na resolução dos imports .js. Eles precisam entrar no
 * bundle; só as dependências de verdade (node_modules) ficam externas.
 */
const PACOTES_DO_WORKSPACE = [
  '@devhub/core', '@devhub/db', '@devhub/tokens', '@devhub/state',
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: PACOTES_DO_WORKSPACE })],
    build: {
      rollupOptions: { input: resolve(import.meta.dirname, 'src/main/index.ts') },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(import.meta.dirname, 'src/preload/index.ts'),
        // CommonJS: o preload roda em sandbox, que não aceita ESM.
        output: { format: 'cjs', entryFileNames: 'index.cjs' },
      },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      // Absoluto: com `root` apontando para src/renderer, um outDir relativo
      // resolveria a partir de lá e o bundle cairia na raiz do repositório.
      outDir: resolve(import.meta.dirname, 'out/renderer'),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(import.meta.dirname, 'src/renderer/index.html'),
      },
    },
  },
})
