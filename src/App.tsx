// ADR: see Docs/specs/grid-revisao.adr.md
// ADR: see Docs/specs/grid-ux-filtros.adr.md
// ADR: see Docs/specs/mes-referencia-ui.adr.md
// ADR: see Docs/specs/dicionario-ponta-a-ponta.adr.md
// ADR: see Docs/specs/colinha-naturezas.adr.md
// ADR: see Docs/specs/inspecao-proposta-conciliacao.adr.md
// ADR: see Docs/specs/redesign-frontend-claude-design.adr.md
// ADR: see Docs/specs/fundacao-operacoes.adr.md

import { useRef, useState } from 'react'
import { useAppStore } from './ui/store/appStore'
import { defaultMes } from './dominio/mes'
import { TelaImportacao } from './ui/components/TelaImportacao'
import { TelaRevisao } from './ui/components/TelaRevisao'
import type { AbaPainelLateral } from './ui/components/PainelLateral'

/**
 * App — Orquestra o fluxo de três etapas:
 *
 * 1. Upload (`TelaImportacao`): iniciais + nome opcional + CSV + dicionário
 *    opcional → botão "Produzir".
 * 2. Revisão + Geração (`TelaRevisao`): `ReviewGrid` editável com avisos,
 *    "Desfazer"/"Refazer" e `ExportModal`.
 *
 * Estado de UI vive exclusivamente no `useAppStore` (Zustand) mais um pequeno
 * grupo de estados locais compartilhados pelas duas telas (mês de referência,
 * bytes do Modelo.xlsx, aba do painel lateral) — nenhuma persistência além da
 * sessão.
 *
 * Task T12-bis (spec `fundacao-operacoes`): `App.tsx` passou a compor apenas
 * `TelaImportacao`/`TelaRevisao` — a composição de JSX de cada etapa (ícones,
 * `SeletorMesReferencia`, telas inteiras) foi extraída para
 * `src/ui/components/` de forma comportamento-preservante; estado que só uma
 * das telas usava passou a viver no respectivo componente (mais próximo do
 * uso), preservando aqui só o que as duas telas compartilham.
 */
export function App() {
  const lancamentos = useAppStore((s) => s.lancamentos)
  const emRevisao = lancamentos.length > 0

  /**
   * Bytes do Modelo.xlsx carregados no "Produzir" e reusados no "Gerar".
   * Compartilhado entre as duas telas — precisa sobreviver à transição de
   * `TelaImportacao` (que dispara o "Produzir") para `TelaRevisao` (que
   * consome no "Gerar"), então não pode ser local a nenhuma delas.
   */
  const [modeloBytes, setModeloBytes] = useState<Uint8Array | null>(null)

  /**
   * Mês de referência escolhido pelo usuário (formato YYYY-MM).
   * Inicializa com o mês anterior ao corrente via defaultMes() (nunca vazio — D6 do ADR).
   * Estado local — não vai para o appStore (D9 do ADR mes-referencia-ui).
   */
  const [mesEscolhido, setMesEscolhido] = useState<string>(defaultMes())

  /**
   * Flag que indica se o usuário editou manualmente o campo de mês na sessão.
   * Quando true, a detecção automática não sobrescreve a escolha (D7 do ADR).
   */
  const [usuarioEditouMes, setUsuarioEditouMes] = useState<boolean>(false)

  /**
   * Aba ativa do `PainelLateral` — `null` = painel fechado. Compartilhada
   * entre as duas telas (a aba escolhida numa persiste ao transicionar para
   * a outra).
   */
  const [painel, setPainel] = useState<AbaPainelLateral>(null)

  /** Âncora invisível usada para disparar o download sem abrir nova aba. */
  const anchorRef = useRef<HTMLAnchorElement>(null)

  function handleMudarMes(novoMes: string) {
    setMesEscolhido(novoMes)
    setUsuarioEditouMes(true)
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        height: emRevisao ? '100vh' : undefined,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
      }}
    >
      {/* Âncora invisível para trigger de download */}
      {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
      <a ref={anchorRef} style={{ display: 'none' }} aria-hidden="true" />

      {!emRevisao && (
        <TelaImportacao
          mesEscolhido={mesEscolhido}
          usuarioEditouMes={usuarioEditouMes}
          onMudarMes={handleMudarMes}
          setModeloBytes={setModeloBytes}
          painel={painel}
          setPainel={setPainel}
        />
      )}

      {emRevisao && (
        <TelaRevisao
          mesEscolhido={mesEscolhido}
          onMudarMes={handleMudarMes}
          modeloBytes={modeloBytes}
          anchorRef={anchorRef}
          painel={painel}
          setPainel={setPainel}
        />
      )}
    </main>
  )
}
