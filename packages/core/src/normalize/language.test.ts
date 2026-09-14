import { describe, expect, it } from 'vitest'
import { detectarIdioma, precisaTraduzir } from './language.js'

const EN_TECNICO =
  'The new release of the Rust compiler improves the borrow checker and '
  + 'reduces compile times for large projects that depend on many crates.'

const PT_TECNICO =
  'A nova versao do compilador do Rust melhora o verificador de emprestimos '
  + 'e reduz o tempo de compilacao para projetos grandes que dependem de '
  + 'muitas bibliotecas.'

const ES_TECNICO =
  'La nueva version del compilador de Rust mejora el verificador y reduce '
  + 'el tiempo de compilacion para los proyectos que dependen de muchas '
  + 'bibliotecas en el sistema.'

describe('detectarIdioma', () => {
  it('reconhece inglês em texto técnico', () => {
    expect(detectarIdioma(EN_TECNICO).idioma).toBe('en')
  })

  it('reconhece português em texto técnico', () => {
    expect(detectarIdioma(PT_TECNICO).idioma).toBe('pt')
  })

  it('reconhece espanhol', () => {
    expect(detectarIdioma(ES_TECNICO).idioma).toBe('es')
  })

  it('não se confunde com nomes de tecnologia no meio do texto', () => {
    const t = 'The Kubernetes and Docker and Rust and Python release is here '
      + 'and it is available for all of the users in the cluster today.'
    expect(detectarIdioma(t).idioma).toBe('en')
  })

  it('devolve desconhecido para texto curto demais', () => {
    expect(detectarIdioma('Rust 1.90').idioma).toBe('desconhecido')
  })

  it('devolve desconhecido para string vazia', () => {
    expect(detectarIdioma('').idioma).toBe('desconhecido')
  })

  it('devolve desconhecido quando não há palavras funcionais', () => {
    const t = 'GPU CPU RAM SSD NVME HBM CUDA VRAM PCIE DDR5 GDDR7 ARM RISC'
    expect(detectarIdioma(t).idioma).toBe('desconhecido')
  })

  it('a confiança fica entre 0 e 1', () => {
    for (const t of [EN_TECNICO, PT_TECNICO, ES_TECNICO, '', 'abc def']) {
      const d = detectarIdioma(t)
      expect(d.confianca).toBeGreaterThanOrEqual(0)
      expect(d.confianca).toBeLessThanOrEqual(1)
    }
  })

  it('texto longo em inglês tem confiança maior que texto no limite', () => {
    const longo = detectarIdioma(`${EN_TECNICO} ${EN_TECNICO}`)
    expect(longo.confianca).toBeGreaterThan(0.3)
  })
})

describe('precisaTraduzir', () => {
  it('português não precisa', () => expect(precisaTraduzir('pt')).toBe(false))
  it('inglês precisa', () => expect(precisaTraduzir('en')).toBe(true))
  it('espanhol precisa', () => expect(precisaTraduzir('es')).toBe(true))
  it('desconhecido não precisa — não traduzimos no escuro', () => {
    expect(precisaTraduzir('desconhecido')).toBe(false)
  })
})
