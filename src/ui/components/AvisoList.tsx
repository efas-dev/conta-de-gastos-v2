// ADR: see spec/mvp-vertical-nubank.adr.md

interface AvisoListProps {
  avisos: string[]
}

/**
 * Renderiza a lista de avisos do pipeline.
 *
 * Usa `role="alert"` para acessibilidade — leitores de tela anunciam automaticamente
 * novas mensagens inseridas neste elemento.
 *
 * Exibido somente quando há avisos; retorna null quando a lista está vazia.
 */
export function AvisoList({ avisos }: AvisoListProps) {
  if (avisos.length === 0) return null

  return (
    <div role="alert" style={{ marginTop: '1rem' }}>
      <ul>
        {avisos.map((aviso, i) => (
          <li key={i}>{aviso}</li>
        ))}
      </ul>
    </div>
  )
}
