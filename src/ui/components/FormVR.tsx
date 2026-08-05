// ADR: see spec/vr-despesas.adr.md

import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import { gerarLancamentosVR } from '../../dominio/vr'

/**
 * Id fixo do aviso VR — `detectarVR` (T4, `src/dominio/vr.ts`) sempre produz exatamente 1 aviso
 * com este id, independente do conteúdo de `lancamentos`. `FormVR` reaproveita essa constante em
 * vez de recebê-la como prop: não há ambiguidade sobre "qual aviso" o form se refere a.
 */
const ID_AVISO_VR = 'vr'

/** Uma linha de despesa em edição no formulário (valores ainda como texto, não convertidos). */
interface DespesaEmEdicao {
  valor: string
  natureza: string
  descricao: string
}

function despesaVazia(): DespesaEmEdicao {
  return { valor: '', natureza: '', descricao: '' }
}

export interface FormVRProps {
  /** Mês de referência (`YYYY-MM`) usado por `gerarLancamentosVR` para calcular a data automática. */
  mesRef: string
}

/**
 * Formulário que coleta N despesas domésticas pagas com VR (vale-refeição) e, ao confirmar, gera
 * os N+1 lançamentos (Task 5, `gerarLancamentosVR`) e os insere na store via o ciclo genérico
 * aplicar/desfazer do `avisosSlice` (Task 3), reaproveitando o verbo `'adicionar'` da `Mutacao`
 * (ADR `vr-despesas`, Decisão 1).
 *
 * Como o aviso `'vr'` (Task 4) nasce sem `mutacaoProposta` — a mutação só existe depois que o
 * usuário preenche o form — este componente monta a `Mutacao` e a anexa ao aviso via
 * `useAppStore.setState` (API pública do Zustand, já usada diretamente por outros componentes do
 * projeto para atualizar `avisosAcionaveis`/`avisos` sem passar por uma action dedicada — ver
 * `TelaRevisao.tsx`, `TelaImportacao.tsx`) antes de chamar `aplicar('vr')`. `avisosSlice.ts` não é
 * tocado: o mecanismo de leitura de `mutacaoProposta` dentro de `aplicar` já existe desde a Task 3
 * e é genérico por design.
 *
 * Data por despesa não é coletada (automática, derivada de `mesRef` por `gerarLancamentosVR`, D4 do
 * ADR). Formulário vazio (0 despesas) ou qualquer despesa com `valor <= 0`, `natureza` vazia ou
 * `descricao` vazia bloqueia a aplicação: nenhum lançamento é inserido, o aviso permanece
 * `'pendente'`, e uma mensagem de erro é renderizada via `role="alert"`. Nenhum caminho lança
 * exceção não tratada (best-effort, envolto em try/catch).
 */
export function FormVR({ mesRef }: FormVRProps) {
  const [despesas, setDespesas] = useState<DespesaEmEdicao[]>([despesaVazia()])
  const [erro, setErro] = useState<string | null>(null)
  const aplicar = useAppStore((s) => s.aplicar)

  function atualizarCampo(indice: number, campo: keyof DespesaEmEdicao, valor: string) {
    setDespesas((atual) => atual.map((d, i) => (i === indice ? { ...d, [campo]: valor } : d)))
  }

  function adicionarLinha() {
    setDespesas((atual) => [...atual, despesaVazia()])
  }

  function removerLinha(indice: number) {
    setDespesas((atual) => atual.filter((_, i) => i !== indice))
  }

  /** Valida as despesas em edição; retorna a mensagem de erro ou `null` quando tudo é válido. */
  function validar(atual: DespesaEmEdicao[]): string | null {
    if (atual.length === 0) {
      return 'Adicione ao menos uma despesa antes de aplicar.'
    }
    for (const despesa of atual) {
      const valorNumerico = Number(despesa.valor.replace(',', '.'))
      if (despesa.valor.trim() === '' || Number.isNaN(valorNumerico) || valorNumerico <= 0) {
        return 'Cada despesa precisa de um valor maior que zero.'
      }
      if (despesa.natureza.trim() === '') {
        return 'Cada despesa precisa de uma natureza.'
      }
      if (despesa.descricao.trim() === '') {
        return 'Cada despesa precisa de uma descrição.'
      }
    }
    return null
  }

  function confirmar() {
    try {
      const mensagemErro = validar(despesas)
      if (mensagemErro) {
        setErro(mensagemErro)
        return
      }

      const despesasNumericas = despesas.map((d) => ({
        valor: Number(d.valor.replace(',', '.')),
        natureza: d.natureza.trim(),
        descricao: d.descricao.trim(),
      }))

      const lancamentos = gerarLancamentosVR(despesasNumericas, mesRef)

      useAppStore.setState((state) => ({
        avisosAcionaveis: {
          ...state.avisosAcionaveis,
          avisos: state.avisosAcionaveis.avisos.map((a) =>
            a.id === ID_AVISO_VR
              ? { ...a, mutacaoProposta: { verbo: 'adicionar' as const, lancamentos } }
              : a,
          ),
        },
      }))

      aplicar(ID_AVISO_VR)
      setErro(null)
      setDespesas([despesaVazia()])
    } catch {
      setErro('Não foi possível aplicar as despesas de VR. Tente novamente.')
    }
  }

  return (
    <div data-testid="form-vr" role="form" aria-label="Registrar despesas pagas com VR">
      <div className="painel-secao">Despesas pagas com VR</div>

      {despesas.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--texto-2)' }}>Nenhuma despesa adicionada.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Duas linhas por despesa: o painel lateral tem ~330px e não comporta
              Valor+Natureza+Descrição+Remover lado a lado (overflow horizontal). */}
          {despesas.map((despesa, indice) => (
            <li key={indice} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  aria-label={`Valor da despesa ${indice + 1}`}
                  placeholder="Valor"
                  value={despesa.valor}
                  onChange={(e) => atualizarCampo(indice, 'valor', e.target.value)}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <input
                  aria-label={`Natureza da despesa ${indice + 1}`}
                  placeholder="Natureza"
                  value={despesa.natureza}
                  onChange={(e) => atualizarCampo(indice, 'natureza', e.target.value)}
                  style={{ flex: 1, minWidth: 0 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  aria-label={`Descrição da despesa ${indice + 1}`}
                  placeholder="Descrição"
                  value={despesa.descricao}
                  onChange={(e) => atualizarCampo(indice, 'descricao', e.target.value)}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button type="button" className="btn sec mini" onClick={() => removerLinha(indice)}>
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'space-between' }}>
        <button type="button" className="btn sec mini" onClick={adicionarLinha}>
          Adicionar despesa
        </button>
        <button type="button" className="btn pri mini" onClick={confirmar}>
          Aplicar
        </button>
      </div>

      {erro && (
        <div role="alert" style={{ marginTop: 8, fontSize: 13, color: 'var(--terracota)' }}>
          {erro}
        </div>
      )}
    </div>
  )
}
