import { Router } from 'express';
import { requireAdmin, type AuthedRequest } from '../auth';
import {
  getConfigEmpresa, pendenciasEmpresa, salvarContratada, salvarTestemunhas,
  getPrivacidadeUrl, salvarPrivacidadeUrl,
  type Contratada, type Testemunha,
} from '../configEmpresa';

// Configuração administrativa centralizada (CONTRATADA + testemunhas). Só admin.
export const configRouter = Router();

configRouter.get('/empresa', requireAdmin, (_req, res) => {
  const cfg = getConfigEmpresa();
  res.json({
    ...cfg, pendencias: pendenciasEmpresa(cfg), completa: pendenciasEmpresa(cfg).length === 0,
    privacidadeUrl: getPrivacidadeUrl(),
  });
});

configRouter.put('/empresa/privacidade', requireAdmin, (req: AuthedRequest, res) => {
  try {
    salvarPrivacidadeUrl(req.user!.id, String(req.body?.url ?? ''));
    res.json({ ok: true, privacidadeUrl: getPrivacidadeUrl() });
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err) });
  }
});

configRouter.put('/empresa/contratada', requireAdmin, (req: AuthedRequest, res) => {
  try {
    const c = req.body ?? {};
    const contratada: Contratada = {
      razao_social: String(c.razao_social ?? '').trim(),
      cnpj: String(c.cnpj ?? '').trim(),
      endereco: String(c.endereco ?? '').trim(),
      email: c.email ? String(c.email).trim() : undefined,
      representantes: Array.isArray(c.representantes)
        ? c.representantes.map((r: any) => ({
            nome: String(r?.nome ?? '').trim(),
            nacionalidade: r?.nacionalidade ? String(r.nacionalidade).trim() : undefined,
            estado_civil: r?.estado_civil ? String(r.estado_civil).trim() : undefined,
            profissao: r?.profissao ? String(r.profissao).trim() : undefined,
            rg: r?.rg ? String(r.rg).trim() : undefined,
            cpf: String(r?.cpf ?? '').trim(),
            endereco: r?.endereco ? String(r.endereco).trim() : undefined,
          }))
        : [],
    };
    salvarContratada(req.user!.id, contratada);
    const cfg = getConfigEmpresa();
    res.json({ ...cfg, pendencias: pendenciasEmpresa(cfg), completa: pendenciasEmpresa(cfg).length === 0 });
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err) });
  }
});

configRouter.put('/empresa/testemunhas', requireAdmin, (req: AuthedRequest, res) => {
  try {
    const arr = Array.isArray(req.body?.testemunhas) ? req.body.testemunhas : [];
    const testemunhas: Testemunha[] = arr.map((t: any) => ({
      nome: String(t?.nome ?? '').trim(),
      cpf: String(t?.cpf ?? '').trim(),
    }));
    salvarTestemunhas(req.user!.id, testemunhas);
    const cfg = getConfigEmpresa();
    res.json({ ...cfg, pendencias: pendenciasEmpresa(cfg), completa: pendenciasEmpresa(cfg).length === 0 });
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err) });
  }
});
