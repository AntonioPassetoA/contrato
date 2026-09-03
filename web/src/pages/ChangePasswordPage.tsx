import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, Label, Spinner } from '@/components/ui/misc';
import { KeyRound } from 'lucide-react';

export default function ChangePasswordPage() {
  const nav = useNavigate();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [conf, setConf] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const [checando, setChecando] = useState(true);

  useEffect(() => {
    // precisa estar logado; se não, volta ao login
    api.adminMe().then(() => setChecando(false)).catch(() => nav('/admin/login', { replace: true }));
  }, [nav]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (nova !== conf) { setErro('A confirmação não confere.'); return; }
    setLoading(true);
    try {
      await api.trocarSenha(atual, nova);
      const { user } = await api.adminMe();
      nav(user.role === 'admin' ? '/admin' : '/vendedor', { replace: true });
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível trocar a senha.');
      setLoading(false);
    }
  }

  if (checando) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-6 w-6 text-brand-700" /></div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Defina uma nova senha</h1>
          <p className="mt-1 text-sm text-slate-500">Sua senha é temporária. Crie uma nova para continuar.</p>
        </div>
        <form onSubmit={salvar} className="space-y-4">
          <div>
            <Label htmlFor="atual">Senha atual (temporária)</Label>
            <Input id="atual" type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="nova">Nova senha</Label>
            <Input id="nova" type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} placeholder="mín. 8 caracteres" />
          </div>
          <div>
            <Label htmlFor="conf">Confirmar nova senha</Label>
            <Input id="conf" type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} invalid={!!erro} />
            {erro && <p className="mt-1.5 text-sm text-red-600">{erro}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading || !atual || nova.length < 8 || !conf}>
            {loading ? <Spinner /> : 'Salvar nova senha'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
