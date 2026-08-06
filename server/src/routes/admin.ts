import { createReadStream, existsSync } from 'node:fs';
import { Router } from 'express';
import { checkPassword, setSessionCookie, clearSessionCookie, requireAdmin } from '../auth';
import { listTemplates } from '../templates/registry';
import { criarLink, listarContratos, atualizarStatus } from '../contracts';
import { getLogs } from '../logger';
import { db } from '../db';

export const adminRouter = Router();

adminRouter.post('/login', (req, res) => {
  const { password } = req.body ?? {};
  if (!checkPassword(password)) {
    return res.status(401).json({ error: 'Senha incorreta' });
  }
  setSessionCookie(res);
  res.json({ ok: true });
});

adminRouter.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

adminRouter.get('/me', requireAdmin, (_req, res) => res.json({ ok: true }));

adminRouter.get('/templates', requireAdmin, (_req, res) => {
  res.json({ templates: listTemplates() });
});

adminRouter.post('/links', requireAdmin, (req, res) => {
  try {
    const { templateId, clienteLabel, valorReais, diaVencimento, expiraEmDias } = req.body ?? {};
    const result = criarLink({ templateId, clienteLabel, valorReais, diaVencimento, expiraEmDias });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err) });
  }
});

adminRouter.get('/contracts', requireAdmin, (_req, res) => {
  res.json({ contracts: listarContratos() });
});

adminRouter.post('/contracts/:id/refresh', requireAdmin, async (req, res) => {
  try {
    const status = await atualizarStatus(Number(req.params.id));
    res.json({ status });
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err) });
  }
});

adminRouter.get('/contracts/:id/pdf', requireAdmin, (req, res) => {
  const row = db
    .prepare(`SELECT pdf_path FROM contracts WHERE id = ?`)
    .get(Number(req.params.id)) as { pdf_path: string | null } | undefined;
  if (!row?.pdf_path || !existsSync(row.pdf_path)) {
    return res.status(404).json({ error: 'PDF não disponível' });
  }
  res.type('application/pdf');
  createReadStream(row.pdf_path).pipe(res);
});

adminRouter.get('/logs', requireAdmin, (req, res) => {
  const contractId = req.query.contractId ? Number(req.query.contractId) : undefined;
  res.json({ logs: getLogs(contractId) });
});
