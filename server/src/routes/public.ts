import { Router } from 'express';
import { getPublicForm, processarEnvio } from '../contracts';
import type { TipoPessoa } from '../templates/types';

export const publicRouter = Router();

publicRouter.get('/form/:token', (req, res) => {
  const result = getPublicForm(req.params.token);
  if ('error' in result) {
    const codes: Record<string, number> = {
      not_found: 404, expirado: 410, cancelado: 410, ja_preenchido: 409,
    };
    return res.status(codes[String(result.error)] ?? 400).json(result);
  }
  res.json(result);
});

publicRouter.post('/submit/:token', async (req, res) => {
  const { tipoPessoa, form } = req.body ?? {};
  if (tipoPessoa !== 'pf' && tipoPessoa !== 'pj') {
    return res.status(400).json({ error: 'tipo_invalido' });
  }
  if (!form || typeof form !== 'object') {
    return res.status(400).json({ error: 'form_invalido' });
  }
  const result = await processarEnvio(req.params.token, tipoPessoa as TipoPessoa, form);
  if ('error' in result) {
    const codes: Record<string, number> = {
      not_found: 404, expirado: 410, ja_preenchido: 409, validacao: 422,
      tipo_invalido: 400, processamento: 502,
    };
    return res.status(codes[String(result.error)] ?? 400).json(result);
  }
  res.json(result);
});
