const COLS = [
  { id: 'fonte', titulo: 'Fonte', ro: true, w: 128 },
  { id: 'data', titulo: 'Data', ro: true, w: 82 },
  { id: 'transcricao', titulo: 'Transcrição', ro: true, w: 290 },
  { id: 'iniciais', titulo: 'Iniciais', w: 76 },
  { id: 'natureza', titulo: 'Natureza', w: 96 },
  { id: 'descricao', titulo: 'Descrição', w: 180 },
  { id: 'valor', titulo: 'Valor', w: 118, num: true },
];

function statusDe(l) {
  if (l.tipo === 'investimento') return 'inv';
  if (l.tipo === 'transferencia') return 'trf';
  if (l.natureza === '' || !SIGLAS.has(l.natureza)) return 'atencao';
  return null;
}

function TelaRevisao() {
  const [lancs, setLancs] = React.useState(LANCAMENTOS);
  const [avisos, setAvisos] = React.useState(AVISOS_INICIAIS);
  const removidosRef = React.useRef({});
  const [undoStack, setUndoStack] = React.useState([]);
  const [redoStack, setRedoStack] = React.useState([]);
  const [sujo, setSujo] = React.useState(false);
  const [fFonte, setFFonte] = React.useState(new Set());
  const [fNat, setFNat] = React.useState(new Set());
  const [fTipo, setFTipo] = React.useState(new Set());
  const [sort, setSort] = React.useState(null);
  const [selecao, setSelecao] = React.useState(new Set());
  const [edit, setEdit] = React.useState(null);
  const [painel, setPainel] = React.useState(null); // 'avisos' | 'naturezas' | null
  const [inspecao, setInspecao] = React.useState(null);
  const [split, setSplit] = React.useState(null);
  const [exportar, setExportar] = React.useState(null); // null | 'confirmar' | 'feito'
  const [mes, setMes] = React.useState('06');
  const [ano, setAno] = React.useState('2026');
  const gridRef = React.useRef(null);
  const linhaRefs = React.useRef({});

  // Abre o painel de avisos automaticamente quando há propostas pendentes na chegada
  React.useEffect(() => { if (avisos.some(a => a.tipo === 'proposta' && a.estado === 'pendente')) setPainel('avisos'); }, []);

  function mutar(fn) {
    setUndoStack(s => [...s.slice(-49), lancs]);
    setRedoStack([]);
    setLancs(fn);
    setSujo(true);
  }
  function desfazerEdicao() {
    if (!undoStack.length) return;
    setRedoStack(s => [...s, lancs]);
    setLancs(undoStack[undoStack.length - 1]);
    setUndoStack(s => s.slice(0, -1));
  }
  function refazerEdicao() {
    if (!redoStack.length) return;
    setUndoStack(s => [...s, lancs]);
    setLancs(redoStack[redoStack.length - 1]);
    setRedoStack(s => s.slice(0, -1));
  }
  React.useEffect(() => {
    function onKey(e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); desfazerEdicao(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); refazerEdicao(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function commitCelula(id, campo, valor) {
    setEdit(null);
    const l = lancs.find(x => x.id === id);
    if (!l || String(l[campo]) === valor) return;
    if (campo === 'iniciais' && valor.includes('/')) { setSplit({ id, partes: valor.split('/').filter(Boolean) }); return; }
    mutar(prev => prev.map(x => x.id === id ? { ...x, [campo]: campo === 'valor' ? (parseFloat(valor.replace(/\./g, '').replace(',', '.')) || x.valor) : (campo === 'natureza' || campo === 'iniciais' ? valor.toUpperCase().trim() : valor) } : x));
  }
  function confirmarSplit(partes) {
    const alvo = split.id;
    mutar(prev => {
      const i = prev.findIndex(x => x.id === alvo);
      const l = prev[i];
      const n = partes.length;
      const cota = Math.floor((l.valor / n) * 100) / 100;
      const novas = partes.map((ini, k) => ({ ...l, id: l.id + '-' + k, iniciais: ini, valor: k === n - 1 ? +(l.valor - cota * (n - 1)).toFixed(2) : cota }));
      return [...prev.slice(0, i), ...novas, ...prev.slice(i + 1)];
    });
    setSplit(null);
  }

  // --- Avisos ---
  const avisoInsp = inspecao ? avisos.find(a => a.id === inspecao) : null;
  function aplicarAviso(id) {
    const a = avisos.find(x => x.id === id);
    removidosRef.current[id] = lancs.map((l, i) => ({ l, i })).filter(({ l }) => a.alvo.includes(l.id));
    mutar(prev => prev.filter(l => !a.alvo.includes(l.id)));
    setAvisos(prev => prev.map(x => x.id === id ? { ...x, estado: 'aplicado' } : x));
    if (inspecao === id) setInspecao(null);
  }
  function desfazerAviso(id) {
    const rem = removidosRef.current[id];
    if (rem) mutar(prev => { const c = [...prev]; rem.forEach(({ l, i }) => c.splice(Math.min(i, c.length), 0, l)); return c; });
    setAvisos(prev => prev.map(x => x.id === id ? { ...x, estado: 'pendente' } : x));
  }
  function dispensarAviso(id) {
    const a = avisos.find(x => x.id === id);
    if (a.tipo === 'informativo') setAvisos(prev => prev.filter(x => x.id !== id));
    else setAvisos(prev => prev.map(x => x.id === id ? { ...x, estado: 'dispensado' } : x));
    if (inspecao === id) setInspecao(null);
  }
  function verNaPlanilha(id) {
    const novo = inspecao === id ? null : id;
    setInspecao(novo);
    if (novo) {
      const a = avisos.find(x => x.id === novo);
      setTimeout(() => {
        const el = linhaRefs.current[a.alvo[0]];
        const cont = gridRef.current;
        if (el && cont) cont.scrollTo({ top: Math.max(0, el.offsetTop - cont.clientHeight / 2), behavior: 'smooth' });
      }, 60);
    }
  }

  // --- Derivações ---
  const fontes = [...new Set(lancs.map(l => l.fonte))];
  const natsUsadas = [...new Set(lancs.map(l => l.natureza).filter(Boolean))];
  const contaTipo = t => lancs.filter(l => statusDe(l) === t).length;
  const pendentes = contaTipo('atencao');
  const classificados = lancs.length - pendentes;

  let visiveis = lancs.filter(l => {
    if (inspecao) return true; // filtros suspensos durante a inspeção
    if (fFonte.size && !fFonte.has(l.fonte)) return false;
    if (fNat.size && !fNat.has(l.natureza)) return false;
    return true;
  });
  if (sort) {
    visiveis = [...visiveis].sort((a, b) => {
      const va = a[sort.col], vb = b[sort.col];
      const c = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
      return sort.dir === 'asc' ? c : -c;
    });
  }
  const somaSel = [...selecao].reduce((s, id) => s + (lancs.find(l => l.id === id)?.valor ?? 0), 0);
  const propostasPendentes = avisos.filter(a => a.tipo === 'proposta' && a.estado === 'pendente').length;
  const avisosVivos = avisos.length;

  function toggleSet(set, setter, v) { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); setter(n); }
  function ciclarSort(col) { setSort(s => !s || s.col !== col ? { col, dir: 'asc' } : s.dir === 'asc' ? { col, dir: 'desc' } : null); }
  function papelInspecao(id) {
    if (!avisoInsp) return null;
    if (avisoInsp.alvo.includes(id)) return 'sai';
    if (avisoInsp.permanece.includes(id)) return 'fica';
    return null;
  }

  return (
    <div className="tela">
      {/* Header único: identidade + status + ações */}
      <div className="toolbar compacta">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span className="logo mini"><Ic d="M3 7h18M3 12h18M3 17h10" color="#faf8f3" size={13} sw={2.2} /></span>
          <span className="progresso" title={pendentes + ' ainda sem natureza'}>
            <span className="prog-barra"><span className="prog-fill" style={{ width: (classificados / lancs.length * 100) + '%' }} /></span>
            <span style={{ whiteSpace: 'nowrap' }}>{classificados} de {lancs.length} classificados</span>
          </span>
          {sujo && <span className="chip-sujo" title="Os dados vivem apenas nesta aba — exporte antes de fechar."><span className="ponto" />não exportado</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn sec icone" disabled={!undoStack.length} onClick={desfazerEdicao} title="Desfazer (Ctrl+Z)"><Ic d={P.undo} /></button>
          <button className="btn sec icone" disabled={!redoStack.length} onClick={refazerEdicao} title="Refazer (Ctrl+Shift+Z)"><Ic d={P.redo} /></button>
          <span className="grupo-mes" title="Mês que dá nome ao arquivo exportado e separa fatura de extrato">
            <span className="grupo-mes-rotulo">Mês ref.</span>
            <select className="sel-mini" value={mes} onChange={e => setMes(e.target.value)}>{['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => <option key={m}>{m}</option>)}</select>
            <span style={{ color: 'var(--muted-2)' }}>/</span>
            <select className="sel-mini" value={ano} onChange={e => setAno(e.target.value)}>{['2027','2026','2025','2024'].map(a => <option key={a}>{a}</option>)}</select>
          </span>
          <button className={'btn sec' + (painel === 'avisos' ? ' ativo' : '')} onClick={() => setPainel(p => p === 'avisos' ? null : 'avisos')} style={{ position: 'relative' }}>
            <Ic d={P.sino} />Avisos
            {propostasPendentes > 0 && <span className="badge">{propostasPendentes}</span>}
          </button>
          <button className={'btn sec' + (painel === 'naturezas' ? ' ativo' : '')} onClick={() => setPainel(p => p === 'naturezas' ? null : 'naturezas')}><Ic d={P.livro} />Naturezas</button>
          <button className="btn pri" onClick={() => setExportar('confirmar')} style={{ position: 'relative' }}>
            <Ic d={P.download} color="#faf8f3" />Exportar .xlsx
            {pendentes > 0 && <span className="badge peach" title={pendentes + ' linhas sem natureza'}>{pendentes}</span>}
          </button>
        </div>
      </div>

      {/* Filtros: estado (legenda clicável) + fonte */}
      <div className="filtros">
        <span className="filtro-grupo">
          {fontes.map(f => <button key={f} className={'chip' + (fFonte.has(f) ? ' on' : '')} onClick={() => toggleSet(fFonte, setFFonte, f)}>{f}</button>)}
        </span>
        {natsUsadas.length > 0 && <span className="divisor" />}
        <span className="filtro-grupo">
          {natsUsadas.slice(0, 6).map(n => <button key={n} className={'chip' + (fNat.has(n) ? ' on' : '')} onClick={() => toggleSet(fNat, setFNat, n)}>{n}</button>)}
        </span>
        {(fFonte.size || fNat.size) > 0 && <button className="btn-limpar" onClick={() => { setFFonte(new Set()); setFNat(new Set()); }}>Limpar</button>}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{visiveis.length} de {lancs.length} visíveis</span>
      </div>

      {/* Corpo: grid + painel lateral lado a lado */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {avisoInsp && (
            <div className="banner-inspecao">
              <Ic d={P.eye} size={15} color="var(--texto-2)" />
              <span style={{ fontWeight: 700 }}>Inspecionando proposta</span>
              <span className="tag-insp sai">sai</span><span style={{ color: 'var(--texto-3)' }}>{avisoInsp.alvo.length} linha{avisoInsp.alvo.length > 1 ? 's' : ''}</span>
              {avisoInsp.permanece.length > 0 && <><span className="tag-insp fica">fica</span><span style={{ color: 'var(--texto-3)' }}>{avisoInsp.permanece.length} linhas</span></>}
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>· filtros suspensos</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="btn sec mini" onClick={() => aplicarAviso(avisoInsp.id)}><Ic d={P.check} size={13} sw={2.6} />Aprovar</button>
                <button className="btn sec mini" onClick={() => dispensarAviso(avisoInsp.id)}>Dispensar</button>
                <button className="btn sec mini icone" onClick={() => setInspecao(null)} title="Fechar inspeção"><Ic d={P.x} size={13} /></button>
              </span>
            </div>
          )}
          <div className="grid-wrap" ref={gridRef}>
            <table className="gtab">
              <colgroup><col style={{ width: 44 }} />{COLS.map(c => <col key={c.id} style={{ width: c.w }} />)}</colgroup>
              <thead><tr>
                <th></th>
                {COLS.map(c => (
                  <th key={c.id} className={c.ro ? 'ro' : ''} onClick={() => ciclarSort(c.id)} style={c.num ? { textAlign: 'right' } : {}}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {c.ro && <Ic d={P.lock} size={10} color="var(--muted-2)" sw={2.4} />}{c.titulo}
                      <span className="sort-ind">{sort?.col === c.id ? (sort.dir === 'asc' ? '↑' : '↓') : ''}</span>
                    </span>
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {visiveis.map(l => {
                  const papel = papelInspecao(l.id);
                  const cls = papel ? 'insp-' + papel : '';
                  return (
                    <tr key={l.id} ref={el => linhaRefs.current[l.id] = el} className={cls}>
                      <td className={'marcador' + (selecao.has(l.id) ? ' sel' : '')} onClick={() => toggleSet(selecao, setSelecao, l.id)} title="Clique para somar a seleção">
                        {papel ? <span className={'tag-insp ' + papel}>{papel}</span> : lancs.indexOf(l) + 1}
                      </td>
                      {COLS.map(c => {
                        const emEdicao = edit && edit.id === l.id && edit.campo === c.id;
                        const v = c.id === 'valor' ? l.valor : l[c.id];
                        return (
                          <td key={c.id} className={(c.ro ? 'ro' : 'edit') + (c.num ? ' num' : '')}
                            onClick={c.ro ? undefined : () => setEdit({ id: l.id, campo: c.id })}>
                            {emEdicao ? (
                              c.id === 'natureza'
                                ? <EditorNatureza inicial={l.natureza} onCommit={val => commitCelula(l.id, 'natureza', val)} />
                                : <input className="cel-input" autoFocus defaultValue={c.id === 'valor' ? String(l.valor).replace('.', ',') : v}
                                    onBlur={e => commitCelula(l.id, c.id, e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEdit(null); }} />
                            ) : c.id === 'valor' ? (
                              <span className={'valor ' + (v < 0 ? 'neg' : 'pos')}><span className="moeda">{v < 0 ? '-R$' : 'R$'}</span>{Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            ) : c.id === 'natureza' && v && !SIGLAS.has(v) ? (
                              <span style={{ color: 'var(--terracota)', fontWeight: 700 }} title="Código fora da lista de naturezas">{v}</span>
                            ) : (v || (c.id === 'natureza' && statusDe(l) === 'atencao' ? <span className="vazio">—</span> : ''))}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {selecao.size > 0 && (
            <div className="rodape-soma">
              <button className="btn-limpar" onClick={() => setSelecao(new Set())}>Limpar seleção</button>
              <span style={{ marginLeft: 'auto', fontWeight: 800 }}>{selecao.size} selecionado{selecao.size > 1 ? 's' : ''} · soma</span>
              <span className={'valor ' + (somaSel < 0 ? 'neg' : 'pos')} style={{ fontSize: 15, fontWeight: 800 }}>{fmt(somaSel)}</span>
            </div>
          )}
        </div>

        {painel && (
          <PainelLateral aba={painel} setAba={setPainel} avisos={avisos} avisosVivos={avisosVivos} propostasPendentes={propostasPendentes}
            inspecao={inspecao} verNaPlanilha={verNaPlanilha} aplicar={aplicarAviso} dispensar={dispensarAviso} desfazerAviso={desfazerAviso} />
        )}
      </div>

      {split && <SplitModal split={split} lanc={lancs.find(l => l.id === split.id)} onConfirmar={confirmarSplit} onCancelar={() => setSplit(null)} />}
      {exportar && <ExportModal fase={exportar} setFase={setExportar} pendentes={pendentes} nome={ano + '-' + mes + '-ES.xlsx'} onExportado={() => setSujo(false)} />}
    </div>
  );
}

function EditorNatureza({ inicial, onCommit }) {
  const [v, setV] = React.useState(inicial);
  const sugestoes = NATUREZAS.filter(n => n.sigla.startsWith(v.toUpperCase()) || n.nome.toLowerCase().includes(v.toLowerCase())).slice(0, 5);
  return (
    <span style={{ position: 'relative', display: 'block' }}>
      <input className="cel-input" autoFocus value={v} onChange={e => setV(e.target.value.toUpperCase())}
        onKeyDown={e => { if (e.key === 'Enter') onCommit(v); if (e.key === 'Escape') onCommit(inicial); }}
        onBlur={() => setTimeout(() => onCommit(v), 120)} />
      {sugestoes.length > 0 && (
        <span className="sugestoes">
          {sugestoes.map(n => (
            <button key={n.sigla} className="sugestao" onMouseDown={e => { e.preventDefault(); onCommit(n.sigla); }}>
              <strong>{n.sigla}</strong><span>{n.nome}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function PainelLateral({ aba, setAba, avisos, avisosVivos, propostasPendentes, inspecao, verNaPlanilha, aplicar, dispensar, desfazerAviso }) {
  const informativos = avisos.filter(a => a.tipo === 'informativo');
  const propostas = avisos.filter(a => a.tipo === 'proposta');
  return (
    <aside className="painel">
      <div className="painel-abas">
        <button className={'aba' + (aba === 'avisos' ? ' on' : '')} onClick={() => setAba('avisos')}>Avisos{propostasPendentes > 0 && <span className="badge inline">{propostasPendentes}</span>}</button>
        <button className={'aba' + (aba === 'naturezas' ? ' on' : '')} onClick={() => setAba('naturezas')}>Naturezas</button>
        <button className="btn sec mini icone" style={{ marginLeft: 'auto' }} onClick={() => setAba(null)} title="Fechar painel"><Ic d={P.x} size={13} /></button>
      </div>
      <div className="painel-corpo">
        {aba === 'avisos' ? (
          avisosVivos === 0 ? <div className="painel-vazio"><Ic d={P.check} size={22} color="var(--verde)" />Nenhum aviso — tudo certo.</div> : (
            <>
              {propostas.length > 0 && <div className="painel-secao">Propostas</div>}
              {propostas.map(a => (
                <div key={a.id} className={'card-aviso' + (inspecao === a.id ? ' inspecionando' : '') + (a.estado !== 'pendente' ? ' resolvido' : '')}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span className="icone-aviso proposta"><Ic d={P.divide} size={13} color="var(--azul)" sw={2.3} /></span>
                    <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>{a.mensagem}{a.resumo && <div style={{ color: 'var(--muted)', marginTop: 4, fontSize: 12.5 }}>{a.resumo}</div>}</div>
                  </div>
                  {inspecao === a.id && (
                    <div className="legenda-insp">
                      <span><span className="tag-insp sai">sai</span>{a.alvo.length} linha{a.alvo.length > 1 ? 's' : ''} removida{a.alvo.length > 1 ? 's' : ''}</span>
                      {a.permanece.length > 0 && <span><span className="tag-insp fica">fica</span>{a.permanece.length} linhas mantidas</span>}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
                    {a.estado === 'pendente' ? (
                      <>
                        <button className="btn sec mini" onClick={() => aplicar(a.id)}><Ic d={P.check} size={12} sw={2.6} />Aprovar</button>
                        <button className="btn sec mini" onClick={() => dispensar(a.id)}>Dispensar</button>
                        <button className={'btn mini ver' + (inspecao === a.id ? ' on' : '')} onClick={() => verNaPlanilha(a.id)} style={{ marginLeft: 'auto' }}>
                          <Ic d={P.eye} size={13} />{inspecao === a.id ? 'Ocultar' : 'Ver na planilha'}
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="estado-aviso">{a.estado === 'aplicado' ? '✓ Aprovada' : 'Dispensada'}</span>
                        <button className="btn sec mini" style={{ marginLeft: 'auto' }} onClick={() => desfazerAviso(a.id)}>Desfazer</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {informativos.length > 0 && <div className="painel-secao">Informativos</div>}
              {informativos.map(a => (
                <div key={a.id} className="card-aviso">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span className="icone-aviso info"><Ic d={P.info} size={13} color="var(--terracota)" sw={2.3} /></span>
                    <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>{a.mensagem}</div>
                  </div>
                  <div style={{ display: 'flex', marginTop: 8 }}><button className="btn sec mini" onClick={() => dispensar(a.id)}>Ok, entendi</button></div>
                </div>
              ))}
            </>
          )
        ) : (
          NATUREZAS.map(n => (
            <div key={n.sigla} className="nat-item">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="nat-sigla">{n.sigla}</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{n.nome}</span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--texto-3)', lineHeight: 1.5 }}>{n.desc}</p>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function SplitModal({ split, lanc, onConfirmar, onCancelar }) {
  const [partes, setPartes] = React.useState(split.partes.length ? split.partes : ['']);
  const n = partes.length;
  const cota = Math.floor((lanc.valor / n) * 100) / 100;
  return (
    <div className="overlay" onClick={onCancelar}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-titulo">Ratear entre pessoas</h2>
        <p style={{ margin: '7px 0 18px', fontSize: 14, color: 'var(--texto-3)' }}><strong style={{ color: 'var(--texto)' }}>{lanc.transcricao}</strong> — <span style={{ fontWeight: 700 }}>{fmt(lanc.valor)}</span></p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {partes.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input className="input" style={{ width: 110 }} value={p} placeholder="Iniciais" onChange={e => setPartes(prev => prev.map((x, k) => k === i ? e.target.value.toUpperCase() : x))} />
              <span style={{ flex: 1, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(i === n - 1 ? +(lanc.valor - cota * (n - 1)).toFixed(2) : cota)}</span>
              {n > 1 && <button className="btn sec mini icone" onClick={() => setPartes(prev => prev.filter((_, k) => k !== i))}><Ic d={P.x} size={12} /></button>}
            </div>
          ))}
        </div>
        <button className="btn-limpar" style={{ marginTop: 10 }} onClick={() => setPartes(prev => [...prev, ''])}>+ Adicionar pessoa</button>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '12px 0 0' }}>A linha vira {n} linha{n > 1 ? 's' : ''}, uma por pessoa; a última absorve a sobra do arredondamento.</p>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn sec" onClick={onCancelar}>Cancelar</button>
          <button className="btn pri" disabled={partes.some(p => !p.trim())} onClick={() => onConfirmar(partes)}>Confirmar rateio</button>
        </div>
      </div>
    </div>
  );
}

function ExportModal({ fase, setFase, pendentes, nome, onExportado }) {
  return (
    <div className="overlay" onClick={() => setFase(null)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {fase === 'confirmar' ? (
          <>
            <h2 className="modal-titulo">Exportar planilha</h2>
            <div className="arquivo-nome"><Ic d={P.file} size={16} color="var(--verde)" />{nome}</div>
            {pendentes > 0 && (
              <div className="alerta-export"><Ic d={P.alerta} size={15} color="var(--terracota)" sw={2.2} />{pendentes} lançamento{pendentes > 1 ? 's' : ''} ainda sem natureza — {pendentes > 1 ? 'irão' : 'irá'} em branco e o Excel {pendentes > 1 ? 'os marcará' : 'o marcará'} em vermelho.</div>
            )}
            <p style={{ fontSize: 13.5, color: 'var(--texto-3)', lineHeight: 1.55, margin: '14px 0 0' }}>O arquivo usa o modelo fixo: fórmulas de saldo, totais e formatação já vêm prontos.</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
              <button className="btn sec" onClick={() => setFase(null)}>Continuar revisando</button>
              <button className="btn pri" onClick={() => { setFase('feito'); onExportado(); }}><Ic d={P.download} color="#faf8f3" />Baixar .xlsx</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
              <span className="check-grande"><Ic d={P.check} size={26} color="#faf8f3" sw={2.6} /></span>
              <h2 className="modal-titulo" style={{ marginTop: 14 }}>Planilha exportada</h2>
              <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4 }}>{nome}</div>
            </div>
            <div className="dica-dic">
              <Ic d={P.book} size={16} color="var(--verde)" />
              <span>Guarde este arquivo: no mês que vem, solte-o junto com os extratos e o app <strong>preenche sozinho</strong> o que você classificou aqui.</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
              <button className="btn sec" onClick={() => setFase(null)}>Fechar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { TelaRevisao });
