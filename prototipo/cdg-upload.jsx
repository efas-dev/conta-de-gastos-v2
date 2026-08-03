const ARQUIVOS_DEMO = [
  { nome: 'Nubank_2026-06-10.csv', status: 'ok', fontes: [{ n: 'Fatura Nubank', tipo: 'fatura' }], periodo: '28/05 – 09/06', linhas: 7 },
  { nome: 'NU_259227183_01JUN_30JUN.csv', status: 'ok', fontes: [{ n: 'Extrato Nubank', tipo: 'extrato' }], periodo: '01/06 – 30/06', linhas: 5 },
  { nome: 'Extrato Conta Corrente-020726.txt', status: 'ok', fontes: [{ n: 'Extrato Itaú', tipo: 'extrato' }], periodo: '01/06 – 28/06', linhas: 5 },
  { nome: 'fatura_bradesco.pdf', status: 'erro' },
];

function TelaUpload({ onProduzir }) {
  const [arquivos, setArquivos] = React.useState([]);
  const [analisando, setAnalisando] = React.useState(false);
  const [dic, setDic] = React.useState(null);
  const [iniciais, setIniciais] = React.useState('');
  const [nome, setNome] = React.useState('');
  const [mes, setMes] = React.useState('06');
  const [ano, setAno] = React.useState('2026');
  const [mesDetectado, setMesDetectado] = React.useState(false);
  const [lendo, setLendo] = React.useState(false);

  function carregarExemplos() {
    if (analisando || arquivos.length) return;
    setAnalisando(true);
    setTimeout(() => { setArquivos(ARQUIVOS_DEMO); setAnalisando(false); setMesDetectado(true); }, 900);
  }
  function carregarDic() {
    setDic({ nome: '2026-05-ES.xlsx', entradas: 214 });
    if (!iniciais) setIniciais('ES');
  }
  const ok = arquivos.filter(a => a.status === 'ok');
  const pronto = iniciais.trim() !== '' && ok.length > 0;
  function revisar() {
    if (!pronto || lendo) return;
    setLendo(true);
    setTimeout(onProduzir, 1100);
  }

  return (
    <div className="tela" style={{ overflowY: 'auto' }}>
      <Cabecalho etapa={0} />
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '38px 40px 56px' }}>
        <div style={{ width: '100%', maxWidth: 960 }}>
          <div style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto' }}>
            <h1 className="titulo">Importe seus extratos e faturas</h1>
            <p className="subtitulo">Solte os arquivos, revise como numa planilha e exporte o .xlsx pronto. Nada é enviado para lugar nenhum.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 18, marginTop: 30, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className={'dropzone' + (analisando ? ' ocupado' : '')} onClick={carregarExemplos} role="button" tabIndex={0}>
                <span className="icone-drop">{analisando ? <span className="spinner" /> : <Ic d={P.upload} size={25} color="var(--verde)" />}</span>
                <div style={{ marginTop: 14, fontSize: 16.5, fontWeight: 700 }}>{analisando ? 'Analisando arquivos…' : 'Arraste extratos e faturas aqui'}</div>
                <div style={{ marginTop: 5, fontSize: 13.5, color: 'var(--muted)' }}>ou clique para escolher · CSV, TXT ou PDF · vários de uma vez</div>
              </div>

              {arquivos.map(a => (
                <div key={a.nome} className={'arquivo' + (a.status === 'erro' ? ' erro' : '')}>
                  <span className="icone-arq" style={a.status === 'erro' ? { background: 'var(--linha-atencao)' } : {}}>
                    <Ic d={a.status === 'erro' ? P.alerta : P.file} size={17} color={a.status === 'erro' ? 'var(--terracota)' : 'var(--verde)'} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</div>
                    {a.status === 'ok' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--muted)' }}>
                        {a.fontes.map(f => (
                          <span key={f.n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <strong style={{ color: 'var(--texto-2)', fontWeight: 700 }}>{f.n}</strong>
                            <span className={'tag-tipo ' + f.tipo}>{f.tipo}</span>
                          </span>
                        ))}
                        <span>·</span><span>{a.periodo}</span><span>·</span><span>{a.linhas} lançamentos</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, color: 'var(--terracota)', fontWeight: 600, marginTop: 4 }}>Banco não reconhecido — veja os formatos suportados ao lado</div>
                    )}
                  </div>
                  <button className="btn-remover" onClick={() => setArquivos(prev => prev.filter(x => x !== a))}>Remover</button>
                </div>
              ))}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 10 }}>
                <label className="campo">
                  <span className="rotulo">Suas iniciais <em>*</em><span className="dica" title="Identificam de quem é cada lançamento na planilha — dá para ratear um gasto entre pessoas digitando ES/MC na linha.">?</span></span>
                  <input className="input" value={iniciais} placeholder="Ex.: ES" onChange={e => setIniciais(e.target.value.toUpperCase().trim())} />
                </label>
                <label className="campo">
                  <span className="rotulo">Seu nome <span className="opcional">(opcional)</span></span>
                  <input className="input" value={nome} placeholder="Ex.: Eduardo" onChange={e => setNome(e.target.value)} />
                </label>
                <div className="campo">
                  <span className="rotulo" style={{ whiteSpace: 'nowrap' }}>Mês de referência {mesDetectado && <span className="opcional" style={{ color: 'var(--verde)' }} title="Detectado dos arquivos importados">✓ auto</span>}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select className="input" value={mes} onChange={e => { setMes(e.target.value); setMesDetectado(false); }}>
                      {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => <option key={m}>{m}</option>)}
                    </select>
                    <select className="input" value={ano} onChange={e => { setAno(e.target.value); setMesDetectado(false); }}>
                      {['2027','2026','2025','2024'].map(a => <option key={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <button className="btn pri cta" disabled={!pronto} onClick={revisar} style={{ marginTop: 8 }}>
                {lendo ? <><span className="spinner claro" />Lendo arquivos…</> : <>Revisar lançamentos<Ic d={P.seta} size={17} color="#faf8f3" sw={2.2} /></>}
              </button>
              {!pronto && <div style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center' }}>{ok.length === 0 ? 'Adicione ao menos um arquivo para continuar' : 'Preencha suas iniciais para continuar'}</div>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className={'cartao-dic' + (dic ? ' carregado' : '')} onClick={dic ? undefined : carregarDic} role="button" tabIndex={0}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="icone-arq"><Ic d={P.book} size={17} color="var(--verde)" /></span>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>Planilha do mês anterior</div>
                  <span className="tag-tipo extrato" style={{ marginLeft: 'auto' }}>.xlsx</span>
                </div>
                {dic ? (
                  <div style={{ marginTop: 10, fontSize: 13, color: 'var(--texto-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700 }}><Ic d={P.check} size={13} color="var(--verde)" sw={2.6} />{dic.nome}</div>
                    <div style={{ color: 'var(--muted)', marginTop: 4 }}>{dic.entradas} lembretes de classificação · iniciais "ES" aplicadas</div>
                  </div>
                ) : (
                  <p style={{ margin: '9px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--texto-3)' }}>
                    Solte aqui o .xlsx exportado no mês passado: o app <strong>lembra como você classificou</strong> cada estabelecimento e preenche Natureza e Descrição sozinho.
                  </p>
                )}
              </div>

              <div className="cartao-info">
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Bancos suportados</div>
                <div className="linha-banco"><span>Nubank</span><span className="fmt">extrato CSV · fatura CSV</span></div>
                <div className="linha-banco"><span>Itaú</span><span className="fmt">extrato TXT · fatura PDF</span></div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 9, lineHeight: 1.5 }}>Prefira CSV/TXT — PDF pode falhar. Outro banco? <a href="#" onClick={e => e.preventDefault()}>Contribua com um parser</a>.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TelaUpload });
