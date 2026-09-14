import type { Route } from '@devhub/state'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { fontSize, spacing, type Palette } from '../theme.js'

/** Navegação inferior do spec §11: Home | Explore | Saved | Following | Profile. */
const ABAS: Array<{ rota: Route; icone: string; texto: string }> = [
  { rota: { name: 'home' }, icone: '◈', texto: 'Início' },
  { rota: { name: 'latest' }, icone: '⌕', texto: 'Explorar' },
  { rota: { name: 'saved' }, icone: '★', texto: 'Salvos' },
  { rota: { name: 'following' }, icone: '◎', texto: 'Seguindo' },
  { rota: { name: 'settings' }, icone: '⚙', texto: 'Perfil' },
]

interface Props {
  rotaAtual: Route
  p: Palette
  onNavegar(r: Route): void
}

export function BottomNav({ rotaAtual, p, onNavegar }: Props) {
  return (
    <View style={[e.barra, { backgroundColor: p.surface, borderTopColor: p.border }]}>
      {ABAS.map((a) => {
        const ativo = rotaAtual.name === a.rota.name
        return (
          <Pressable
            key={a.texto}
            style={e.aba}
            onPress={() => onNavegar(a.rota)}
            android_ripple={{ color: p.surfaceHover, borderless: true }}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativo }}
            accessibilityLabel={a.texto}
          >
            <Text style={{ fontSize: 18, color: ativo ? p.accent : p.textFaint }}>
              {a.icone}
            </Text>
            <Text
              style={[
                e.rotulo,
                { color: ativo ? p.accent : p.textFaint, fontWeight: ativo ? '600' : '400' },
              ]}
            >
              {a.texto}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const e = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  aba: {
    // 44dp mínimo de alvo de toque (spec §13).
    flex: 1, alignItems: 'center', justifyContent: 'center',
    minHeight: 48, gap: 2,
  },
  rotulo: { fontSize: fontSize.xs },
})
