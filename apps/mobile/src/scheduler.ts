import { decidirIngestao, msAteProximaJanela } from '@devhub/core'
import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'

export const TAREFA_INGESTAO = 'devhub-ingestao-diaria'

/**
 * Ingestão automática no Android.
 *
 * Ressalva honesta: **o Android não garante horário exato.** O sistema
 * decide quando acordar a tarefa, levando em conta bateria, rede e o
 * padrão de uso do aparelho. O que o app garante é que, na primeira
 * oportunidade depois das 5h, a ingestão roda — e que ela roda de novo
 * assim que você abrir o app, se a janela tiver passado sem ela.
 *
 * O intervalo pedido é de 3h; o Android normalmente entrega bem menos
 * frequência que isso. A decisão de ingerir ou não continua sendo do
 * decidirIngestao, que só libera depois da janela das 5h.
 */
const INTERVALO_MINIMO_MINUTOS = 180

export type RodarIngestao = () => Promise<{ itensNovos: number }>
export type LerUltimaIngestao = () => number | null

let rodarIngestao: RodarIngestao | null = null
let lerUltima: LerUltimaIngestao | null = null

TaskManager.defineTask(TAREFA_INGESTAO, async () => {
  if (!rodarIngestao || !lerUltima) return BackgroundTask.BackgroundTaskResult.Success

  const decisao = decidirIngestao(Date.now(), lerUltima())
  if (!decisao.deveIngerir) return BackgroundTask.BackgroundTaskResult.Success

  try {
    await rodarIngestao()
    return BackgroundTask.BackgroundTaskResult.Success
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

export async function registrarTarefaDeFundo(
  rodar: RodarIngestao,
  ultima: LerUltimaIngestao,
): Promise<void> {
  rodarIngestao = rodar
  lerUltima = ultima

  const jaRegistrada = await TaskManager.isTaskRegisteredAsync(TAREFA_INGESTAO)
  if (jaRegistrada) return

  try {
    await BackgroundTask.registerTaskAsync(TAREFA_INGESTAO, {
      minimumInterval: INTERVALO_MINIMO_MINUTOS,
    })
  } catch {
    // Sem permissão de execução em segundo plano o app segue funcionando:
    // a verificação ao abrir cobre o caso.
  }
}

export async function cancelarTarefaDeFundo(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(TAREFA_INGESTAO)) {
    await BackgroundTask.unregisterTaskAsync(TAREFA_INGESTAO)
  }
}

/**
 * Verificação ao abrir o app. É o que garante o feed atualizado mesmo
 * quando o Android nunca acordou a tarefa de fundo durante a noite.
 */
export async function verificarAoAbrir(
  rodar: RodarIngestao,
  ultima: number | null,
): Promise<boolean> {
  if (!decidirIngestao(Date.now(), ultima).deveIngerir) return false
  await rodar()
  return true
}

export { msAteProximaJanela }
