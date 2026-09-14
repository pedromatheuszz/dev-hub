import {
  PREFERENCIAS_PADRAO, selecionarNotificacoes,
  type CandidataNotificacao, type PreferenciasNotificacao, type Story,
} from '@devhub/core'
import * as Notifications from 'expo-notifications'

/**
 * Notificações locais no Android. As regras de o que notificar são as
 * mesmas do desktop, vindas de packages/core — aqui só ficam a permissão
 * do sistema e a API do Expo.
 *
 * São notificações LOCAIS, não push: não há servidor, então nada sai do
 * aparelho. Elas disparam depois de uma ingestão em segundo plano.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

export async function pedirPermissao(): Promise<boolean> {
  const atual = await Notifications.getPermissionsAsync()
  if (atual.granted) return true
  const pedido = await Notifications.requestPermissionsAsync()
  return pedido.granted
}

export interface EstadoNotifMobile {
  dia: string
  enviadasHoje: number
  ultimaEnvioAt: number | null
  jaNotificados: string[]
}

export function estadoVazio(agora: number): EstadoNotifMobile {
  return {
    dia: new Date(agora).toISOString().slice(0, 10),
    enviadasHoje: 0,
    ultimaEnvioAt: null,
    jaNotificados: [],
  }
}

export interface ResultadoNotificacao {
  enviadas: number
  estado: EstadoNotifMobile
}

/**
 * Dispara o que as regras aprovarem e devolve o estado atualizado, para
 * quem chama persistir. Função sem efeito colateral de armazenamento.
 */
export async function dispararNotificacoes(
  candidatas: Array<{ story: Story; articleId: string; tagsSeguidas: string[] }>,
  prefs: PreferenciasNotificacao,
  estadoAnterior: EstadoNotifMobile,
  agora: number,
): Promise<ResultadoNotificacao> {
  const dia = new Date(agora).toISOString().slice(0, 10)
  const estado = estadoAnterior.dia === dia
    ? estadoAnterior
    : { ...estadoVazio(agora), jaNotificados: estadoAnterior.jaNotificados.slice(-200) }

  if (!prefs.ativadas) return { enviadas: 0, estado }
  if (!(await pedirPermissao())) return { enviadas: 0, estado }

  const escolhidas = selecionarNotificacoes(
    candidatas as CandidataNotificacao[],
    prefs,
    {
      enviadasHoje: estado.enviadasHoje,
      ultimaEnvioAt: estado.ultimaEnvioAt,
      jaNotificados: new Set(estado.jaNotificados),
    },
    agora,
  )

  for (const n of escolhidas) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: n.titulo,
        body: n.corpo,
        data: { articleId: n.articleId },
      },
      trigger: null, // imediata
    })
  }

  if (escolhidas.length === 0) return { enviadas: 0, estado }

  return {
    enviadas: escolhidas.length,
    estado: {
      dia,
      enviadasHoje: estado.enviadasHoje + escolhidas.length,
      ultimaEnvioAt: agora,
      jaNotificados: [
        ...estado.jaNotificados,
        ...escolhidas.map((n) => n.storyId),
      ].slice(-200),
    },
  }
}

export { PREFERENCIAS_PADRAO }
