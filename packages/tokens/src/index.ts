/**
 * Design tokens do Dev Hub.
 *
 * Objetos TypeScript puros, sem CSS e sem StyleSheet: o desktop os
 * converte em variáveis CSS e o mobile em StyleSheet do React Native.
 * É isso que mantém as duas interfaces visualmente idênticas apesar de
 * a camada de apresentação ser escrita duas vezes.
 */

export interface Palette {
  bg: string
  surface: string
  surfaceAlt: string
  surfaceHover: string
  border: string
  borderStrong: string
  text: string
  textMuted: string
  textFaint: string
  accent: string
  accentHover: string
  accentSoft: string
  technology: string
  programming: string
  innovation: string
  warn: string
  danger: string
  success: string
  breaking: string
}

export const light: Palette = {
  bg: '#FFFFFF',
  surface: '#F7F8FA',
  surfaceAlt: '#EEF0F4',
  surfaceHover: '#E8EBF0',
  border: '#E2E5EA',
  borderStrong: '#CBD1DA',
  text: '#0F1115',
  textMuted: '#5A6472',
  // Escurecido de #8A93A0: o valor original dava 2.72:1 sobre surfaceAlt,
  // abaixo do mínimo WCAG de 3:1. Agora dá 3.51:1 no pior fundo.
  textFaint: '#75808F',
  accent: '#2F6FED',
  accentHover: '#2559C7',
  accentSoft: '#E8F0FE',
  technology: '#2F6FED',
  programming: '#7C3AED',
  innovation: '#0E9F6E',
  warn: '#B45309',
  danger: '#B91C1C',
  success: '#047857',
  breaking: '#B91C1C',
}

export const dark: Palette = {
  bg: '#0B0D11',
  surface: '#13161C',
  surfaceAlt: '#1A1E26',
  surfaceHover: '#222732',
  border: '#242A34',
  borderStrong: '#333B48',
  text: '#E8EBF0',
  textMuted: '#9AA4B2',
  textFaint: '#6B7482',
  accent: '#5B8DEF',
  accentHover: '#7BA5F5',
  accentSoft: '#16233A',
  technology: '#5B8DEF',
  programming: '#A78BFA',
  innovation: '#34D399',
  warn: '#F59E0B',
  danger: '#F87171',
  success: '#34D399',
  breaking: '#F87171',
}

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48, huge: 64,
} as const

export const fontSize = {
  xs: 12, sm: 13, base: 14, md: 16, lg: 18, xl: 22, xxl: 28, display: 36,
} as const

export const radius = {
  sm: 6, md: 10, lg: 14, pill: 999,
} as const

export const fontFamily = {
  ui: "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
} as const

export const lineHeight = {
  tight: 1.25, normal: 1.5, relaxed: 1.7,
} as const

export type ThemeName = 'light' | 'dark'

export const palettes: Record<ThemeName, Palette> = { light, dark }

/** Cor da categoria, para o indicador visual de cada card. */
export function categoryColor(
  p: Palette,
  c: 'technology' | 'programming' | 'innovation',
): string {
  return p[c]
}

// ---------------------------------------------------------------------
// Cálculo de contraste — usado pelo teste de acessibilidade e pela UI.
// ---------------------------------------------------------------------

function canalLinear(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminancia(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * canalLinear(r) + 0.7152 * canalLinear(g) + 0.0722 * canalLinear(b)
}

/** Razão de contraste WCAG entre duas cores, de 1 a 21. */
export function contraste(a: string, b: string): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  const claro = Math.max(la, lb)
  const escuro = Math.min(la, lb)
  return (claro + 0.05) / (escuro + 0.05)
}
