import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, Label, Spinner } from '@/components/ui/misc';
import { Lock } from 'lucide-react';

export default function AdminLoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const [checando, setChecando] = useState(true);

  useEffect(() => {
    api.adminMe()
      .then(({ user }) => {
        if (user.must_change_password) return nav('/trocar-senha', { replace: true });
        nav(user.role === 'admin' ? '/admin' : '/vendedor', { replace: true });
      })
      .catch(() => setChecando(false));
  }, [nav]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      const { user, mustChangePassword } = await api.adminLogin(email, password);
      if (mustChangePassword) return nav('/trocar-senha', { replace: true });
      nav(user.role === 'admin' ? '/admin' : '/vendedor', { replace: true });
    } catch {
      setErro('E-mail ou senha incorretos.');
      setLoading(false);
    }
  }

  if (checando) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-brand-700" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Painel de Contratos</h1>
          <p className="mt-1 text-sm text-slate-500">Acesso restrito ao administrador</p>
        </div>
        <form onSubmit={entrar} className="space-y-4">
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoFocus
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              invalid={!!erro}
              placeholder="voce@empresa.com.br"
            />
          </div>
          <div>
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              invalid={!!erro}
              placeholder="Digite a senha"
            />
            {erro && <p className="mt-1.5 text-sm text-red-600">{erro}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading || !email || !password}>
            {loading ? <Spinner /> : 'Entrar'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
