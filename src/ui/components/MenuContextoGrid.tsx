import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { posicionarMenuContexto } from './menuContexto'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Uma ação oferecida pelo menu. O menu não sabe o que ela faz — só a anuncia e a dispara. */
export interface AcaoMenuContexto {
  /** Texto do item, em pt-BR e no infinitivo ("Excluir linha"). */
  rotulo: string
  /** Atalho equivalente, exibido à direita como lembrete (ex.: `Ctrl −`). Opcional. */
  atalho?: string
  /** Executada no clique ou no Enter/Espaço sobre o item. */
  onSelecionar: () => void
}

export interface MenuContextoGridProps {
  /** Coordenada X do clique, em coordenadas de viewport. */
  x: number
  /** Coordenada Y do clique, em coordenadas de viewport. */
  y: number
  /** Ações exibidas, na ordem. */
  acoes: AcaoMenuContexto[]
  /** Fecha o menu. Chamado por Escape, Tab, clique fora, rolagem e após cada ação. */
  onFechar: () => void
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

/**
 * Menu de contexto da grid de revisão (item 38 do TODO) — o botão direito numa linha abre
 * "inserir linha acima/abaixo" e "excluir linha".
 *
 * É a única superfície de UI genuinamente nova do item, então o cuidado mora aqui: o menu nasce
 * com o foco no primeiro item (navegável só pelo teclado, com setas, Home/End e Escape), fecha ao
 * clicar fora, ao rolar e ao abrir outro menu, e se reposiciona para nunca sair da janela.
 *
 * `role="menu"` não é decoração: `focoGrid.ts` o inclui em `SELETOR_MODAL`, e é isso que impede a
 * grid de puxar o foco de volta enquanto o menu está aberto — sem essa peça o menu se fecharia
 * sozinho no primeiro clique.
 *
 * Os listeners globais são de **captura**. O React delega eventos na raiz, então um
 * `stopPropagation()` de qualquer handler do app mataria um listener de bubbling no `document`
 * antes que ele rodasse (lição que custou caro no item 51). Na descida, nada foi interrompido
 * ainda.
 */
export function MenuContextoGrid({ x, y, acoes, onFechar }: MenuContextoGridProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [posicao, setPosicao] = useState({ x, y })

  // Reposiciona depois da montagem, quando o menu já tem tamanho medido: antes disso não há como
  // saber se ele cabe. `useLayoutEffect` para o ajuste acontecer antes da pintura, sem piscar.
  useLayoutEffect(() => {
    const el = menuRef.current
    if (el === null) return
    setPosicao(
      posicionarMenuContexto({
        x,
        y,
        largura: el.offsetWidth,
        altura: el.offsetHeight,
        larguraViewport: window.innerWidth,
        alturaViewport: window.innerHeight,
      }),
    )
  }, [x, y])

  // Foco no primeiro item: o menu abre por clique do botão direito, mas tem de ser operável
  // inteiro pelo teclado a partir daí.
  useEffect(() => {
    itemDoIndice(menuRef.current, 0)?.focus()
  }, [])

  useEffect(() => {
    function aoClicarFora(evento: Event) {
      const alvo = evento.target
      if (alvo instanceof Node && menuRef.current?.contains(alvo) === true) return
      onFechar()
    }
    function aoRolarOuRedimensionar() {
      onFechar()
    }

    document.addEventListener('click', aoClicarFora, true)
    document.addEventListener('contextmenu', aoClicarFora, true)
    // `scroll` não borbulha: só a fase de captura enxerga a rolagem do virtualizador do Glide,
    // que é quem rola de verdade por baixo do menu.
    document.addEventListener('scroll', aoRolarOuRedimensionar, true)
    window.addEventListener('resize', aoRolarOuRedimensionar)
    return () => {
      document.removeEventListener('click', aoClicarFora, true)
      document.removeEventListener('contextmenu', aoClicarFora, true)
      document.removeEventListener('scroll', aoRolarOuRedimensionar, true)
      window.removeEventListener('resize', aoRolarOuRedimensionar)
    }
  }, [onFechar])

  const aoTeclar = useCallback(
    (evento: React.KeyboardEvent<HTMLDivElement>) => {
      const menu = menuRef.current
      if (menu === null) return
      const itens = itensDoMenu(menu)
      const atual = itens.indexOf(document.activeElement as HTMLButtonElement)

      switch (evento.key) {
        case 'Escape':
        case 'Tab':
          // Tab fecha em vez de vazar o foco para trás do menu, que ficaria aberto e órfão.
          evento.preventDefault()
          onFechar()
          return
        case 'ArrowDown':
          evento.preventDefault()
          itens[(atual + 1) % itens.length]?.focus()
          return
        case 'ArrowUp':
          evento.preventDefault()
          itens[(atual - 1 + itens.length) % itens.length]?.focus()
          return
        case 'Home':
          evento.preventDefault()
          itens[0]?.focus()
          return
        case 'End':
          evento.preventDefault()
          itens[itens.length - 1]?.focus()
          return
      }
    },
    [onFechar],
  )

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Ações da linha"
      className="menu-contexto"
      onKeyDown={aoTeclar}
      style={{ position: 'fixed', left: posicao.x, top: posicao.y }}
    >
      {acoes.map((acao) => (
        <button
          key={acao.rotulo}
          type="button"
          role="menuitem"
          className="menu-contexto-item"
          onClick={() => {
            acao.onSelecionar()
            onFechar()
          }}
        >
          <span>{acao.rotulo}</span>
          {acao.atalho !== undefined && <span className="menu-contexto-atalho">{acao.atalho}</span>}
        </button>
      ))}
    </div>
  )
}

/** Os `menuitem`s do menu, na ordem do DOM. */
function itensDoMenu(menu: HTMLElement): HTMLButtonElement[] {
  return [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
}

/** O `menuitem` de índice `i`, ou `undefined` — o menu pode ainda não estar montado. */
function itemDoIndice(menu: HTMLElement | null, i: number): HTMLButtonElement | undefined {
  return menu === null ? undefined : itensDoMenu(menu)[i]
}
