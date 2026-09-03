import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  api, type ContratoConfig, type ModeloCatalogo, type AuditoriaItem, type ConfigContratoPayload,
  type DadosCliente,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Card, Label, Spinner, StatusBadge } from '@/components/ui/misc';
import { applyMask, validarCampo } from '@/lib/masks';
import {
  ArrowLeft, Save, LinkIcon, AlertTriangle, Copy, Check, ExternalLink, History, Building2,
  ClipboardCheck, RotateCcw, Pencil, FileText, X, FileCheck,
} from 'lucide-react';

function reaisParaCentavos(v: string): number {
  const n = Number(String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function centavosParaReais(c: number | null): string {
  if (!c) return '';
  return (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CopyLink({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button type="button" variant="outline" size="sm" onClick={async () => {
      await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500);
    }}>
      {ok ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      {ok ? 'Copiado' : 'Copiar link'}
    </Button>
  );
}

export default function AdminContratoConfigPage() {
  const nav = useNavigate();
  const { id } = useParams();
  const contratoId = Number(id);

  const [carregando, setCarregando] = useState(true);
  const [cfg, setCfg] = useState<ContratoConfig | null>(null);
  const [modelos, setModelos] = useState<ModeloCatalogo[]>([]);
  const [auditoria, setAuditoria] = useState<AuditoriaItem[]>([]);
  const [dadosCliente, setDadosCliente] = useState<DadosCliente | null>(null);
  const [reabrindo, setReabrindo] = useState(false);
  const [editandoDados, setEditandoDados] = useState(false);
  const [formEdit, setFormEdit] = useState<Record<string, string>>({});
  const [errosEdit, setErrosEdit] = useState<Record<string, string>>({});
  const [salvandoDados, setSalvandoDados] = useState(false);

  // Formulário
  const [tipoModelo, setTipoModelo] = useState('prestacao_servicos');
  const [tipoPessoa, setTipoPessoa] = useState<'pf' | 'pj' | ''>('');
  const [blocos, setBlocos] = useState<string[]>([]);
  const [socialMidia, setSocialMidia] = useState(false);
  const [fidAtiva, setFidAtiva] = useState(false);
  const [fidMeses, setFidMeses] = useState('');
  const [garAtiva, setGarAtiva] = useState(false);
  const [garInvest, setGarInvest] = useState('');
  const [garPeriodo, setGarPeriodo] = useState('');
  const [valor, setValor] = useState('');
  const [diaVenc, setDiaVenc] = useState('');
  const [limiteLeads, setLimiteLeads] = useState('');
  const [cidade, setCidade] = useState('');
  const [data, setData] = useState('');

  const [salvando, setSalvando] = useState(false);
  const [liberando, setLiberando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const modelo = useMemo(() => modelos.find((m) => m.id === tipoModelo), [modelos, tipoModelo]);
  const usaLeads = useMemo(
    () => blocos.some((b) => modelo?.blocos.find((x) => x.id === b)?.usaLimiteLeads),
    [blocos, modelo],
  );
  const funilSelecionado = useMemo(() => blocos.includes('funil'), [blocos]);

  const aplicar = useCallback((c: ContratoConfig) => {
    setCfg(c);
    setTipoModelo(c.tipo_modelo || 'prestacao_servicos');
    setTipoPessoa(c.tipo_pessoa || '');
    setBlocos(c.blocos);
    setSocialMidia(c.social_midia);
    setFidAtiva(c.fidelidade.ativo);
    setFidMeses(c.fidelidade.meses != null ? String(c.fidelidade.meses) : '');
    setGarAtiva(c.garantia.ativo);
    setGarInvest(centavosParaReais(c.garantia.investimentoCentavos));
    setGarPeriodo(c.garantia.periodoMeses != null ? String(c.garantia.periodoMeses) : '');
    setValor(centavosParaReais(c.valor_centavos));
    setDiaVenc(c.dia_vencimento != null ? String(c.dia_vencimento) : '');
    setLimiteLeads(c.limite_leads != null ? String(c.limite_leads) : '');
    setCidade(c.cidade_assinatura);
    setData(c.data_assinatura);
  }, []);

  const recarregarAuditoria = useCallback(() => {
    api.getAuditoria(contratoId).then((r) => setAuditoria(r.auditoria)).catch(() => {});
  }, [contratoId]);

  const recarregarDadosCliente = useCallback(() => {
    api.getDadosCliente(contratoId).then((r) => setDadosCliente(r.dados)).catch(() => {});
  }, [contratoId]);

  useEffect(() => {
    (async () => {
      try {
        const { user } = await api.adminMe();
        if (user.must_change_password) { nav('/trocar-senha', { replace: true }); return; }
        if (user.role !== 'admin') { nav('/vendedor', { replace: true }); return; }
        const [mods, conf] = await Promise.all([api.getModelos(), api.getContratoConfig(contratoId)]);
        setModelos(mods.modelos);
        aplicar(conf.config);
        recarregarAuditoria();
        recarregarDadosCliente();
      } catch {
        nav('/admin', { replace: true });
        return;
      } finally {
        setCarregando(false);
      }
    })();
  }, [nav, contratoId, aplicar, recarregarAuditoria, recarregarDadosCliente]);

  async function reabrir() {
    setErro(''); setOk(''); setReabrindo(true);
    try {
      const r = await api.reabrirFormulario(contratoId);
      aplicar(r.config);
      recarregarAuditoria();
      setOk('Formulário reaberto. O cliente pode corrigir os dados pelo mesmo link.');
    } catch (err: any) {
      setErro(err?.message || 'Erro ao reabrir.');
    } finally {
      setReabrindo(false);
    }
  }

  function iniciarEdicaoDados() {
    if (!dadosCliente) return;
    setFormEdit({ ...dadosCliente.valores });
    setErrosEdit({});
    setEditandoDados(true);
  }
  function setCampoEdit(campo: { name: string; type: string }, v: string) {
    setFormEdit((s) => ({ ...s, [campo.name]: applyMask(campo.type, v) }));
  }
  async function salvarDadosCliente() {
    if (!dadosCliente) return;
    const novos: Record<string, string> = {};
    for (const c of dadosCliente.campos) {
      const msg = validarCampo(c.type, c.required, formEdit[c.name] || '');
      if (msg) novos[c.name] = msg;
    }
    setErrosEdit(novos);
    if (Object.keys(novos).length > 0) return;
    if (!window.confirm('Confirmar a alteração dos dados do cliente? A mudança será registrada na auditoria (com valores mascarados).')) return;
    setErro(''); setOk(''); setSalvandoDados(true);
    try {
      const r = await api.editarDadosCliente(contratoId, formEdit, true);
      setDadosCliente(r.dados);
      setEditandoDados(false);
      recarregarAuditoria();
      setOk('Dados do cliente atualizados.');
    } catch (err: any) {
      if (err?.data?.erros) { setErrosEdit(err.data.erros); setErro('Confira os campos destacados.'); }
      else setErro(err?.message || 'Erro ao salvar os dados.');
    } finally {
      setSalvandoDados(false);
    }
  }

  function toggleBloco(bid: string) {
    setBlocos((b) => {
      const novo = b.includes(bid) ? b.filter((x) => x !== bid) : [...b, bid];
      // Social Mídia depende do Funil: ao remover o Funil, desativa o modificador.
      if (bid === 'funil' && !novo.includes('funil')) setSocialMidia(false);
      return novo;
    });
  }

  function montarPayload(flags: { blocos?: boolean; comLink?: boolean; garantia?: boolean } = {}): ConfigContratoPayload {
    return {
      tipoModelo,
      tipoPessoa: tipoPessoa as 'pf' | 'pj',
      blocos,
      socialMidia: funilSelecionado && socialMidia,
      fidelidadeAtiva: fidAtiva,
      fidelidadeMeses: fidAtiva ? Number(fidMeses) : null,
      garantiaAtiva: garAtiva,
      garantiaInvestimentoCentavos: garAtiva ? reaisParaCentavos(garInvest) : null,
      garantiaPeriodoMeses: garAtiva ? Number(garPeriodo) : null,
      confirmarGarantia: !!flags.garantia,
      valorCentavos: reaisParaCentavos(valor),
      diaVencimento: Number(diaVenc),
      limiteLeads: usaLeads ? Number(limiteLeads) : null,
      cidadeAssinatura: cidade,
      dataAssinatura: data,
      confirmarAlteracaoBlocos: !!flags.blocos,
      confirmarAlteracaoComLink: !!flags.comLink,
    };
  }

  async function salvar(flags: { blocos?: boolean; comLink?: boolean; garantia?: boolean } = {}) {
    setErro(''); setOk(''); setSalvando(true);
    try {
      const r = await api.salvarContratoConfig(contratoId, montarPayload(flags));
      aplicar(r.config);
      recarregarAuditoria();
      setOk('Configuração salva.');
    } catch (err: any) {
      const code = err?.data?.code;
      if (code === 'confirmar_garantia') {
        if (window.confirm(`${err.message}\n\nA Garantia implica OBRIGAÇÃO FINANCEIRA (possível devolução integral das mensalidades). A ativação será registrada na auditoria. Confirmar a ativação da garantia?`)) {
          await salvar({ ...flags, garantia: true });
          return;
        }
        setErro('Ativação da garantia cancelada.');
      } else if (code === 'confirmar_alteracao_blocos') {
        if (window.confirm('Você alterou os blocos de serviço deste contrato. Confirmar a alteração? (será registrado na auditoria)')) {
          await salvar({ ...flags, blocos: true });
          return;
        }
        setErro('Alteração de blocos cancelada.');
      } else if (code === 'confirmar_alteracao_com_link') {
        if (window.confirm(`${err.message}\n\nConfirmar? O link atual será invalidado e o contrato voltará para revisão.`)) {
          await salvar({ ...flags, comLink: true });
          return;
        }
        setErro('Alteração cancelada.');
      } else {
        setErro(err?.message || 'Erro ao salvar.');
      }
    } finally {
      setSalvando(false);
    }
  }

  async function liberar() {
    setErro(''); setOk(''); setLiberando(true);
    try {
      const r = await api.liberarLink(contratoId);
      aplicar(r.config);
      recarregarAuditoria();
      setOk('Link gerado e liberado! O vendedor já pode ver e enviar ao cliente.');
    } catch (err: any) {
      const pend = err?.data?.pendencias as string[] | undefined;
      setErro((err?.message || 'Erro ao liberar.') + (pend?.length ? ` Faltando: ${pend.join(' ')}` : ''));
    } finally {
      setLiberando(false);
    }
  }

  if (carregando || !cfg) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-6 w-6 text-brand-700" /></div>;
  }

  const empresaOk = cfg.empresa_completa;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <Link to="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> Painel</Button></Link>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-slate-900">{cfg.clinica_nome}</h1>
              <p className="text-xs text-slate-500">Solicitado por {cfg.vendedor_nome || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {cfg.personalizado && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Contrato personalizado</span>
            )}
            <StatusBadge status={cfg.status} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {!empresaOk && (
          <Card className="border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
              <AlertTriangle className="h-4 w-4" /> Dados da CONTRATADA/testemunhas incompletos
            </p>
            <p className="mt-1 text-sm text-amber-800">
              O link só pode ser liberado depois de preencher os dados da empresa.
            </p>
            <Link to="/admin/empresa" className="mt-2 inline-block">
              <Button variant="outline" size="sm"><Building2 className="h-4 w-4" /> Configurar empresa</Button>
            </Link>
          </Card>
        )}

        {/* Link já liberado */}
        {cfg.link && (
          <Card className="border-emerald-200 bg-emerald-50 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-800"><LinkIcon className="h-4 w-4" /> Link do cliente</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 break-all rounded-md bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-emerald-200">{cfg.link}</code>
              <CopyLink text={cfg.link} />
              <a href={cfg.link} target="_blank" rel="noreferrer"><Button variant="ghost" size="sm"><ExternalLink className="h-4 w-4" /> Abrir</Button></a>
            </div>
          </Card>
        )}

        {/* Configuração */}
        <Card className="space-y-5 p-5">
          <h2 className="text-base font-semibold text-slate-900">Configuração do contrato</h2>

          <div>
            <Label>Modelo</Label>
            <Select value={tipoModelo} onChange={(e) => setTipoModelo(e.target.value)}>
              {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </Select>
          </div>

          <div>
            <Label>Tipo de pessoa</Label>
            <div className="flex gap-2">
              {(['pf', 'pj'] as const).map((tp) => (
                <button key={tp} type="button" onClick={() => setTipoPessoa(tp)}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${tipoPessoa === tp ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                  {tp === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Blocos de serviço</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {modelo?.blocos.map((b) => (
                <label key={b.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition ${blocos.includes(b.id) ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={blocos.includes(b.id)} onChange={() => toggleBloco(b.id)} />
                  <span>
                    <span className="font-medium text-slate-800">
                      {b.label}
                      {!b.liberado && (
                        <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                          {!b.fonteConferida ? 'fonte pendente' : 'validação jurídica pendente'}
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-slate-500">{b.resumo}</span>
                  </span>
                </label>
              ))}
            </div>

            {/* Social Mídia — MODIFICADOR do Funil (não é bloco autônomo). */}
            <label
              className={`mt-2 flex items-start gap-2 rounded-lg border p-3 text-sm transition ${
                funilSelecionado ? 'cursor-pointer border-slate-200 hover:bg-slate-50' : 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-60'
              }`}
              title={funilSelecionado ? '' : 'Selecione o bloco Funil para habilitar Social Mídia'}
            >
              <input
                type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600"
                checked={funilSelecionado && socialMidia} disabled={!funilSelecionado}
                onChange={(e) => setSocialMidia(e.target.checked)}
              />
              <span>
                <span className="font-medium text-slate-800">Social Mídia (complemento do Funil)</span>
                <span className="block text-xs text-slate-500">
                  Inclui vídeos na elaboração dos anúncios e o item de conteúdos educacionais.
                  {' '}Requer o bloco Funil selecionado.
                  {' '}<span className="text-slate-400">
                    É apenas um complemento comercial — <strong>não</strong> altera a cláusula 9. A cláusula de
                    Propriedade Intelectual do Facebook (B2) é acionada pelo serviço <strong>“Facebook / Meta Ads”</strong>;
                    a do Google (B1) pelo serviço <strong>“Google Ads”</strong>.
                  </span>
                </span>
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Valor mensal (R$)</Label>
              <Input inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div>
              <Label>Dia de vencimento</Label>
              <Input inputMode="numeric" placeholder="1 a 31" value={diaVenc} onChange={(e) => setDiaVenc(e.target.value)} />
            </div>
            {usaLeads && (
              <div>
                <Label>Limite mensal de leads (CRC)</Label>
                <Input inputMode="numeric" placeholder="Ex.: 100" value={limiteLeads} onChange={(e) => setLimiteLeads(e.target.value)} />
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={fidAtiva} onChange={(e) => setFidAtiva(e.target.checked)} />
              Cláusula de fidelidade
            </label>
            {fidAtiva && (
              <div className="mt-3 max-w-[200px]">
                <Label>Meses de fidelidade</Label>
                <Input inputMode="numeric" placeholder="Ex.: 12" value={fidMeses} onChange={(e) => setFidMeses(e.target.value)} />
              </div>
            )}
          </div>

          {/* Garantia — opt-in SEPARADO, nunca padrão, com alerta de obrigação financeira. */}
          <div className={`rounded-lg border p-3 ${garAtiva ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
              <input type="checkbox" className="h-4 w-4 accent-amber-600" checked={garAtiva} onChange={(e) => setGarAtiva(e.target.checked)} />
              Garantia de resultados (opcional)
            </label>
            {garAtiva && (
              <>
                <p className="mt-2 flex items-start gap-2 rounded-md bg-amber-100 px-2 py-1.5 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Atenção: a garantia implica <b>obrigação financeira</b> — possível devolução integral das
                  mensalidades se as condições forem cumpridas e a meta não for atingida. A ativação exige
                  confirmação e é registrada na auditoria. Redação pendente de validação jurídica (bloqueia o PDF).
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Investimento mínimo de mídia paga (R$/mês)</Label>
                    <Input inputMode="decimal" placeholder="Ex.: 1.000,00" value={garInvest} onChange={(e) => setGarInvest(e.target.value)} />
                  </div>
                  <div>
                    <Label>Período da garantia (meses)</Label>
                    <Input inputMode="numeric" placeholder="Ex.: 6" value={garPeriodo} onChange={(e) => setGarPeriodo(e.target.value)} />
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Cidade de assinatura</Label>
              <Input value={cidade} onChange={(e) => setCidade(e.target.value)} />
            </div>
            <div>
              <Label>Data de assinatura</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <Button onClick={() => salvar()} disabled={salvando}>
              {salvando ? <Spinner /> : <><Save className="h-4 w-4" /> Salvar configuração</>}
            </Button>
            <Link to={`/admin/contratos/${contratoId}/editar`}>
              <Button variant="outline" type="button"><FileText className="h-4 w-4" /> Editar contrato</Button>
            </Link>
            <Link to={`/admin/contratos/${contratoId}/preview`}>
              <Button variant="outline" type="button"><FileCheck className="h-4 w-4" /> Prévia e PDF</Button>
            </Link>
            <Button variant="outline" onClick={liberar} disabled={liberando || !cfg.configurado || !empresaOk}>
              {liberando ? <Spinner /> : <><LinkIcon className="h-4 w-4" /> {cfg.link ? 'Regerar link' : 'Gerar e liberar link'}</>}
            </Button>
          </div>

          {!cfg.configurado && cfg.pendencias_contrato.length > 0 && (
            <p className="text-xs text-amber-700">Para liberar o link, faltam: {cfg.pendencias_contrato.join(' ')}</p>
          )}
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          {ok && <p className="text-sm text-emerald-700">{ok}</p>}
        </Card>

        {/* Dados recebidos do cliente (revisão + edição pela Manu) */}
        {dadosCliente && dadosCliente.valores && Object.keys(dadosCliente.valores).length > 0 && (
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <ClipboardCheck className="h-4 w-4" /> Dados do cliente
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {dadosCliente.tipo_pessoa === 'pj' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                </span>
              </h2>
              <div className="flex items-center gap-1">
                {!editandoDados ? (
                  <>
                    <Button variant="outline" size="sm" onClick={iniciarEdicaoDados}><Pencil className="h-4 w-4" /> Editar dados</Button>
                    <Button variant="ghost" size="sm" onClick={reabrir} disabled={reabrindo}>
                      {reabrindo ? <Spinner /> : <><RotateCcw className="h-4 w-4" /> Reabrir formulário</>}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" onClick={salvarDadosCliente} disabled={salvandoDados}>
                      {salvandoDados ? <Spinner /> : <><Save className="h-4 w-4" /> Salvar</>}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditandoDados(false)}><X className="h-4 w-4" /> Cancelar</Button>
                  </>
                )}
              </div>
            </div>
            {!editandoDados ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {dadosCliente.campos.map((c) => (
                  <div key={c.name} className="border-b border-slate-100 pb-1.5">
                    <dt className="text-xs text-slate-400">{c.label}</dt>
                    <dd className="text-sm text-slate-800">{dadosCliente.valores[c.name] || '—'}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {dadosCliente.campos.map((c) => (
                  <div key={c.name} className={c.colSpan === 2 ? 'sm:col-span-2' : ''}>
                    <Label>{c.label}{c.required && <span className="text-red-500"> *</span>}</Label>
                    {c.type === 'select' ? (
                      <Select value={formEdit[c.name] || ''} invalid={!!errosEdit[c.name]} onChange={(e) => setCampoEdit(c, e.target.value)}>
                        <option value="">Selecione...</option>
                        {c.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                    ) : (
                      <Input value={formEdit[c.name] || ''} invalid={!!errosEdit[c.name]} onChange={(e) => setCampoEdit(c, e.target.value)} />
                    )}
                    {errosEdit[c.name] && <p className="mt-1 text-xs text-red-600">{errosEdit[c.name]}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Auditoria */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><History className="h-4 w-4" /> Auditoria ({auditoria.length})</h2>
            <Button variant="ghost" size="sm" onClick={recarregarAuditoria}>Recarregar</Button>
          </div>
          {auditoria.length === 0 ? (
            <p className="text-sm text-slate-500">Sem registros ainda.</p>
          ) : (
            <div className="space-y-2">
              {auditoria.map((a) => (
                <div key={a.id} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">{a.acao}{a.campo ? ` · ${a.campo}` : ''}</span>
                    <span className="text-slate-400">{new Date(a.created_at).toLocaleString('pt-BR')}</span>
                  </div>
                  {(a.valor_antes != null || a.valor_depois != null) && (
                    <div className="mt-1 text-slate-500">
                      <span className="line-through opacity-70">{a.valor_antes ?? '—'}</span>
                      {' → '}
                      <span className="text-slate-700">{a.valor_depois ?? '—'}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
