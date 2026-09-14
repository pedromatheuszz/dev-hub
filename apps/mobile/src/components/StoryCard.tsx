import type { FeedItem } from '@devhub/state'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { hostDe, rotuloCategoria, rotuloTipo, tempoRelativo } from '../api.js'
import { fontSize, radius, spacing, type Palette } from '../theme.js'

interface Props {
  item: FeedItem
  p: Palette
  onAbrir(): void
  onSalvar(): void
}

export function StoryCard({ item, p, onAbrir, onSalvar }: Props) {
  const { story, article, tags, saved, traducao } = item
  const titulo = traducao?.title ?? story.canonicalTitle
  const resumo = traducao?.excerpt || article.excerpt
  const corCategoria = p[story.category]

  return (
    <Pressable
      onPress={onAbrir}
      android_ripple={{ color: p.surfaceHover }}
      style={({ pressed }) => [
        e.card,
        {
          backgroundColor: pressed ? p.surfaceHover : p.surface,
          borderColor: p.border,
          borderLeftColor: corCategoria,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={story.canonicalTitle}
    >
      <View style={e.linhaTopo}>
        <View
          style={[e.chip, { backgroundColor: `${corCategoria}22` }]}
        >
          <Text style={[e.chipTexto, { color: corCategoria }]}>
            {rotuloCategoria(story.category)}
          </Text>
        </View>

        {story.isBreaking && (
          <View style={[e.chip, { backgroundColor: `${p.breaking}22` }]}>
            <Text style={[e.chipTexto, { color: p.breaking }]}>ÚLTIMA HORA</Text>
          </View>
        )}

        {article.contentType !== 'news' && (
          <View style={[e.chip, { borderWidth: 1, borderColor: p.borderStrong }]}>
            <Text style={[e.chipTexto, { color: p.textFaint }]}>
              {rotuloTipo(article.contentType)}
            </Text>
          </View>
        )}

        {traducao && (
          <View style={[e.chip, { backgroundColor: `${p.innovation}22` }]}>
            <Text style={[e.chipTexto, { color: p.innovation }]}>⇄ TRADUZIDO</Text>
          </View>
        )}

        <View style={e.espacador} />

        <Pressable
          onPress={onSalvar}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Remover dos salvos' : 'Salvar'}
        >
          <Text style={{ color: saved ? p.accent : p.textFaint, fontSize: 17 }}>
            {saved ? '★' : '☆'}
          </Text>
        </Pressable>
      </View>

      <Text style={[e.titulo, { color: p.text }]} numberOfLines={3}>
        {titulo}
      </Text>

      {!!resumo && (
        <Text style={[e.resumo, { color: p.textMuted }]} numberOfLines={2}>
          {resumo}
        </Text>
      )}

      <View style={e.meta}>
        <Text style={[e.metaTexto, { color: p.textFaint }]}>
          {hostDe(article.url)} · {tempoRelativo(article.publishedAt)} ·{' '}
          {article.readingMinutes} min
          {story.articleCount > 1 ? ` · ${story.articleCount} fontes` : ''}
        </Text>
      </View>

      {tags.length > 0 && (
        <View style={e.tags}>
          {tags.slice(0, 3).map((t) => (
            <View key={t} style={[e.chip, { backgroundColor: p.surfaceAlt }]}>
              <Text style={[e.chipTag, { color: p.textMuted }]}>{t}</Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  )
}

const e = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  espacador: { flex: 1 },
  chip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  chipTexto: { fontSize: 10, fontWeight: '600', letterSpacing: 0.2 },
  chipTag: { fontSize: 10, fontWeight: '400' },
  titulo: { fontSize: fontSize.md, fontWeight: '600', lineHeight: 21 },
  resumo: { fontSize: fontSize.sm, lineHeight: 19 },
  meta: { marginTop: 2 },
  metaTexto: { fontSize: fontSize.xs },
  tags: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
})
