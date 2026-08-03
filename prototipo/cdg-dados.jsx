const NATUREZAS = [
  { sigla: 'ALI', nome: 'Alimentação', desc: 'Mercado, restaurantes, delivery' },
  { sigla: 'MOR', nome: 'Moradia', desc: 'Aluguel, condomínio, luz, água, internet' },
  { sigla: 'TRA', nome: 'Transporte', desc: 'Combustível, apps, transporte público' },
  { sigla: 'SAU', nome: 'Saúde', desc: 'Farmácia, consultas, plano de saúde' },
  { sigla: 'LAZ', nome: 'Lazer', desc: 'Streaming, viagens, hobbies' },
  { sigla: 'EDU', nome: 'Educação', desc: 'Cursos, livros, mensalidades' },
  { sigla: 'VES', nome: 'Vestuário', desc: 'Roupas e calçados' },
  { sigla: 'REC', nome: 'Receita', desc: 'Salário e outras entradas' },
  { sigla: 'INV', nome: 'Investimento', desc: 'Aplicações e resgates' },
  { sigla: 'TRF', nome: 'Transferência', desc: 'Movimentação entre contas próprias' },
  { sigla: 'OUT', nome: 'Outros', desc: 'O que não se encaixa nas demais' },
];
const SIGLAS = new Set(NATUREZAS.map(n => n.sigla));

const LANCAMENTOS = [
  { id: 'L1', fonte: 'Fatura Nubank', data: '02/06', transcricao: 'IFOOD *IFD 05/06', iniciais: 'ES', natureza: 'ALI', descricao: 'iFood', valor: -86.4 },
  { id: 'L2', fonte: 'Fatura Nubank', data: '04/06', transcricao: 'POSTO SHELL BR 101', iniciais: 'ES', natureza: 'TRA', descricao: 'Combustível', valor: -220.0 },
  { id: 'L3', fonte: 'Fatura Nubank', data: '06/06', transcricao: 'AMAZON BR 12/06', iniciais: 'ES', natureza: '', descricao: '', valor: -159.9 },
  { id: 'L4', fonte: 'Fatura Nubank', data: '07/06', transcricao: 'PAGAMENTO RECEBIDO', iniciais: 'ES', natureza: '', descricao: '', valor: 2340.55, origemEspecial: 'pagamento-recebido' },
  { id: 'L5', fonte: 'Fatura Nubank', data: '09/06', transcricao: 'NETFLIX.COM', iniciais: 'ES', natureza: 'LAZ', descricao: 'Streaming', valor: -55.9 },
  { id: 'L6', fonte: 'Fatura Nubank', data: '10/06', transcricao: 'FARMACIA PANVEL 214', iniciais: 'ES', natureza: 'SAU', descricao: 'Farmácia', valor: -74.32 },
  { id: 'L7', fonte: 'Fatura Nubank', data: '12/06', transcricao: 'RESTAURANTE CORA', iniciais: 'ES', natureza: '', descricao: '', valor: -189.0 },
  { id: 'L8', fonte: 'Extrato Nubank', data: '03/06', transcricao: 'Transferência enviada pelo Pix - MARIA C', iniciais: 'ES', natureza: '', descricao: '', valor: -450.0 },
  { id: 'L9', fonte: 'Extrato Nubank', data: '07/06', transcricao: 'Pagamento de fatura', iniciais: 'ES', natureza: '', descricao: '', valor: -2340.55 },
  { id: 'L10', fonte: 'Extrato Nubank', data: '05/06', transcricao: 'Transferência recebida - ACME LTDA', iniciais: 'ES', natureza: 'REC', descricao: 'Salário', valor: 8500.0 },
  { id: 'L11', fonte: 'Extrato Nubank', data: '15/06', transcricao: 'Aplicação RDB', iniciais: 'ES', natureza: 'INV', descricao: 'RDB Nubank', valor: -1000.0, tipo: 'investimento' },
  { id: 'L12', fonte: 'Extrato Nubank', data: '18/06', transcricao: 'Compra no débito - MERCADO ZAFFARI', iniciais: 'ES', natureza: 'ALI', descricao: 'Mercado', valor: -312.77 },
  { id: 'L13', fonte: 'Extrato Itaú', data: '10/06', transcricao: 'PIX TRANSF ES CONTA NUBANK', iniciais: 'ES', natureza: 'TRF', descricao: 'Entre contas', valor: -600.0, tipo: 'transferencia' },
  { id: 'L14', fonte: 'Extrato Itaú', data: '13/06', transcricao: 'TED RECEBIDA CLIENTE X', iniciais: 'ES', natureza: '', descricao: '', valor: 1200.0 },
  { id: 'L15', fonte: 'Extrato Itaú', data: '16/06', transcricao: 'DEB AUT CEEE ENERGIA', iniciais: 'ES', natureza: 'MOR', descricao: 'Luz', valor: -287.45 },
  { id: 'L16', fonte: 'Extrato Itaú', data: '21/06', transcricao: 'SAQUE 24H 0431', iniciais: 'ES', natureza: '', descricao: '', valor: -200.0 },
  { id: 'L17', fonte: 'Extrato Itaú', data: '28/06', transcricao: 'TARIFA MANUT CONTA', iniciais: 'ES', natureza: 'OUT', descricao: 'Tarifa', valor: -32.0 },
];

const AVISOS_INICIAIS = [
  { id: 'a1', tipo: 'proposta', origem: 'conciliacao', estado: 'pendente', alvo: ['L9'], permanece: ['L1', 'L2', 'L3', 'L5', 'L6', 'L7'],
    mensagem: 'O débito "Pagamento de fatura" (R$ 2.340,55) no Extrato Nubank corresponde à fatura importada.',
    resumo: 'Removendo o débito, o gasto não conta duas vezes — os itens da fatura permanecem.' },
  { id: 'a2', tipo: 'proposta', origem: 'pagamento-recebido', estado: 'pendente', alvo: ['L4'], permanece: [],
    mensagem: '"Pagamento recebido" na Fatura Nubank é a quitação da fatura anterior.',
    resumo: 'Não é um gasto do mês — a proposta remove esta linha.' },
  { id: 'a3', tipo: 'informativo', estado: 'pendente', alvo: [], permanece: [],
    mensagem: 'A Fatura Nubank contém lançamentos de maio — confirme o mês de referência (junho/2026) antes de exportar.' },
];

const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Ic({ d, size = 15, color = 'currentColor', sw = 2 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}
const P = {
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  download: 'M12 15V3M7 10l5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  lock: 'M5 11h14v9H5zM8 11V7a4 4 0 0 1 8 0v4',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-1',
  redo: 'M15 14 20 9l-5-5M20 9H9a5 5 0 0 0 0 10h1',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M4 12.5 9.5 18 20 6',
  alerta: 'M12 3 2 20h20zM12 9v5M12 17.5v.5',
  seta: 'M5 12h14M13 6l6 6-6 6',
  sino: 'M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0',
  livro: 'M4 5a2 2 0 0 1 2-2h14v18H6a2 2 0 0 1-2-2zM8 3v18',
  info: 'M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 11v5M12 7.5v.5',
  book: 'M2 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H2zM22 4h-7a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h7z',
  divide: 'M8 3v18M16 3v18M3 12h18',
};

function Cabecalho({ etapa }) {
  const passos = ['Importar', 'Revisar', 'Exportar'];
  return (
    <div className="topo">
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span className="logo"><Ic d="M3 7h18M3 12h18M3 17h10" color="#faf8f3" sw={2.2} /></span>
        <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em' }}>Conta de Gastos</span>
      </div>
      <div className="stepper">
        {passos.map((p, i) => (
          <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {i > 0 && <span className="step-linha" />}
            <span className={'step-num' + (i < etapa ? ' feito' : i === etapa ? ' ativo' : '')}>
              {i < etapa ? <Ic d={P.check} size={11} color="#faf8f3" sw={2.6} /> : i + 1}
            </span>
            <span className={'step-nome' + (i === etapa ? ' ativo' : '')}>{p}</span>
          </span>
        ))}
      </div>
      <span className="pill-privado"><Ic d={P.lock} size={13} color="var(--verde)" sw={2.2} />Seus dados nunca saem do seu computador</span>
    </div>
  );
}

Object.assign(window, { NATUREZAS, SIGLAS, LANCAMENTOS, AVISOS_INICIAIS, fmt, Ic, P, Cabecalho });
