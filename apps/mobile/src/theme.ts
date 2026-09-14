import type { ThemePref } from '@devhub/state'
import { fontSize, palettes, radius, spacing, type Palette } from '@devhub/tokens'
import { useColorScheme } from 'react-native'

export { fontSize, radius, spacing }
export type { Palette }

/**
 * Mesma paleta do desktop, vinda de packages/tokens. É o que mantém as
 * duas interfaces idênticas apesar de o código de tela ser separado.
 */
export function usePalette(pref: ThemePref): Palette {
  const doSistema = useColorScheme()
  const nome = pref === 'system' ? (doSistema === 'dark' ? 'dark' : 'light') : pref
  return palettes[nome]
}

export function useEhEscuro(pref: ThemePref): boolean {
  const doSistema = useColorScheme()
  return pref === 'system' ? doSistema === 'dark' : pref === 'dark'
}
