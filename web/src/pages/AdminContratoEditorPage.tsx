import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api, type Clausula, type VersaoResumo, type VersaoCompleta } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, Label, Spinner } from '@/components/ui/misc';
import {
  ArrowLeft, Save, Plus, Trash2, History, GitCompare, RotateCcw, X, AlertTriangle,
} from 'lucide-react';

export default function AdminContratoEditorPage() {
  const nav = useNavigate();
  const { id } = useParams();
  const contratoId = Number(id);

  const [carregando, setCarregando] = useState(true);
  const [clausulas, setClausulas] = useState<Clausula[]>([]);
  const [personalizado, setPersonalizado] = useState(false);
  const [versaoAtual, setVersaoAtual] = useState(0);
  const [pendente, setPendente] = useState<string | null>(null);
  const [versoes, setVersoes] = useState<VersaoResumo[]>([]);
  const [comparando, setComparando] = useState<VersaoCompleta | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const carregarVersoes = useCallback(() => {
    api.getVersoes(contratoId).then((r) => setVersoes(r.versoes)).catch(() => {});
  }, [contratoId]);

  const carregar = useCallback(async () => {
    const r = await api.getConteudo(contratoId);
    if (!r.conteudo.disponivel) {
      setPendente(r.conteudo.aviso || 'Modelo jurídico pendente de validação');
      return;
    }
    setPendente(null);
    setClausulas(r.conteudo.conteudo.clausulas);
    setPersonalizado(r.conteudo.personalizado);
    setVersaoAtual(r.conteudo.versao);
  }, [contratoId]);

  useEffect(() => {
    (async () => {
      try {
        const { user } = await api.adminMe();
        if (user.must_change_password) { nav('/trocar-senha', { replace: true }); return; }
        if (user.role !== 'admin') { nav('/vendedor', { replace: true }); return; }
        await carregar();
        carregarVersoes();
      } catch {
        nav('/admin', { replace: true });
        return;
      } finally {
        setCarregando(false);
      }
    })();
  }, [nav, carregar, carregarVersoes]);

  function setClausula(i: number, patch: Partial<Clausula>) {
    setClausulas((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function adicionar() {
    setClausulas((cs) => [...cs, { id: `extra_${Date.now()}`, titulo: 'Nova cláusula', texto: '' }]);
  }
  function remover(i: number) {
    setClausulas((cs) => cs.filter((_, idx) => idx !== i));
  }

  async function salvar(confirmar = false, nota?: string) {
    setErro(''); setOk(''); setSalvando(true);
    try {
      await api.salvarConteudo(contratoId, clausulas, confirmar, nota);
      await carregar();
      carregarVersoes();
      setOk('Contrato personalizado salvo como nova versão.');
    } catch (err: any) {
      if (err?.data?.code === 'confirmar_alteracao_com_link') {
        if (window.confirm(`${err.message}\n\nConfirmar? O link atual será invalidado e o contrato voltará para revisão.`)) {
          await salvar(true, nota);
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

  async function verVersao(v: number) {
    try { const r = await api.getVersao(contratoId, v); setComparando(r.versao); } catch { /* ignore */ }
  }

  async function restaurar(v: number, confirmar = false) {
    setErro(''); setOk('');
    try {
      await api.restaurarVersao(contratoId, v, confirmar);
      setComparando(null);
      await carregar();
      carregarVersoes();
      setOk(`Versão ${v} restaurada como nova versão.`);
    } catch (err: any) {
      if (err?.data?.code === 'confirmar_alteracao_com_link') {
        if (window.confirm(`${err.message}\n\nConfirmar restauração?`)) { await restaurar(v, true); return; }
      } else {
        setErro(err?.message || 'Erro ao restaurar.');
      }
    }
  }

  if (carregando) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-6 w-6 text-brand-700" /></div>;
  }

  if (pendente) {
    return (
      <div className="min-h-screen">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4">
            <Link to={`/admin/contratos/${contratoId}`}><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> Voltar</Button></Link>
            <h1 className="text-lg font-bold text-slate-900">Editar contrato</h1>
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-16">
          <Card className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">{pendente}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              O editor só é liberado quando o conteúdo jurídico integral e fiel dos contratos
              originais estiver inserido e validado. Enquanto isso, a edição de cláusulas fica
              indisponível para evitar contratos com texto provisório.
            </p>
          </Card>
        </main>
      </div>
    );
  }

  // Mapa da versão em comparação, por id de cláusula.
  const compMap: Record<string, string> = {};
  if (comparando) for (const c of comparando.conteudo.clausulas) compMap[c.id] = c.texto;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-2">
            <Link to={`/admin/contratos/${contratoId}`}><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> Voltar</Button></Link>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Editar contrato</h1>
              <p className="text-xs text-slate-500">Versão atual: {versaoAtual || 'base (modelo)'}</p>
            </div>
          </div>
          {personalizado && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Contrato personalizado</span>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[1fr_320px]">
        {/* Editor de cláusulas */}
        <div className="space-y-4">
          <Card className="border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
            Os textos originais do modelo são preservados. Ao salvar, é criada uma <strong>versão personalizada</strong> deste contrato — o modelo-base usado nos demais contratos não muda. Alterar um contrato com link liberado invalida o link e exige confirmação.
          </Card>

          {clausulas.map((c, i) => (
            <Card key={c.id} className="space-y-2 p-4">
              <div className="flex items-center gap-2">
                <Input value={c.titulo} onChange={(e) => setClausula(i, { titulo: e.target.value })} className="h-10 font-semibold" />
                <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => remover(i)} title="Remover cláusula">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <textarea
                value={c.texto}
                onChange={(e) => setClausula(i, { texto: e.target.value })}
                rows={Math.max(3, (c.texto.match(/\n/g)?.length ?? 0) + 2)}
                className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-800 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/40"
              />
              {comparando && compMap[c.id] !== undefined && compMap[c.id] !== c.texto && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs">
                  <p className="mb-1 font-medium text-amber-700">Versão {comparando.versao} (diferente):</p>
                  <pre className="whitespace-pre-wrap font-sans text-slate-600">{compMap[c.id]}</pre>
                </div>
              )}
            </Card>
          ))}

          <Button variant="outline" onClick={adicionar}><Plus className="h-4 w-4" /> Adicionar cláusula</Button>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <Button onClick={() => salvar(false)} disabled={salvando}>
              {salvando ? <Spinner /> : <><Save className="h-4 w-4" /> Salvar como nova versão</>}
            </Button>
            {comparando && (
              <Button variant="ghost" onClick={() => setComparando(null)}><X className="h-4 w-4" /> Fechar comparação (v{comparando.versao})</Button>
            )}
            {erro && <p className="text-sm text-red-600">{erro}</p>}
            {ok && <p className="text-sm text-emerald-700">{ok}</p>}
          </div>
        </div>

        {/* Histórico de versões */}
        <div>
          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><History className="h-4 w-4" /> Histórico de versões</h2>
            {versoes.length === 0 ? (
              <p className="text-xs text-slate-500">Sem versões salvas ainda. A primeira edição cria a versão base + a personalizada.</p>
            ) : (
              <div className="space-y-2">
                {versoes.map((v) => (
                  <div key={v.id} className="rounded-md border border-slate-200 p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">
                        v{v.versao} · {v.origem}{v.personalizado ? ' · personalizada' : ''}
                      </span>
                      <span className="text-slate-400">{new Date(v.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                    {v.nota && <p className="mt-0.5 text-slate-500">{v.nota}</p>}
                    <div className="mt-1.5 flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => verVersao(v.versao)}><GitCompare className="h-3.5 w-3.5" /> Comparar</Button>
                      <Button variant="ghost" size="sm" onClick={() => restaurar(v.versao)}><RotateCcw className="h-3.5 w-3.5" /> Restaurar</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {comparando && (
              <p className="mt-3 flex items-center gap-1 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Comparando com a v{comparando.versao}. Diferenças aparecem abaixo de cada cláusula.
              </p>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
