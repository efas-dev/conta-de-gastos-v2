// ADR: see spec/rendimentos.adr.md
// ADR: see Docs/specs/patches-ui-ux.adr.md

import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import {
  calcularSaldoCalculado,
  parsearSomaInline,
  avaliarSanityCheck,
  gerarLancamentoRendimento,
} from '../../dominio/rendimentos'

/**
 * Id fixo do aviso rendimentos — `detectarRendimentos` (T9, `src/dominio/rendimentos.ts`) sempre
 * produz exatamente 1 aviso com este id, independente do conteúdo de `lancamentos`. Mesmo padrão de
 * `ID_AVISO_VR` em `FormVR.tsx`.
 */
const ID_AVISO_RENDIMENTOS = 'rendimentos'

export interface FormRendimentosProps {
  /** Mês de referência (`YYYY-MM`) usado por `gerarLancamentoRendimento` para a data automática. */
  mesRef: string
}

/**
 * Formulário que coleta o saldo real informado pelo usuário (conta corrente + aplicações, com soma
 * inline no campo de aplicações, ver ADR `rendimentos`, Decisão 4) e, ao confirmar, compara-o ao
 * saldo calculado pelo sistema (`calcularSaldoCalculado`, T5) para gerar 1 lançamento sintético de
 * natureza `"RR"` (T8) ou orientar o usuário à conciliação manual (Decisão 6 do ADR).
 *
 * Mesmo padrão estrutural de `FormVR.tsx`: como o aviso `'rendimentos'` (T9) nasce sem
 * `mutacaoProposta`, este componente monta a `Mutacao` e a anexa ao aviso via `useAppStore.setState`
 * antes de chamar `aplicar(ID_AVISO_RENDIMENTOS)`. `avisosSlice.ts` não é tocado.
 *
 * `saldoAnterior` (store, T3) pode ser `null` quando o xlsx do mês anterior ainda não foi lido — o
 * submit é bloqueado com uma mensagem orientando o usuário a subir esse arquivo (decisão local desta
 * task, ver iteração-log: tratar como 0 produziria um saldo calculado artificialmente baixo,
 * inflando o RR lançado sem nenhum sinal ao usuário).
 *
 * O sanity check (`avaliarSanityCheck`, T7) é meramente informativo — não bloqueia o caminho de
 * lançamento, apenas exibe um aviso adicional quando o rendimento estimado excede o limiar razoável.
 *
 * Nenhum caminho lança exceção não tratada (best-effort, envolto em try/catch).
 */
export function FormRendimentos({ mesRef }: FormRendimentosProps) {
  const [contaCorrente, setContaCorrente] = useState('')
  const [aplicacoes, setAplicacoes] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const aplicar = useAppStore((s) => s.aplicar)
  const saldoAnterior = useAppStore((s) => s.saldoAnterior)
  const lancamentos = useAppStore((s) => s.lancamentos)

  const somaAplicacoes = parsearSomaInline(aplicacoes)
  const somaValidaAttr = aplicacoes.trim() === '' ? 'neutro' : String(somaAplicacoes.valido)

  let avisoSanityCheck: string | null = null
  const contaCorrenteNumerica = Number(contaCorrente.replace(',', '.'))
  if (
    contaCorrente.trim() !== '' &&
    !Number.isNaN(contaCorrenteNumerica) &&
    somaAplicacoes.valido &&
    saldoAnterior !== null
  ) {
    const saldoInformado = contaCorrenteNumerica + (somaAplicacoes.valor ?? 0)
    const saldoCalculado = calcularSaldoCalculado(saldoAnterior, lancamentos)
    const diferenca = saldoInformado - saldoCalculado
    if (avaliarSanityCheck(diferenca, saldoInformado).over) {
      avisoSanityCheck =
        'O rendimento estimado excede o limiar razoável de 5% ao mês. Confira se os valores estão corretos antes de confirmar.'
    }
  }

  function confirmar() {
    try {
      if (saldoAnterior === null) {
        setErro('Saldo do mês anterior não disponível. Suba o xlsx do mês anterior (aba Extrato) antes de lançar rendimentos.')
        return
      }

      const contaCorrenteNumerica = Number(contaCorrente.replace(',', '.'))
      if (contaCorrente.trim() === '' || Number.isNaN(contaCorrenteNumerica)) {
        setErro('Informe um valor numérico para a conta corrente.')
        return
      }

      const soma = parsearSomaInline(aplicacoes)
      if (aplicacoes.trim() !== '' && !soma.valido) {
        setErro('O campo de aplicações não foi reconhecido. Use valores separados por "+" (ex.: "100+50").')
        return
      }

      const saldoInformado = contaCorrenteNumerica + (soma.valor ?? 0)
      const saldoCalculado = calcularSaldoCalculado(saldoAnterior, lancamentos)
      const resultado = gerarLancamentoRendimento(saldoCalculado, saldoInformado, mesRef)

      if (resultado.tipo === 'diferenca-negativa') {
        setErro(
          'O saldo informado é menor que o saldo calculado. Confira o grid contra os apps do banco/investimentos e localize o lançamento faltante (conciliação manual).',
        )
        return
      }

      useAppStore.setState((state) => ({
        avisosAcionaveis: {
          ...state.avisosAcionaveis,
          avisos: state.avisosAcionaveis.avisos.map((a) =>
            a.id === ID_AVISO_RENDIMENTOS
              ? { ...a, mutacaoProposta: { verbo: 'adicionar' as const, lancamentos: [resultado.lancamento] } }
              : a,
          ),
        },
      }))

      aplicar(ID_AVISO_RENDIMENTOS)
      setErro(null)
      setContaCorrente('')
      setAplicacoes('')
    } catch {
      setErro('Não foi possível calcular os rendimentos. Tente novamente.')
    }
  }

  return (
    <div data-testid="form-rendimentos" role="form" aria-label="Lançar rendimentos do mês">
      <div className="painel-secao">Rendimentos do mês</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label className="campo">
          <span className="rotulo">Conta corrente</span>
          <input
            className="input"
            aria-label="Conta corrente"
            placeholder="Ex.: 1234,56"
            value={contaCorrente}
            onChange={(e) => setContaCorrente(e.target.value)}
          />
        </label>

        <label className="campo">
          <span className="rotulo">Aplicações</span>
          <input
            className="input"
            aria-label="Aplicações"
            placeholder='Ex.: 100+50+20'
            value={aplicacoes}
            data-soma-valida={somaValidaAttr}
            onChange={(e) => setAplicacoes(e.target.value)}
          />
        </label>

        <p style={{ fontSize: 12, color: 'var(--texto-3)', margin: 0 }}>
          Inclua caixinhas, porquinhos, cofrinhos e demais aplicações. Some os valores separados por
          &quot;+&quot; (ex.: &quot;100+50+20&quot;).
        </p>
      </div>

      {avisoSanityCheck && (
        <div role="status" style={{ marginTop: 8, fontSize: 13, color: 'var(--terracota)' }}>
          {avisoSanityCheck}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
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
