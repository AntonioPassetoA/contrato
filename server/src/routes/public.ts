import { Router, json } from 'express';
import { abrirFormularioPublico, submeterFormularioPublico } from '../contratos';
import { criarRateLimit } from '../seguranca/rateLimit';

// Fluxo PÚBLICO do cliente (link /c/:token). Sem autenticação.
// Usa SOMENTE a tabela `contratos`. Devolve apenas o necessário para montar o
// formulário + nome da clínica. Nunca expõe valores, blocos, fidelidade,
// CONTRATADA, testemunhas, vendedor ou auditoria.
export const publicRouter = Router();

// Proteções: limite de requisições por IP + corpo pequeno (parser próprio).
publicRouter.use(criarRateLimit({ janelaMs: 60_000, max: 30 }));
publicRouter.use(json({ limit: '16kb' }));

// Abre o formulário correspondente ao tipo (PF/PJ) definido pela Manu.
publicRouter.get('/contrato/:token', (req, res) => {
  const r = abrirFormularioPublico(String(req.params.token || ''));
  switch (r.estado) {
    case 'ok':
      return res.json({
        clinicaNome: r.form.clinicaNome, tipoPessoa: r.form.tipoPessoa,
        campos: r.form.campos, privacidadeUrl: r.form.privacidadeUrl,
      });
    case 'ja_preenchido':
      return res.json({ jaPreenchido: true, clinicaNome: r.clinicaNome });
    case 'nao_encontrado':
      return res.status(404).json({ error: 'not_found' });
    default:
      return res.status(404).json({ error: 'indisponivel' });
  }
});

// Envia o formulário: valida, salva os dados do cliente e marca 'preenchido'.
// NÃO gera PDF e NÃO envia para a Autentique.
publicRouter.post('/contrato/:token', (req, res) => {
  const r = submeterFormularioPublico(String(req.params.token || ''), req.body?.form ?? {});
  switch (r.estado) {
    case 'ok':
      return res.json({ ok: true });
    case 'invalido':
      return res.status(422).json({ error: 'validacao', erros: r.erros });
    case 'ja_preenchido':
      return res.status(409).json({ error: 'ja_preenchido' });
    case 'nao_encontrado':
      return res.status(404).json({ error: 'not_found' });
    default:
      return res.status(409).json({ error: 'indisponivel' });
  }
});
