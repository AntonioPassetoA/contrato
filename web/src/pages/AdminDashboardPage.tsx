import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, type ContratoAdmin, type AdminUser } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, Spinner, StatusBadge } from '@/components/ui/misc';
import { RefreshCw, LogOut, Users, Building2, ChevronRight } from 'lucide-react';

export default function AdminDashboardPage() {
  const nav = useNavigate();
  const [eu, setEu] = useState<AdminUser | null>(null);
  const [fila, setFila] = useState<ContratoAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregarFila = useCallback(() => {
    api.getSolicitacoes<ContratoAdmin[]>().then((r) => setFila(r.contratos)).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { user } = await api.adminMe();
        if (user.must_change_password) { nav('/trocar-senha', { replace: true }); return; }
        if (user.role !== 'admin') { nav('/vendedor', { replace: true }); return; }
        setEu(user);
        const r = await api.getSolicitacoes<ContratoAdmin[]>();
        setFila(r.contratos);
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

  if (carregando) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-6 w-6 text-brand-700" /></div>;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900">Painel de contratos</h1>
            {eu && <p className="truncate text-xs text-slate-500">{eu.nome} · administrador</p>}
          </div>
          <div className="flex items-center gap-1">
            <Link to="/admin/empresa">
              <Button variant="ghost" size="sm"><Building2 className="h-4 w-4" /> Empresa</Button>
            </Link>
            <Link to="/admin/usuarios">
              <Button variant="ghost" size="sm"><Users className="h-4 w-4" /> Usuários</Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={sair}><LogOut className="h-4 w-4" /> Sair</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Fila de solicitações ({fila.length})</h2>
            <Button variant="ghost" size="sm" onClick={carregarFila}><RefreshCw className="h-4 w-4" /> Recarregar</Button>
          </div>
          {fila.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">Nenhuma solicitação de vendedor ainda.</Card>
          ) : (
            <div className="space-y-3">
              {fila.map((c) => (
                <Link key={c.id} to={`/admin/contratos/${c.id}`} className="block">
                  <Card className="p-4 transition hover:border-brand-300 hover:shadow">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{c.clinica_nome}</p>
                        <p className="text-xs text-slate-500">
                          Solicitado por {c.vendedor_nome || '—'}
                          {c.tipo_pessoa ? ` · ${c.tipo_pessoa.toUpperCase()}` : ''}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          Criado em {new Date(c.created_at).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={c.status} />
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
