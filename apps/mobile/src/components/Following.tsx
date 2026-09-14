import { useDevHub } from '@devhub/state'
import { useEffect } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { rotuloCategoria } from '../api.js'
import { fontSize, radius, spacing, type Palette } from '../theme.js'

const ROTULO_KIND: Record<string, string> = {
  language: 'Linguagens',
  framework: 'Frameworks e ferramentas',
  hardware: 'Hardware',
  company: 'Empresas',
  topic: 'Tópicos',
  product: 'Produtos',
}

const ORDEM_KIND = ['language', 'framework', 'hardware', 'company', 'topic', 'product']
const CATEGORIAS = ['technology', 'programming', 'innovation'] as const

export function Following({ p }: { p: Palette }) {
  const suggested = useDevHub((s) => s.suggested)
  const loading = useDevHub((s) => s.loadingSuggested)
  const loadSuggested = useDevHub((s) => s.loadSuggested)
  const toggleFollow = useDevHub((s) => s.toggleFollow)

  useEffect(() => { void loadSuggested() }, [loadSuggested])

  if (loading && suggested.length === 0) {
    return <View style={e.centro}><ActivityIndicator color={p.accent} /></View>
  }

  if (suggested.length === 0) {
    return (
      <View style={e.centro}>
        <Text style={{ color: p.text, fontWeight: '600', marginBottom: spacing.sm }}>
          Nada para seguir ainda
        </Text>
        <Text style={{ color: p.textMuted, textAlign: 'center', lineHeight: 20 }}>
          Busque as notícias primeiro. As sugestões vêm das tecnologias que
          aparecem nos seus artigos.
        </Text>
      </View>
    )
  }

  const seguindo = suggested.filter((t) => t.seguindo).length

  const porKind = new Map<string, typeof suggested>()
  for (const t of suggested) {
    const lista = porKind.get(t.kind)
    if (lista) lista.push(t)
    else porKind.set(t.kind, [t])
  }

  function chip(chave: string, nome: string, ativo: boolean, onPress: () => void, contagem?: number) {
    return (
      <Pressable
        key={chave}
        onPress={onPress}
        android_ripple={{ color: p.surfaceHover }}
        accessibilityRole="button"
        accessibilityState={{ selected: ativo }}
        style={[
          e.chip,
          {
            backgroundColor: ativo ? p.accentSoft : p.surface,
            borderColor: ativo ? p.accent : p.border,
          },
        ]}
      >
        <Text style={{ color: ativo ? p.accent : p.text, fontWeight: '600', fontSize: fontSize.sm }}>
          {ativo ? '✓ ' : '+ '}{nome}
        </Text>
        {contagem !== undefined && (
          <Text style={{ color: p.textFaint, fontSize: 10 }}>{contagem}</Text>
        )}
      </Pressable>
    )
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge }}>
      <View style={[e.aviso, { backgroundColor: p.surface, borderColor: p.border }]}>
        <Text style={{ color: p.textMuted, fontSize: fontSize.sm, lineHeight: 19 }}>
          {seguindo === 0
            ? 'O que você seguir sobe no feed pelo fator de afinidade do ranking.'
            : `Seguindo ${seguindo} ${seguindo === 1 ? 'tópico' : 'tópicos'}. Eles sobem no seu feed.`}
        </Text>
      </View>

      <Text style={[e.secao, { color: p.text }]}>Categorias</Text>
      <View style={e.linha}>
        {CATEGORIAS.map((c) =>
          chip(c, rotuloCategoria(c), false, () => void toggleFollow('category', c)))}
      </View>

      {ORDEM_KIND.filter((k) => porKind.has(k)).map((kind) => (
        <View key={kind}>
          <Text style={[e.secao, { color: p.text }]}>{ROTULO_KIND[kind] ?? kind}</Text>
          <View style={e.linha}>
            {porKind.get(kind)!.map((t) =>
              chip(t.slug, t.name, t.seguindo, () => void toggleFollow('tag', t.slug), t.artigos))}
          </View>
        </View>
      ))}
    </ScrollView>
  )
}

const e = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  aviso: {
    padding: spacing.lg, borderWidth: 1, borderRadius: radius.md,
    marginBottom: spacing.xl,
  },
  secao: {
    fontSize: fontSize.md, fontWeight: '600',
    marginTop: spacing.lg, marginBottom: spacing.md,
  },
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: 10,
    borderWidth: 1, borderRadius: radius.md,
    minHeight: 44,
  },
})
