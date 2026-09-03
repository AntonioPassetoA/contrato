import { Router } from 'express';
import {
  setSessionCookie, clearSessionCookie, requireAuth, requireAdmin, type AuthedRequest,
} from '../auth';
import {
  getUsuarioPorEmail, verificarSenha, registrarLogin, trocarSenha,
  listarUsuarios, criarUsuario, atualizarUsuario, removerUsuario,
} from '../users';
import { getLogs, logEvent } from '../logger';

export const adminRouter = Router();

adminRouter.post('/login', (req, res) => {
  const { email, password } = req.body ?? {};
  const user = getUsuarioPorEmail(String(email ?? ''));
  if (!user || !user.ativo || !verificarSenha(String(password ?? ''), user.senha_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos' });
  }
  registrarLogin(user.id);
  setSessionCookie(res, user.id);
  logEvent('login', { userId: user.id, email: user.email });
  res.json({
    ok: true,
    user: { id: user.id, nome: user.nome, email: user.email, role: user.role },
    mustChangePassword: user.must_change_password === 1,
  });
});

adminRouter.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// Troca de senha pelo próprio usuário (usada no 1º acesso com senha temporária).
adminRouter.post('/change-password', requireAuth, (req: AuthedRequest, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body ?? {};
    trocarSenha(req.user!.id, String(senhaAtual ?? ''), String(novaSenha ?? ''));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err) });
  }
});

adminRouter.get('/me', requireAuth, (req: AuthedRequest, res) => {
  res.json({ ok: true, user: req.user });
});

adminRouter.get('/logs', requireAdmin, (req, res) => {
  const contractId = req.query.contractId ? Number(req.query.contractId) : undefined;
  res.json({ logs: getLogs(contractId) });
});

// ---------- Gestão de usuários (somente admin) ----------

adminRouter.get('/users', requireAdmin, (_req, res) => {
  res.json({ users: listarUsuarios() });
});

adminRouter.post('/users', requireAdmin, (req, res) => {
  try {
    const { nome, email, senha, role } = req.body ?? {};
    const user = criarUsuario({ nome, email, senha, role });
    res.json({ user });
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err) });
  }
});

adminRouter.patch('/users/:id', requireAdmin, (req, res) => {
  try {
    const { nome, senha, role, ativo } = req.body ?? {};
    const user = atualizarUsuario(Number(req.params.id), { nome, senha, role, ativo });
    res.json({ user });
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err) });
  }
});

adminRouter.delete('/users/:id', requireAdmin, (req: AuthedRequest, res) => {
  try {
    if (req.user!.id === Number(req.params.id)) {
      return res.status(400).json({ error: 'Você não pode remover a si mesmo.' });
    }
    removerUsuario(Number(req.params.id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err) });
  }
});
