// ADR: see spec/fundacao-operacoes.adr.md
// ADR: see Docs/specs/mes-referencia-ui.adr.md
// ADR: see Docs/specs/patches-ui-ux.adr.md
// ADR: see Docs/specs/refino-ui-revisao-v2.adr.md

/**
 * `SeletorMesReferencia` — dois selects controlados (mês + ano) — D5 do ADR
 * `mes-referencia-ui`.
 *
 * Task T12-bis (spec `fundacao-operacoes`): extraído de `App.tsx` sem alteração
 * de comportamento (mesma lógica de composição da string `YYYY-MM`).
 */

const MESES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'] as const

const NOMES_MES_ABREVIADOS: Record<(typeof MESES)[number], string> = {
  '01': 'jan',
  '02': 'fev',
  '03': 'mar',
  '04': 'abr',
  '05': 'mai',
  '06': 'jun',
  '07': 'jul',
  '08': 'ago',
  '09': 'set',
  '10': 'out',
  '11': 'nov',
  '12': 'dez',
}

function anosDisponiveis(): number[] {
  const anoCorrente = new Date().getFullYear()
  const anos: number[] = []
  for (let a = anoCorrente + 1; a >= anoCorrente - 4; a--) {
    anos.push(a)
  }
  return anos
}

interface SeletorMesReferenciaProps {
  mesEscolhido: string // formato YYYY-MM
  onChange: (novoMes: string) => void
  /** Quando `true`, os selects usam a classe `.sel-mini` (sem caixa própria) em vez de `.input`. */
  compacto?: boolean
}

/**
 * Dois selects controlados (mês 01–12 e ano) que nunca ficam vazios.
 * O estado interno é uma string YYYY-MM derivada da combinação dos dois selects.
 * Decisão D5 e D6 do ADR: nunca vazio; default = mês anterior ao corrente.
 */
export function SeletorMesReferencia({ mesEscolhido, onChange, compacto }: SeletorMesReferenciaProps) {
  // mesEscolhido é sempre 'YYYY-MM' (garantido por defaultMes e pelos handlers)
  const [anoStr, mesStr] = mesEscolhido.split('-')

  function handleMes(e: React.ChangeEvent<HTMLSelectElement>) {
    onChange(`${anoStr}-${e.target.value}`)
  }

  function handleAno(e: React.ChangeEvent<HTMLSelectElement>) {
    onChange(`${e.target.value}-${mesStr}`)
  }

  const className = compacto ? 'sel-mini' : 'input'
  const style = compacto ? undefined : { width: 'auto', padding: '6px 8px', fontSize: 13 }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <select
        data-testid="select-mes"
        value={mesStr}
        onChange={handleMes}
        className={className}
        style={style}
        aria-label="Mês de referência"
      >
        {MESES.map((m) => (
          <option key={m} value={m}>{`${m} · ${NOMES_MES_ABREVIADOS[m]}`}</option>
        ))}
      </select>
      <select
        data-testid="select-ano"
        value={anoStr}
        onChange={handleAno}
        className={className}
        style={style}
        aria-label="Ano de referência"
      >
        {anosDisponiveis().map((a) => (
          <option key={a} value={String(a)}>{a}</option>
        ))}
      </select>
    </span>
  )
}
