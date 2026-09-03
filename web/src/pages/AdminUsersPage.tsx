import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, type AdminUser, type UserRole } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Card, Label, Spinner } from '@/components/ui/misc';
import { UserPlus, ArrowLeft, Trash2, ShieldCheck, User, KeyRound } from 'lucide-react';

function RoleBadge({ role }: { role: UserRole }) {
  return role === 'admin' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-800">
      <ShieldCheck className="h-3 w-3" /> Administrador
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
      <User className="h-3 w-3" /> Vendedor
    </span>
  );
}

function NovoUsuario({ onCriado }: { onCriado: () => void }) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [role, setRole] = useState<UserRole>('vendedor');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(''); setOk(''); setLoading(true);
    try {
      await api.criarUsuario({ nome, email, senha, role });
      setOk(`Usuário "${nome}" criado.`);
      setNome(''); setEmail(''); setSenha(''); setRole('vendedor');
      onCriado();
    } catch (err: any) {
      setErro(err?.message || 'Erro ao criar usuário.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
        <UserPlus className="h-5 w-5 text-brand-700" /> Novo usuário
      </h2>
      <form onSubmit={criar} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label>Nome</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
        </div>
        <div>
          <Label>E-mail</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com.br" />
        </div>
        <div>
          <Label>Senha inicial</Label>
          <Input type="text" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="mín. 6 caracteres" />
        </div>
        <div>
          <Label>Tipo de acesso</Label>
          <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="vendedor">Vendedor (solicita e acompanha)</option>
            <option value="admin">Administrador (controle total)</option>
          </Select>
        </div>
        <div className="flex items-end sm:col-span-2">
          <Button type="submit" disabled={loading || !nome || !email || !senha}>
            {loading ? <Spinner /> : <><UserPlus className="h-4 w-4" /> Criar usuário</>}
          </Button>
        </div>
      </form>
      {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
      {ok && <p className="mt-3 text-sm text-emerald-700">{ok}</p>}
    </Card>
  );
}

function LinhaUsuario({ u, eu, onMudou }: { u: AdminUser; eu: AdminUser; onMudou: () => void }) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const souEu = u.id === eu.id;

  async function acao(fn: () => Promise<unknown>) {
    setErro(''); setBusy(true);
    try { await fn(); onMudou(); } catch (err: any) { setErro(err?.message || 'Erro.'); } finally { setBusy(false); }
  }

  async function resetarSenha() {
    const nova = window.prompt(`Nova senha para ${u.nome} (mín. 6 caracteres):`);
    if (nova == null) return;
    await acao(() => api.atualizarUsuario(u.id, { senha: nova }));
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-slate-900">{u.nome}</p>
            {!u.ativo && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">INATIVO</span>}
            {souEu && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">você</span>}
          </div>
          <p className="text-xs text-slate-500">{u.email}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {u.last_login_at ? `Último acesso ${new Date(u.last_login_at).toLocaleString('pt-BR')}` : 'Nunca acessou'}
          </p>
        </div>
        <RoleBadge role={u.role} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select
          className="h-8 w-auto py-0 text-xs"
          value={u.role}
          disabled={busy || souEu}
          onChange={(e) => acao(() => api.atualizarUsuario(u.id, { role: e.target.value as UserRole }))}
        >
          <option value="vendedor">Vendedor</option>
          <option value="admin">Administrador</option>
        </Select>

        <Button variant="outline" size="sm" disabled={busy || souEu}
          onClick={() => acao(() => api.atualizarUsuario(u.id, { ativo: !u.ativo }))}>
          {u.ativo ? 'Desativar' : 'Ativar'}
        </Button>

        <Button variant="outline" size="sm" disabled={busy} onClick={resetarSenha}>
          <KeyRound className="h-4 w-4" /> Redefinir senha
        </Button>

        <Button variant="ghost" size="sm" disabled={busy || souEu}
          onClick={() => { if (window.confirm(`Remover o usuário ${u.nome}?`)) acao(() => api.removerUsuario(u.id)); }}>
          <Trash2 className="h-4 w-4 text-red-600" /> Remover
        </Button>
        {busy && <Spinner className="h-4 w-4 text-slate-400" />}
      </div>
      {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
    </Card>
  );
}

export default function AdminUsersPage() {
  const nav = useNavigate();
  const [eu, setEu] = useState<AdminUser | null>(null);
  const [usuarios, setUsuarios] = useState<AdminUser[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(() => {
    api.getUsuarios().then((r) => setUsuarios(r.users)).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { user } = await api.adminMe();
        if (user.must_change_password) { nav('/trocar-senha', { replace: true }); return; }
        if (user.role !== 'admin') { nav('/admin', { replace: true }); return; }
        setEu(user);
        const r = await api.getUsuarios();
        setUsuarios(r.users);
      } catch {
        nav('/admin/login', { replace: true });
        return;
      } finally {
        setCarregando(false);
      }
    })();
  }, [nav]);

  if (carregando || !eu) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-brand-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-bold text-slate-900">Usuários</h1>
          <Link to="/admin">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> Voltar aos contratos</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <NovoUsuario onCriado={carregar} />
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Equipe ({usuarios.length})</h2>
          <div className="space-y-3">
            {usuarios.map((u) => <LinhaUsuario key={u.id} u={u} eu={eu} onMudou={carregar} />)}
          </div>
        </section>
      </main>
    </div>
  );
}
