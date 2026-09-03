import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  api, type Contratada, type Testemunha, type RepresentanteContratada, type EmpresaConfig,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, Label, Spinner } from '@/components/ui/misc';
import { ArrowLeft, Plus, Trash2, Save, AlertTriangle, CheckCircle2 } from 'lucide-react';

const repVazio: RepresentanteContratada = { nome: '', cpf: '' };

export default function AdminEmpresaPage() {
  const nav = useNavigate();
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [pendencias, setPendencias] = useState<string[]>([]);
  const [completa, setCompleta] = useState(false);

  const [contratada, setContratada] = useState<Contratada>({
    razao_social: '', cnpj: '', endereco: '', email: '', representantes: [{ ...repVazio }],
  });
  const [testemunhas, setTestemunhas] = useState<Testemunha[]>([{ nome: '', cpf: '' }, { nome: '', cpf: '' }]);
  const [privacidadeUrl, setPrivacidadeUrl] = useState('');

  function aplicar(cfg: EmpresaConfig) {
    setPrivacidadeUrl(cfg.privacidadeUrl ?? '');
    setContratada(cfg.contratada ?? { razao_social: '', cnpj: '', endereco: '', email: '', representantes: [{ ...repVazio }] });
    if (cfg.contratada && (!cfg.contratada.representantes || cfg.contratada.representantes.length === 0)) {
      setContratada((c) => ({ ...c, representantes: [{ ...repVazio }] }));
    }
    setTestemunhas(cfg.testemunhas.length ? cfg.testemunhas : [{ nome: '', cpf: '' }, { nome: '', cpf: '' }]);
    setPendencias(cfg.pendencias);
    setCompleta(cfg.completa);
  }

  useEffect(() => {
    (async () => {
      try {
        const { user } = await api.adminMe();
        if (user.must_change_password) { nav('/trocar-senha', { replace: true }); return; }
        if (user.role !== 'admin') { nav('/vendedor', { replace: true }); return; }
        const cfg = await api.getEmpresa();
        aplicar(cfg);
      } catch {
        nav('/admin/login', { replace: true });
        return;
      } finally {
        setCarregando(false);
      }
    })();
  }, [nav]);

  function setRep(i: number, patch: Partial<RepresentanteContratada>) {
    setContratada((c) => ({ ...c, representantes: c.representantes.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  }
  function setTest(i: number, patch: Partial<Testemunha>) {
    setTestemunhas((t) => t.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  async function salvar() {
    setErro(''); setOk(''); setSalvando(true);
    try {
      await api.salvarContratada(contratada);
      await api.salvarTestemunhas(testemunhas);
      await api.salvarPrivacidadeUrl(privacidadeUrl);
      const cfg = await api.getEmpresa();
      aplicar(cfg);
      setOk('Configuração da empresa salva.');
    } catch (err: any) {
      setErro(err?.message || 'Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-6 w-6 text-brand-700" /></div>;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-2">
            <Link to="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> Painel</Button></Link>
            <h1 className="text-lg font-bold text-slate-900">Dados da CONTRATADA</h1>
          </div>
          {completa
            ? <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Completo</span>
            : <span className="inline-flex items-center gap-1 text-sm text-amber-700"><AlertTriangle className="h-4 w-4" /> Pendente</span>}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <p className="text-sm text-slate-500">
          Estes dados são usados em <strong>todos</strong> os contratos (CONTRATADA e testemunhas).
          Enquanto estiverem incompletos, a liberação de links fica bloqueada.
        </p>

        {!completa && pendencias.length > 0 && (
          <Card className="border-amber-200 bg-amber-50 p-4">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-800"><AlertTriangle className="h-4 w-4" /> Faltando:</p>
            <ul className="list-inside list-disc text-sm text-amber-800">
              {pendencias.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </Card>
        )}

        <Card className="space-y-4 p-5">
          <h2 className="text-base font-semibold text-slate-900">CONTRATADA (empresa)</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Razão social</Label><Input value={contratada.razao_social} onChange={(e) => setContratada({ ...contratada, razao_social: e.target.value })} /></div>
            <div><Label>CNPJ</Label><Input value={contratada.cnpj} onChange={(e) => setContratada({ ...contratada, cnpj: e.target.value })} /></div>
            <div><Label>E-mail (opcional)</Label><Input value={contratada.email ?? ''} onChange={(e) => setContratada({ ...contratada, email: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Endereço da sede</Label><Input value={contratada.endereco} onChange={(e) => setContratada({ ...contratada, endereco: e.target.value })} /></div>
          </div>

          <div className="pt-2">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Representantes</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => setContratada({ ...contratada, representantes: [...contratada.representantes, { ...repVazio }] })}>
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>
            <div className="space-y-4">
              {contratada.representantes.map((r, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Representante {i + 1}</span>
                    {contratada.representantes.length > 1 && (
                      <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => setContratada({ ...contratada, representantes: contratada.representantes.filter((_, idx) => idx !== i) })}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div><Label>Nome</Label><Input value={r.nome} onChange={(e) => setRep(i, { nome: e.target.value })} /></div>
                    <div><Label>CPF</Label><Input value={r.cpf} onChange={(e) => setRep(i, { cpf: e.target.value })} /></div>
                    <div><Label>Nacionalidade</Label><Input value={r.nacionalidade ?? ''} onChange={(e) => setRep(i, { nacionalidade: e.target.value })} /></div>
                    <div><Label>Estado civil</Label><Input value={r.estado_civil ?? ''} onChange={(e) => setRep(i, { estado_civil: e.target.value })} /></div>
                    <div><Label>Profissão</Label><Input value={r.profissao ?? ''} onChange={(e) => setRep(i, { profissao: e.target.value })} /></div>
                    <div><Label>RG</Label><Input value={r.rg ?? ''} onChange={(e) => setRep(i, { rg: e.target.value })} /></div>
                    <div className="sm:col-span-2"><Label>Endereço (opcional)</Label><Input value={r.endereco ?? ''} onChange={(e) => setRep(i, { endereco: e.target.value })} /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Testemunhas</h2>
            <Button type="button" variant="outline" size="sm" onClick={() => setTestemunhas([...testemunhas, { nome: '', cpf: '' }])}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
          <p className="text-xs text-slate-500">Mínimo de 2 testemunhas.</p>
          <div className="space-y-3">
            {testemunhas.map((t, i) => (
              <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div><Label>Nome</Label><Input value={t.nome} onChange={(e) => setTest(i, { nome: e.target.value })} /></div>
                <div><Label>CPF</Label><Input value={t.cpf} onChange={(e) => setTest(i, { cpf: e.target.value })} /></div>
                {testemunhas.length > 2 && (
                  <Button type="button" variant="outline" size="sm" className="mb-0.5" onClick={() => setTestemunhas(testemunhas.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="text-base font-semibold text-slate-900">Privacidade</h2>
          <div>
            <Label>Link da política de privacidade (opcional)</Label>
            <Input value={privacidadeUrl} onChange={(e) => setPrivacidadeUrl(e.target.value)} placeholder="https://suaempresa.com/privacidade" />
            <p className="mt-1 text-xs text-slate-400">Mostrado no aviso curto do formulário do cliente.</p>
          </div>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? <Spinner /> : <><Save className="h-4 w-4" /> Salvar</>}
          </Button>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          {ok && <p className="text-sm text-emerald-700">{ok}</p>}
        </div>
      </main>
    </div>
  );
}
