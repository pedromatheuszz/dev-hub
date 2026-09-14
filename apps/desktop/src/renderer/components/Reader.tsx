import type { Article } from '@devhub/core'
import { useDevHub } from '@devhub/state'
import { useEffect, useState } from 'react'
import { api, hostDe, rotuloTipo, tempoRelativo } from '../api.js'

/**
 * Leitor de artigo. O conteúdo já vem sanitizado por allowlist desde a
 * ingestão (spec §9), então é seguro renderizá-lo — mas quando não há
 * corpo, mostramos o resumo e mandamos o leitor para a fonte original.
 */
export function Reader({ id }: { id: string }) {
  const [dados, setDados] = useState<{ article: Article; tags: string[] } | null>(null)
  const [carregando, setCarregando] = useState(true)
  const goBack = useDevHub((s) => s.goBack)
  const toggleSaved = useDevHub((s) => s.toggleSaved)
  const items = useDevHub((s) => s.items)
  const salvo = items.find((i) => i.article.id === id)?.saved ?? false

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    void api.article(id).then((d) => {
      if (!vivo) return
      setDados(d)
      setCarregando(false)
      if (d) void api.recordRead(id)
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

  const { article, tags } = dados
  const temCorpo = (article.contentHtml ?? '').length > 200

  return (
    <article className="reader">
      <button className="btn btn-ghost reader-back" onClick={() => void goBack()}>
        ← Voltar
      </button>

      <h1>{article.title}</h1>

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

      {article.excerpt && (
        <div className="reader-summary">
          <div className="reader-summary-head">
            {/* Spec §6.5: conteúdo derivado automaticamente é sempre rotulado. */}
            <span className="chip chip-ai">Resumo do feed</span>
          </div>
          <p style={{ margin: 0 }}>{article.excerpt}</p>
        </div>
      )}

      {temCorpo ? (
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
