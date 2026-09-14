import type { Article } from '@devhub/core'
import { useDevHub } from '@devhub/state'
import { useEffect, useState } from 'react'
import { api, hostDe, rotuloIdioma, rotuloTipo, tempoRelativo } from '../api.js'

/**
 * Leitor de artigo. O conteúdo já vem sanitizado por allowlist desde a
 * ingestão (spec §9), então é seguro renderizá-lo — mas quando não há
 * corpo, mostramos o resumo e mandamos o leitor para a fonte original.
 */
/** A tradução volta como texto puro; separamos em parágrafos para ler melhor. */
function quebrarParagrafos(texto: string): string[] {
  return texto
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

type DadosArtigo = {
  article: Article
  tags: string[]
  traducao?: {
    title: string; excerpt: string; sourceLang: string
    model: string; contentText: string | null
  }
}

export function Reader({ id }: { id: string }) {
  const [dados, setDados] = useState<DadosArtigo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [verOriginal, setVerOriginal] = useState(false)
  const [traduzindo, setTraduzindo] = useState(false)
  const goBack = useDevHub((s) => s.goBack)
  const toggleSaved = useDevHub((s) => s.toggleSaved)
  const items = useDevHub((s) => s.items)
  const salvo = items.find((i) => i.article.id === id)?.saved ?? false

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    setVerOriginal(false)

    void api.article(id).then(async (d) => {
      if (!vivo) return
      setDados(d as DadosArtigo | null)
      setCarregando(false)
      if (!d) return
      void api.recordRead(id)

      // O corpo completo é traduzido sob demanda, ao abrir: o lote de
      // ingestão traduz só título e resumo, que é o que o feed mostra.
      const precisa = d.article.lang !== 'pt' && d.article.lang !== 'desconhecido'
      const jaTem = (d as DadosArtigo).traducao?.contentText != null
      if (precisa && !jaTem) {
        setTraduzindo(true)
        const ok = await api.translateArticle(id)
        if (!vivo) return
        if (ok) setDados(await api.article(id) as DadosArtigo | null)
        setTraduzindo(false)
      }
    })
    return () => { vivo = false }
  }, [id])

  if (carregando) {
    return <div className="reader"><div className="skeleton" style={{ height: 320 }} /></div>
  }

  if (!dados) {
    return (
      <div className="empty">
        <div className="empty-icon" aria-hidden="true">?</div>
        <div className="empty-title">Artigo não encontrado</div>
        <button className="btn" onClick={() => void goBack()}>Voltar</button>
      </div>
    )
  }

  const { article, tags, traducao } = dados
  const temCorpo = (article.contentHtml ?? '').length > 200

  const mostrandoTraducao = traducao !== undefined && !verOriginal
  const titulo = mostrandoTraducao ? traducao.title : article.title
  const resumo = mostrandoTraducao ? (traducao.excerpt || article.excerpt) : article.excerpt
  const corpoTraduzido = mostrandoTraducao ? traducao.contentText : null

  return (
    <article className="reader">
      <button className="btn btn-ghost reader-back" onClick={() => void goBack()}>
        ← Voltar
      </button>

      {traducao && (
        <div className="aviso-traducao">
          <span aria-hidden="true">⇄</span>
          <span>
            <strong>Tradução automática</strong> do {rotuloIdioma(traducao.sourceLang)}
            {traducao.model ? ` por ${traducao.model}` : ''}. A fonte original
            está em {rotuloIdioma(traducao.sourceLang)} — em caso de dúvida,
            confira no site.
          </span>
          <button className="btn btn-ghost" onClick={() => setVerOriginal((v) => !v)}>
            {verOriginal ? 'Ver tradução' : 'Ver original'}
          </button>
        </div>
      )}

      {!traducao && traduzindo && (
        <div className="aviso-traducao">
          <span className="spin" aria-hidden="true">◌</span>
          <span>Traduzindo…</span>
        </div>
      )}

      <h1>{titulo}</h1>

      <div className="reader-meta">
        <strong>{hostDe(article.url)}</strong>
        {article.author && (
          <>
            <span className="dot-sep">·</span>
            <span>{article.author}</span>
          </>
        )}
        <span className="dot-sep">·</span>
        <span>{tempoRelativo(article.publishedAt)}</span>
        <span className="dot-sep">·</span>
        <span>{article.readingMinutes} min de leitura</span>
        {article.contentType !== 'news' && (
          <span className="chip chip-type">{rotuloTipo(article.contentType)}</span>
        )}
      </div>

      {article.imageUrl && (
        <img
          className="reader-hero"
          src={article.imageUrl}
          alt=""
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      )}

      {tags.length > 0 && (
        <div className="reader-tags">
          {tags.map((t) => <span key={t} className="chip chip-tag">{t}</span>)}
        </div>
      )}

      {resumo && (
        <div className="reader-summary">
          <div className="reader-summary-head">
            {/* Spec §6.5: conteúdo derivado automaticamente é sempre rotulado. */}
            <span className="chip chip-ai">Resumo do feed</span>
            {mostrandoTraducao && <span className="chip chip-trad">⇄ Traduzido</span>}
          </div>
          <p style={{ margin: 0 }}>{resumo}</p>
        </div>
      )}

      {corpoTraduzido ? (
        // Tradução é texto puro, não HTML: nada a sanitizar, e nada de
        // dangerouslySetInnerHTML com conteúdo vindo do modelo.
        <div className="reader-body">
          {quebrarParagrafos(corpoTraduzido).map((p, i) => <p key={i}>{p}</p>)}
        </div>
      ) : temCorpo ? (
        <div
          className="reader-body"
          // Sanitizado por allowlist na ingestão: script, style, atributos de
          // evento e href javascript: já foram removidos antes de chegar aqui.
          dangerouslySetInnerHTML={{ __html: article.contentHtml! }}
        />
      ) : (
        <div className="banner banner-info">
          <span aria-hidden="true">ℹ</span>
          <span>
            Esta fonte publica apenas um resumo no feed. Leia o artigo completo
            no site original.
          </span>
        </div>
      )}

      <div className="reader-actions">
        <button
          className="btn btn-primary"
          onClick={() => void api.openExternal(article.url)}
        >
          Abrir no site original ↗
        </button>
        <button className="btn" onClick={() => void toggleSaved(article.id)}>
          {salvo ? '★ Salvo' : '☆ Salvar'}
        </button>
        <button
          className="btn"
          onClick={() => void navigator.clipboard.writeText(article.url)}
        >
          Copiar link
        </button>
      </div>
    </article>
  )
}
