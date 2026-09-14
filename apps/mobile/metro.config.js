const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const raizApp = __dirname
const raizMono = path.resolve(raizApp, '../..')

const config = getDefaultConfig(raizApp)

// Monorepo: o Metro precisa observar os pacotes do workspace, que são
// TypeScript puro e ficam fora de apps/mobile.
config.watchFolders = [raizMono]
config.resolver.nodeModulesPaths = [
  path.resolve(raizApp, 'node_modules'),
  path.resolve(raizMono, 'node_modules'),
]

// Necessário para resolver os subpaths "@devhub/db/node" e "@devhub/db/expo".
config.resolver.unstable_enablePackageExports = true

/**
 * Os pacotes compartilhados usam extensão .js nos imports porque precisam
 * disso para o modo NodeNext do Node e do Electron. O Metro não faz essa
 * tradução sozinho, então reescrevemos .js para .ts/.tsx aqui — sem isto,
 * nenhum arquivo de packages/ resolve no Android.
 */
const resolverPadrao = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const ehRelativo = moduleName.startsWith('./') || moduleName.startsWith('../')
  if (ehRelativo && moduleName.endsWith('.js')) {
    const semExtensao = moduleName.slice(0, -3)
    for (const ext of ['.ts', '.tsx']) {
      try {
        return context.resolveRequest(context, semExtensao + ext, platform)
      } catch {
        // tenta a próxima extensão
      }
    }
  }
  return (resolverPadrao ?? context.resolveRequest)(context, moduleName, platform)
}

module.exports = config
