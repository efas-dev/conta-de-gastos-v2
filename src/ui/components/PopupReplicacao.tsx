import { useAppStore } from '../store/appStore'

/**
 * Popup de sugestão de replicação (item 36): quando o usuário classifica uma
 * linha que tem outras de transcrição idêntica ainda sem Natureza, oferece
 * aplicar a mesma Natureza+Descrição a todas de uma vez.
 *
 * Card flutuante no rodapé; some ao Aplicar (preenche, desfazível com Ctrl+Z)
 * ou Dispensar. Lê `sugestaoReplicacao` do store — nada é renderizado quando é `null`.
 */
export function PopupReplicacao() {
  const sugestao = useAppStore((s) => s.sugestaoReplicacao)
  const aplicar = useAppStore((s) => s.aplicarReplicacao)
  const dispensar = useAppStore((s) => s.dispensarReplicacao)

  if (!sugestao) return null

  const n = sugestao.alvos.length
  const classificacao = sugestao.descricao
    ? `${sugestao.natureza} · ${sugestao.descricao}`
    : sugestao.natureza

  return (
    <div
      role="dialog"
      aria-label="Sugestão de replicar classificação"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 1000,
        maxWidth: 460,
        width: 'calc(100% - 32px)',
        background: 'var(--superficie)',
        border: '1px solid var(--borda-3)',
        borderRadius: 12,
        boxShadow: 'var(--sombra-card)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ fontSize: 14, color: 'var(--texto)' }}>
        <strong>Replicar classificação</strong> — {n} {n === 1 ? 'outra linha igual' : 'outras linhas iguais'} a{' '}
        <span style={{ color: 'var(--texto-2)' }}>«{sugestao.exemplo}»</span> sem classificar. Aplicar{' '}
        <strong style={{ color: 'var(--verde)' }}>{classificacao}</strong> a {n === 1 ? 'ela' : 'todas'}?
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn sec mini" onClick={dispensar}>
          Dispensar
        </button>
        <button type="button" className="btn pri mini" onClick={aplicar}>
          Aplicar a {n}
        </button>
      </div>
    </div>
  )
}
