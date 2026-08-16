// ADR: see spec/fundacao-operacoes.adr.md
// ADR: see spec/conciliacao-robusta.adr.md
// ADR: see spec/vr-despesas.adr.md
// ADR: see Docs/specs/patches-ui-ux.adr.md
// ADR: see Docs/specs/refino-ui-revisao-v2.adr.md

import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { computarNomeArquivo } from '../PipelineState'
import { handleGerar as handleGerarPipeline } from '../handlersPipeline'
import { validarLinha } from '../../dominio/validacao'
import { detectarDesalinhamentoMes } from '../../dominio/mes'
import { ReviewGrid } from './ReviewGrid'
import { SplitModal } from './SplitModal'
import { ToolbarRevisao } from './ToolbarRevisao'
import { PainelLateral, type AbaPainelLateral } from './PainelLateral'
import { ExportModal } from './ExportModal'
import { PopupReplicacao } from './PopupReplicacao'
import { SeletorMesReferencia } from './SeletorMesReferencia'
import { IconeDesfazer, IconeRefazer, IconeExportar } from './Icones'

interface TelaRevisaoProps {
  /** Mês de referência escolhido — estado compartilhado com `TelaImportacao` (D9 do ADR mes-referencia-ui). */
  mesEscolhido: string
  /** Atualiza `mesEscolhido` e marca `usuarioEditouMes=true` — mesmo handler usado por `TelaImportacao`. */
  onMudarMes: (novoMes: string) => void
  /** Bytes do Modelo.xlsx, carregados em `TelaImportacao` no "Produzir" e reusados no "Gerar". */
  modeloBytes: Uint8Array | null
  /** Âncora invisível usada para disparar o download sem abrir nova aba (vive em `App.tsx`, fora dos dois `return` condicionais). */
  anchorRef: React.RefObject<HTMLAnchorElement | null>
  /** Aba ativa do `PainelLateral` — compartilhada com `TelaImportacao` (persiste entre as duas telas). */
  painel: AbaPainelLateral
  setPainel: React.Dispatch<React.SetStateAction<AbaPainelLateral>>
}

/**
 * Etapa 2 — Revisão (visível quando há lançamentos no store) + Etapa 3 —
 * Geração (`ExportModal`).
 *
 * Task T12-bis (spec `fundacao-operacoes`): extraído de `App.tsx` — comportamento
 * preservado; estado/efeitos que eram locais a `App.tsx` mas só se aplicavam
 * enquanto esta tela estava montada (atalhos de desfazer/refazer, aviso de
 * fatura, aviso de fechamento com mutações pendentes, redimensionamento da
 * grid, `splitIndice`, `exportFase`) passaram a viver aqui — o guard
 * `if (!emRevisao) return` do efeito de teclado em `App.tsx` já tornava isso
 * um no-op fora desta tela; mover para cá é equivalente porque o componente só
 * monta quando `emRevisao` é verdadeiro.
 */
export function TelaRevisao({
  mesEscolhido,
  onMudarMes,
  modeloBytes,
  anchorRef,
  painel,
  setPainel,
}: TelaRevisaoProps) {
  const lancamentos = useAppStore((s) => s.lancamentos)
  const iniciais = useAppStore((s) => s.iniciais)
  const dicEntries = useAppStore((s) => s.dicEntries)
  const naturezasValidas = useAppStore((s) => s.naturezasValidas)
  const naturezasRicas = useAppStore((s) => s.naturezasRicas)
  const sujo = useAppStore((s) => s.sujo)

  const adicionarAvisosAcionaveis = useAppStore((s) => s.adicionarAvisos)
  const undo = useAppStore((s) => s.undo)
  const redo = useAppStore((s) => s.redo)
  const marcarLimpo = useAppStore((s) => s.marcarLimpo)
  const historico = useAppStore((s) => s.historico)
  const futuro = useAppStore((s) => s.futuro)

  /** Índice do lançamento que abriu o SplitModal (null = modal fechado). */
  const [splitIndice, setSplitIndice] = useState<number | null>(null)

  /** Fase do `ExportModal` — `null` = fechado. */
  const [exportFase, setExportFase] = useState<'confirmar' | 'feito' | null>(null)

  /** Container da grid — observado para recalcular a largura do Glide. */
  const gridWrapRef = useRef<HTMLDivElement>(null)

  const podaGerar = lancamentos.length > 0 && modeloBytes !== null
  const splitLancamento = splitIndice !== null ? lancamentos[splitIndice] : null

  // D5 do ADR colinha-naturezas: lista filtrada — somente naturezas com descrição preenchida.
  const naturezasDescritas = naturezasRicas.filter((n) => n.descricao !== '')

  const lancamentosPendentes = lancamentos.filter((l) => validarLinha(l, naturezasValidas)).length

  // Preview do nome no modal de exportação — pelo mês de referência (ver handleGerar).
  const nomeArquivoExport = computarNomeArquivo(lancamentos, iniciais, mesEscolhido)

  // ---------------------------------------------------------------------------
  // Atalhos de teclado (estilo Google Sheets) — desfazer/refazer
  // ---------------------------------------------------------------------------

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      // Não sequestrar o desfazer nativo quando o foco está em campo de texto
      // (input do formulário ou overlay de edição da grid).
      const alvo = e.target as HTMLElement | null
      const tag = alvo?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || alvo?.isContentEditable) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  // Intercepta fechamento/recarga quando há mutações não exportadas (zero-retenção:
  // não persiste nada, só aciona o prompt nativo do navegador via preventDefault).
  useEffect(() => {
    if (!sujo) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [sujo])

  // Aviso não bloqueante de desalinhamento de mês — D4 do ADR mes-referencia-ui,
  // rebaixado a cross-check pela Decisão 1 do ADR conciliacao-robusta (Task 8):
  // só dispara quando a heurística por data (`classificarFonte`) diverge da
  // classificação autoritativa por prefixo (`classificarFontePorPrefixo`, T1),
  // via `detectarDesalinhamentoMes` (T2) — nunca mais "sempre que há uma fonte
  // fatura pela heurística", que é o que causava o silêncio do bug motivador F1.
  // Recalcula quando os lançamentos carregados ou o mês de referência mudam.
  // Antes de inserir, remove avisos anteriores da mesma categoria (idempotente).
  useEffect(() => {
    // Prefixo interno para identificar a categoria do aviso — não visível ao usuário.
    const PREFIXO_FATURA = '[fatura-aviso]'

    // Coleta as fontes distintas presentes nos lançamentos
    const fontes = Array.from(new Set(lancamentos.map((l) => l.fonte)))

    // `detectarDesalinhamentoMes` (T2) propaga o `Error` de `classificarFontePorPrefixo` (T1)
    // quando `fonte` não segue a convenção `fatura_*`/`extrato_*` — comportamento correto na
    // fronteira do parser (T1/T6), mas este efeito roda a cada render/mudança de lançamentos
    // sobre QUALQUER dado hoje presente no store, inclusive fontes fora da convenção que só
    // existem em fixtures de outras suítes de teste (fora das Áreas tocadas desta task). Uma
    // fonte não-conformante aqui não deve derrubar a tela inteira — apenas essa fonte fica sem
    // o cross-check de desalinhamento.
    const avisosDesalinhamento = fontes.flatMap((fonte) => {
      try {
        return detectarDesalinhamentoMes(fonte, lancamentos, mesEscolhido)
      } catch {
        return []
      }
    })

    // Remove avisos anteriores desta categoria antes de inserir (sem duplicatas)
    useAppStore.setState((state) => ({
      avisos: state.avisos.filter((a) => !a.startsWith(PREFIXO_FATURA)),
    }))

    if (avisosDesalinhamento.length === 0) return

    useAppStore.setState((state) => ({
      avisos: [...state.avisos, ...avisosDesalinhamento.map((a) => `${PREFIXO_FATURA}${a.mensagem}`)],
    }))

    // Canal único (T9, D18): mesmos avisos, migrados para o slice como informativos
    // dispensáveis, com o id determinístico já produzido por `detectarDesalinhamentoMes`
    // (`desalinhamento-mes-${fonte}`) — se um aviso com esse id já existe (pendente ou
    // já dispensado pelo usuário), NÃO recria: a dispensa precisa persistir na sessão
    // mesmo com o efeito rodando de novo a cada re-render/mudança de mesEscolhido
    // (mecanismo decidido localmente, ver iteração-log de T9).
    const idsExistentes = new Set(
      useAppStore.getState().avisosAcionaveis.avisos.map((a) => a.id),
    )
    const novosAvisosAcionaveis = avisosDesalinhamento.filter((a) => !idsExistentes.has(a.id))
    if (novosAvisosAcionaveis.length > 0) {
      adicionarAvisosAcionaveis(novosAvisosAcionaveis)
    }
  }, [lancamentos, mesEscolhido, adicionarAvisosAcionaveis])

  // Recalcula a largura da grid Glide ao abrir/fechar o PainelLateral:
  // o container da grid vive num flex que muda de largura quando `painel`
  // alterna entre `null` e uma aba — o `DataEditor` do glide-data-grid
  // (`width="100%"`, `ReviewGrid.tsx`) observa o próprio container via
  // ResizeObserver interno e redesenha o canvas sozinho a cada mudança de
  // tamanho; este efeito só existe para deixar o gatilho explícito (não há API
  // pública de "remeasure" externo em `DataEditorRef`, ver iteração-log).
  useEffect(() => {
    const el = gridWrapRef.current
    if (!el) return
    // Força um reflow síncrono do container após a mudança de `painel` — garante
    // que o layout já refletiu a nova largura antes do próximo paint, mesmo em
    // navegadores que atrasariam o ResizeObserver por um frame.
    void el.offsetWidth
  }, [painel])

  /**
   * Etapa 3 — Aprendizado do dicionário + geração do .xlsx.
   *
   * Delega para `handlersPipeline.ts` (Task T11). Disparado pelo botão
   * "Baixar .xlsx" do `ExportModal` (fase confirmar).
   */
  function handleGerar() {
    handleGerarPipeline({ modeloBytes, lancamentos, iniciais, dicEntries, mesEscolhido, anchorRef, marcarLimpo })
  }

  /** Confirma a exportação a partir do `ExportModal` (fase confirmar → "Baixar .xlsx"). */
  function handleConfirmarExport() {
    handleGerar()
    setExportFase('feito')
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header único (faixa só): status de progresso à esquerda + ações à
          direita, numa única `.toolbar.compacta` — fiel ao protótipo
          (`prototipo/cdg-revisao.jsx:163-191`), que distribui os dois grupos
          via `justify-content:space-between`. As ações (undo/redo, mês de
          referência, abrir Avisos/Naturezas, Exportar) entram pelo slot
          `children` de `ToolbarRevisao`, não numa segunda faixa empilhada. */}
      <ToolbarRevisao>
        <button
          type="button"
          className="btn sec icone"
          disabled={historico.length === 0}
          onClick={undo}
          title="Desfazer edição da grid (Ctrl+Z)"
        >
          <IconeDesfazer />
        </button>
        <button
          type="button"
          className="btn sec icone"
          disabled={futuro.length === 0}
          onClick={redo}
          title="Refazer edição da grid (Ctrl+Shift+Z)"
        >
          <IconeRefazer />
        </button>
        <span className="grupo-mes" title="Mês que dá nome ao arquivo exportado e separa fatura de extrato">
          <span className="grupo-mes-rotulo">Mês ref.</span>
          <SeletorMesReferencia
            mesEscolhido={mesEscolhido}
            onChange={onMudarMes}
            compacto
          />
        </span>
        <button
          type="button"
          className="btn pri"
          onClick={() => setExportFase('confirmar')}
          disabled={!podaGerar}
        >
          <IconeExportar />
          Exportar .xlsx
        </button>
      </ToolbarRevisao>

      {/* Corpo: grid + painel lateral lado a lado (Task T11 — item 4 das
          frases de intenção: painel lateral empurra a grid em vez de
          sobrepor como overlay position:fixed). */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/*
          A faixa de inspeção que ficava aqui (BannerInspecao) foi removida em 2026-08-16 por ser
          redundante: tudo o que ela mostrava — estado "inspecionando", contagem de linhas, Aplicar
          e Dispensar — já aparece no próprio card em inspeção, que ainda ganha borda destacada. Sair
          da inspeção continua possível clicando no card de novo (`aoClicarNoCard`, em
          `CentralDeAvisos.tsx`, já alternava antes desta mudança), e o realce das linhas no grid
          segue sinalizando o modo ativo.
        */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div ref={gridWrapRef} style={{ flex: 1, minHeight: 0 }}>
            <ReviewGrid onSplitDetectado={(indice) => setSplitIndice(indice)} />
          </div>
        </div>

        {/* Painel sempre aberto na revisão (hotfix 2026-08-02): `null` herdado
            da importação vira a aba padrão "avisos"; as abas do próprio painel
            fazem a troca — sem botão de toggle na toolbar, sem "×". */}
        <PainelLateral
          aba={painel ?? 'avisos'}
          setAba={setPainel}
          naturezas={naturezasDescritas}
          mesRef={mesEscolhido}
        />
      </div>

      {/* Popup de sugestão de replicar classificação (item 36) — flutua no
          rodapé quando há linhas idênticas sem classificar; some ao aplicar/dispensar. */}
      <PopupReplicacao />

      {/* Modal de split — abre quando onSplitDetectado dispara */}
      {splitIndice !== null && splitLancamento && (
        <SplitModal
          lancamento={splitLancamento}
          indice={splitIndice}
          onClose={() => setSplitIndice(null)}
        />
      )}

      {/* Modal de exportação — Task T11: botão "Exportar .xlsx" abre a fase
          `confirmar`; "Baixar .xlsx" chama a geração real (`handleGerar`,
          núcleo intocado) e avança para a fase `feito`. */}
      {exportFase && (
        <ExportModal
          fase={exportFase}
          nome={nomeArquivoExport}
          pendentes={lancamentosPendentes}
          onConfirmar={handleConfirmarExport}
          onFechar={() => setExportFase(null)}
          onContinuar={() => setExportFase(null)}
        />
      )}
    </div>
  )
}

