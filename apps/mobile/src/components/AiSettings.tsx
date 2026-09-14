import type { EstadoIA, ModeloIA } from '@devhub/state'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { mobileApi } from '../api.js'
import { fontSize, radius, spacing, type Palette } from '../theme.js'

/**
 * Configuração da IA no Android. A chave vai para o Android Keystore via
 * expo-secure-store e nunca volta para a interface — o que a tela sabe é
 * se existe uma chave, não qual é.
 */
export function AiSettings({ p }: { p: Palette }) {
  const [estado, setEstado] = useState<EstadoIA | null>(null)
  const [modelos, setModelos] = useState<ModeloIA[]>([])
  const [chave, setChave] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function recarregar() {
    setEstado(await mobileApi.aiState())
  }

  useEffect(() => { void recarregar() }, [])

  async function salvar() {
    setOcupado(true)
    try {
      await mobileApi.setApiKey(chave)
      setChave('')
      setModelos(await mobileApi.aiModels())
      await recarregar()
    } finally {
      setOcupado(false)
    }
  }

  if (!estado) return null

  const usandoIA = estado.provider === 'gemini'
  const pct = estado.tetoDiario > 0
    ? Math.min(100, Math.round((estado.requisicoesHoje / estado.tetoDiario) * 100))
    : 0

  return (
    <View>
      <View style={e.tituloLinha}>
        <Text style={[e.secao, { color: p.text }]}>Inteligência artificial</Text>
        <View style={[e.selo, { backgroundColor: usandoIA ? `${p.accent}22` : p.surfaceAlt }]}>
          <Text style={{ color: usandoIA ? p.accent : p.textMuted, fontSize: 10, fontWeight: '600' }}>
            {usandoIA ? 'Gemini' : 'Heurística'}
          </Text>
        </View>
      </View>

      {!usandoIA && (
        <Text style={{ color: p.textMuted, fontSize: fontSize.sm, lineHeight: 19, marginBottom: spacing.lg }}>
          Sem chave, o Dev Hub usa classificação e resumo heurísticos, locais e
          sem custo. Tudo funciona — os resumos são recortes do próprio artigo.
        </Text>
      )}

      <Text style={{ color: p.textFaint, fontSize: fontSize.xs, marginBottom: spacing.sm }}>
        Chave da API do Gemini (aistudio.google.com/apikey)
        {estado.temChave ? ' · há uma chave salva' : ''}
      </Text>

      <View style={e.linha}>
        <TextInput
          style={[e.campo, { backgroundColor: p.surface, borderColor: p.border, color: p.text }]}
          value={chave}
          onChangeText={setChave}
          placeholder={estado.temChave ? '••••••  (substituir)' : 'Colar a chave'}
          placeholderTextColor={p.textFaint}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Chave da API do Gemini"
        />
        <Pressable
          style={[e.botao, { backgroundColor: p.accent }]}
          onPress={() => void salvar()}
          disabled={ocupado}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>{ocupado ? '…' : 'Salvar'}</Text>
        </Pressable>
      </View>

      {estado.temChave && modelos.length > 0 && (
        <>
          <Text style={{ color: p.textFaint, fontSize: fontSize.xs, marginTop: spacing.lg, marginBottom: spacing.sm }}>
            Modelo
          </Text>
          <View style={e.chips}>
            {modelos.slice(0, 8).map((m) => (
              <Pressable
                key={m.id}
                onPress={() => void mobileApi.setAiModel(m.id).then(recarregar)}
                style={[
                  e.chip,
                  {
                    backgroundColor: estado.model === m.id ? p.accentSoft : p.surface,
                    borderColor: estado.model === m.id ? p.accent : p.border,
                  },
                ]}
              >
                <Text style={{ color: estado.model === m.id ? p.accent : p.text, fontSize: fontSize.xs }}>
                  {m.id}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {usandoIA && (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={{ color: p.textMuted, fontSize: fontSize.xs }}>
            Hoje: {estado.requisicoesHoje} de {estado.tetoDiario} requisições ·{' '}
            {estado.tokensHoje.toLocaleString('pt-BR')} tokens
          </Text>
          <View style={[e.barra, { backgroundColor: p.surfaceAlt }]}>
            <View
              style={{
                height: '100%',
                width: `${pct}%`,
                borderRadius: radius.pill,
                backgroundColor: pct > 85 ? p.danger : p.accent,
              }}
            />
          </View>
        </View>
      )}
    </View>
  )
}

const e = StyleSheet.create({
  tituloLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  secao: { fontSize: fontSize.md, fontWeight: '600' },
  selo: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  linha: { flexDirection: 'row', gap: spacing.sm },
  campo: {
    flex: 1, borderWidth: 1, borderRadius: radius.md,
    paddingHorizontal: spacing.md, minHeight: 44, fontSize: fontSize.sm,
  },
  botao: {
    paddingHorizontal: spacing.lg, borderRadius: radius.md,
    minHeight: 44, justifyContent: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderWidth: 1, borderRadius: radius.sm, minHeight: 40, justifyContent: 'center',
  },
  barra: { height: 5, borderRadius: radius.pill, marginTop: spacing.sm, overflow: 'hidden' },
})
