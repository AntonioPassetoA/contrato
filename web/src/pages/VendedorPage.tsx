import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type SolicitacaoVendedor, type AdminUser } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, Label, Spinner, StatusBadge } from '@/components/ui/misc';
import { Plus, RefreshCw, LogOut, Building2, Copy, Check, ExternalLink } from 'lucide-react';

function CopyButton({ text }: { text: string }) {
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

function NovaSolicitacao({ onCriado }: { onCriado: () => void }) {
  const [clinica, setClinica] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(''); setOk(''); setLoading(true);
    try {
      await api.criarSolicitacao(clinica);
      setOk('Solicitação enviada! A Manu vai configurar e liberar o link.');
      setClinica('');
      onCriado();
    } catch (err: any) {
      setErro(err?.message || 'Erro ao enviar solicitação.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
        <Plus className="h-5 w-5 text-brand-700" /> Nova solicitação de contrato
      </h2>
      <form onSubmit={criar} className="space-y-4">
        <div>
          <Label>Nome da clínica</Label>
          <Input value={clinica} onChange={(e) => setClinica(e.target.value)} placeholder="Ex.: Clínica Sorriso — Dr. João" />
        </div>
        <Button type="submit" disabled={loading || !clinica.trim()}>
          {loading ? <Spinner /> : <><Building2 className="h-4 w-4" /> Enviar solicitação</>}
        </Button>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        {ok && <p className="text-sm text-emerald-700">{ok}</p>}
      </form>
    </Card>
  );
}

export default function VendedorPage() {
  const nav = useNavigate();
  const [eu, setEu] = useState<AdminUser | null>(null);
  const [itens, setItens] = useState<SolicitacaoVendedor[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(() => {
    api.getSolicitacoes<SolicitacaoVendedor[]>().then((r) => setItens(r.contratos)).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { user } = await api.adminMe();
        if (user.must_change_password) { nav('/trocar-senha', { replace: true }); return; }
        if (user.role === 'admin') { nav('/admin', { replace: true }); return; }
        setEu(user);
        const r = await api.getSolicitacoes<SolicitacaoVendedor[]>();
        setItens(r.contratos);
      } catch {
        nav('/admin/login', { replace: true });
        return;
      } finally {
        setCarregando(false);
      }
    })();
  }, [nav]);

  async function sair() {
    await api.adminLogout().catch(() => {});
    nav('/admin/login', { replace: true });
  }

  if (carregando || !eu) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-6 w-6 text-brand-700" /></div>;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900">Minhas solicitações</h1>
            <p className="truncate text-xs text-slate-500">{eu.nome} · vendedor</p>
          </div>
          <Button variant="ghost" size="sm" onClick={sair}><LogOut className="h-4 w-4" /> Sair</Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <NovaSolicitacao onCriado={carregar} />

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Solicitações ({itens.length})</h2>
            <Button variant="ghost" size="sm" onClick={carregar}><RefreshCw className="h-4 w-4" /> Recarregar</Button>
          </div>
          {itens.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">Nenhuma solicitação ainda. Crie uma acima.</Card>
          ) : (
            <div className="space-y-3">
              {itens.map((c) => (
                <Card key={c.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{c.clinica_nome}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        Criada em {new Date(c.created_at).toLocaleString('pt-BR')}
                        {c.updated_at ? ` · atualizada ${new Date(c.updated_at).toLocaleString('pt-BR')}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={c.assinado ? 'assinado' : c.status} />
                  </div>
                  {c.link && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <code className="flex-1 break-all rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">{c.link}</code>
                      <CopyButton text={c.link} />
                      <a href={c.link} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="sm"><ExternalLink className="h-4 w-4" /> Abrir</Button>
                      </a>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
