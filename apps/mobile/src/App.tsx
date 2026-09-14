import { useDevHub, type Route } from '@devhub/state'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, SafeAreaView,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { hostDe, mobileApi, rotuloTipo, tempoRelativo } from './api.js'
import { AiSettings } from './components/AiSettings.js'
import { BottomNav } from './components/BottomNav.js'
import { Following } from './components/Following.js'
import { StoryCard } from './components/StoryCard.js'
import { fontSize, radius, spacing, useEhEscuro, usePalette, type Palette } from './theme.js'

const TITULOS: Record<string, string> = {
  home: 'Dev Hub',
  latest: 'Explorar',
  saved: 'Salvos',
  following: 'Seguindo',
  history: 'Histórico',
  settings: 'Perfil',
  article: '',
}

function Vazio({ p, titulo, dica, acao }: {
  p: Palette; titulo: string; dica: string; acao?: React.ReactNode
}) {
  return (
    <View style={e.vazio}>
      <Text style={[e.vazioTitulo, { color: p.text }]}>{titulo}</Text>
      <Text style={[e.vazioDica, { color: p.textMuted }]}>{dica}</Text>
      {acao}
    </View>
  )
}

function Leitor({ id, p }: { id: string; p: Palette }) {
  const [dados, setDados] = useState<Awaited<ReturnType<typeof mobileApi.article>>>(null)
  const goBack = useDevHub((s) => s.goBack)
  const toggleSaved = useDevHub((s) => s.toggleSaved)

  useEffect(() => {
    void mobileApi.article(id).then((d) => {
      setDados(d)
      if (d) void mobileApi.recordRead(id)
    })
  }, [id])

  if (!dados) {
    return <View style={e.centro}><ActivityIndicator color={p.accent} /></View>
  }

  const { article, tags } = dados

  return (
    <ScrollView contentContainerStyle={e.leitor}>
      <Pressable onPress={() => void goBack()} hitSlop={10}>
        <Text style={{ color: p.accent, fontSize: fontSize.base, marginBottom: spacing.lg }}>
          ← Voltar
        </Text>
      </Pressable>

      <Text style={[e.leitorTitulo, { color: p.text }]}>{article.title}</Text>

      <Text style={[e.leitorMeta, { color: p.textMuted }]}>
        {hostDe(article.url)}
        {article.author ? ` · ${article.author}` : ''}
        {` · ${tempoRelativo(article.publishedAt)} · ${article.readingMinutes} min`}
        {article.contentType !== 'news' ? ` · ${rotuloTipo(article.contentType)}` : ''}
      </Text>

      {tags.length > 0 && (
        <View style={e.leitorTags}>
          {tags.map((t) => (
            <View key={t} style={[e.chip, { backgroundColor: p.surfaceAlt }]}>
              <Text style={{ fontSize: 11, color: p.textMuted }}>{t}</Text>
            </View>
          ))}
        </View>
      )}

      {!!article.excerpt && (
        <View
          style={[
            e.resumoBloco,
            { backgroundColor: p.surface, borderLeftColor: p.accent, borderColor: p.border },
          ]}
        >
          <Text style={{ color: p.accent, fontSize: 10, fontWeight: '600', marginBottom: 6 }}>
            RESUMO DO FEED
          </Text>
          <Text style={{ color: p.text, fontSize: fontSize.base, lineHeight: 21 }}>
            {article.excerpt}
          </Text>
        </View>
      )}

      {/* React Native não renderiza HTML; usamos o texto já extraído na ingestão. */}
      {article.contentText.length > 200 && (
        <Text style={[e.corpo, { color: p.text }]}>{article.contentText}</Text>
      )}

      <View style={e.leitorAcoes}>
        <Pressable
          style={[e.botao, { backgroundColor: p.accent }]}
          onPress={() => void mobileApi.openExternal(article.url)}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Abrir no site ↗</Text>
        </Pressable>
        <Pressable
          style={[e.botao, { borderWidth: 1, borderColor: p.border }]}
          onPress={() => void toggleSaved(article.id)}
        >
          <Text style={{ color: p.text }}>☆ Salvar</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

export function App() {
  const rota = useDevHub((s) => s.route)
  const items = useDevHub((s) => s.items)
  const loading = useDevHub((s) => s.loading)
  const ingesting = useDevHub((s) => s.ingesting)
  const themePref = useDevHub((s) => s.themePref)
  const searchResults = useDevHub((s) => s.searchResults)
  const searchQuery = useDevHub((s) => s.searchQuery)

  const init = useDevHub((s) => s.init)
  const navigate = useDevHub((s) => s.navigate)
  const runIngest = useDevHub((s) => s.runIngest)
  const toggleSaved = useDevHub((s) => s.toggleSaved)
  const setSearchQuery = useDevHub((s) => s.setSearchQuery)
  const setThemePref = useDevHub((s) => s.setThemePref)

  const p = usePalette(themePref)
  const escuro = useEhEscuro(themePref)
  const [pronto, setPronto] = useState(false)

  useEffect(() => { void init(mobileApi).then(() => setPronto(true)) }, [init])

  function navegar(r: Route) {
    if (r.name !== 'latest') setSearchQuery('')
    void navigate(r)
  }

  const lista = rota.name === 'latest' && searchQuery.trim().length >= 2
    ? searchResults
    : items

  return (
    <SafeAreaView style={[e.tela, { backgroundColor: p.bg }]}>
      <StatusBar style={escuro ? 'light' : 'dark'} />

      {rota.name !== 'article' && (
        <View style={[e.cabecalho, { borderBottomColor: p.border }]}>
          <Text style={[e.cabecalhoTitulo, { color: p.text }]}>
            {TITULOS[rota.name] ?? 'Dev Hub'}
          </Text>
          {ingesting && <ActivityIndicator size="small" color={p.accent} />}
        </View>
      )}

      {rota.name === 'latest' && (
        <TextInput
          style={[
            e.busca,
            { backgroundColor: p.surface, borderColor: p.border, color: p.text },
          ]}
          value={searchQuery}
          onChangeText={(t) => void setSearchQuery(t)}
          placeholder="Buscar tecnologia, linguagem, empresa…"
          placeholderTextColor={p.textFaint}
          returnKeyType="search"
          accessibilityLabel="Campo de busca"
        />
      )}

      <View style={e.conteudo}>
        {!pronto ? (
          <View style={e.centro}><ActivityIndicator color={p.accent} /></View>
        ) : rota.name === 'article' ? (
          <Leitor id={rota.id} p={p} />
        ) : rota.name === 'following' ? (
          <Following p={p} />
        ) : rota.name === 'settings' ? (
          <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
            <Text style={[e.secao, { color: p.text }]}>Tema</Text>
            <View style={e.segmentado}>
              {(['system', 'light', 'dark'] as const).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => void setThemePref(t)}
                  style={[
                    e.segBotao,
                    {
                      backgroundColor: themePref === t ? p.accent : p.surface,
                      borderColor: p.border,
                    },
                  ]}
                >
                  <Text style={{ color: themePref === t ? '#fff' : p.textMuted }}>
                    {t === 'system' ? 'Sistema' : t === 'light' ? 'Claro' : 'Escuro'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[e.secao, { color: p.text, marginTop: spacing.xxl }]}>Conteúdo</Text>
            <Pressable
              style={[e.botao, { backgroundColor: p.accent, alignSelf: 'flex-start' }]}
              onPress={() => void runIngest()}
              disabled={ingesting}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>
                {ingesting ? 'Buscando…' : 'Buscar notícias agora'}
              </Text>
            </Pressable>
            <Text style={{ color: p.textFaint, fontSize: fontSize.xs, marginTop: spacing.sm }}>
              Por padrão só baixa o que mudou desde a última vez.
            </Text>

            <View style={{ marginTop: spacing.xxl }}>
              <AiSettings p={p} />
            </View>
          </ScrollView>
        ) : lista.length === 0 && !loading ? (
          <Vazio
            p={p}
            titulo={rota.name === 'saved' ? 'Nada salvo ainda' : 'Feed vazio'}
            dica={
              rota.name === 'saved'
                ? 'Toque na estrela de qualquer card para guardar o artigo aqui.'
                : 'Busque as notícias das 37 fontes configuradas.'
            }
            acao={rota.name !== 'saved' ? (
              <Pressable
                style={[e.botao, { backgroundColor: p.accent, marginTop: spacing.lg }]}
                onPress={() => void runIngest()}
                disabled={ingesting}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>
                  {ingesting ? 'Buscando…' : 'Buscar agora'}
                </Text>
              </Pressable>
            ) : undefined}
          />
        ) : (
          <FlatList
            data={lista}
            keyExtractor={(i) => i.article.id}
            contentContainerStyle={{ padding: spacing.lg }}
            // Virtualização: mantém a rolagem fluida com milhares de artigos.
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            removeClippedSubviews
            refreshControl={
              <RefreshControl
                refreshing={ingesting}
                onRefresh={() => void runIngest()}
                tintColor={p.accent}
                colors={[p.accent]}
              />
            }
            renderItem={({ item }) => (
              <StoryCard
                item={item}
                p={p}
                onAbrir={() => void navigate({ name: 'article', id: item.article.id })}
                onSalvar={() => void toggleSaved(item.article.id)}
              />
            )}
          />
        )}
      </View>

      {rota.name !== 'article' && (
        <BottomNav rotaAtual={rota} p={p} onNavegar={navegar} />
      )}
    </SafeAreaView>
  )
}

const e = StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { flex: 1 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cabecalho: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1,
  },
  cabecalhoTitulo: { fontSize: fontSize.xl, fontWeight: '700', letterSpacing: -0.3 },
  busca: {
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: 10,
    borderWidth: 1, borderRadius: radius.md, fontSize: fontSize.base,
  },
  vazio: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: spacing.xxl, gap: spacing.sm,
  },
  vazioTitulo: { fontSize: fontSize.md, fontWeight: '600', textAlign: 'center' },
  vazioDica: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: 20 },
  leitor: { padding: spacing.lg, paddingBottom: spacing.huge },
  leitorTitulo: { fontSize: 25, fontWeight: '700', lineHeight: 31, marginBottom: spacing.md },
  leitorMeta: { fontSize: fontSize.sm, marginBottom: spacing.lg },
  leitorTags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  resumoBloco: {
    padding: spacing.lg, borderWidth: 1, borderLeftWidth: 3,
    borderRadius: radius.md, marginBottom: spacing.xl,
  },
  corpo: { fontSize: fontSize.md, lineHeight: 25 },
  leitorAcoes: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xxl, flexWrap: 'wrap' },
  botao: {
    paddingHorizontal: spacing.xl, paddingVertical: 11,
    borderRadius: radius.md, minHeight: 44, justifyContent: 'center',
  },
  secao: { fontSize: fontSize.md, fontWeight: '600', marginBottom: spacing.md },
  segmentado: { flexDirection: 'row', gap: spacing.sm },
  segBotao: {
    paddingHorizontal: spacing.lg, paddingVertical: 9,
    borderWidth: 1, borderRadius: radius.sm, minHeight: 44, justifyContent: 'center',
  },
})
