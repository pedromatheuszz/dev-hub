import {
  fontFamily, fontSize, lineHeight, palettes, radius, spacing, type ThemeName,
} from '@devhub/tokens'
import type { ThemePref } from '@devhub/state'

/**
 * Converte os tokens em variáveis CSS. É a única ponte entre
 * packages/tokens e o CSS — nenhuma cor é escrita à mão no styles.css.
 */
export function aplicarTema(pref: ThemePref, fontScale: number): ThemeName {
  const escuroDoSistema = window.matchMedia('(prefers-color-scheme: dark)').matches
  const nome: ThemeName = pref === 'system' ? (escuroDoSistema ? 'dark' : 'light') : pref
  const p = palettes[nome]
  const r = document.documentElement.style

  r.setProperty('--bg', p.bg)
  r.setProperty('--surface', p.surface)
  r.setProperty('--surface-alt', p.surfaceAlt)
  r.setProperty('--surface-hover', p.surfaceHover)
  r.setProperty('--border', p.border)
  r.setProperty('--border-strong', p.borderStrong)
  r.setProperty('--text', p.text)
  r.setProperty('--text-muted', p.textMuted)
  r.setProperty('--text-faint', p.textFaint)
  r.setProperty('--accent', p.accent)
  r.setProperty('--accent-hover', p.accentHover)
  r.setProperty('--accent-soft', p.accentSoft)
  r.setProperty('--technology', p.technology)
  r.setProperty('--programming', p.programming)
  r.setProperty('--innovation', p.innovation)
  r.setProperty('--breaking', p.breaking)
  r.setProperty('--danger', p.danger)
  r.setProperty('--success', p.success)

  for (const [k, v] of Object.entries(spacing)) r.setProperty(`--sp-${k}`, `${v}px`)
  for (const [k, v] of Object.entries(fontSize)) r.setProperty(`--fs-${k}`, `${v}px`)
  for (const [k, v] of Object.entries(radius)) r.setProperty(`--r-${k}`, `${v}px`)
  for (const [k, v] of Object.entries(lineHeight)) r.setProperty(`--lh-${k}`, String(v))

  r.setProperty('--font-ui', fontFamily.ui)
  r.setProperty('--font-mono', fontFamily.mono)
  r.setProperty('--font-scale', String(fontScale))

  document.documentElement.dataset['theme'] = nome
  document.documentElement.style.colorScheme = nome
  return nome
}
