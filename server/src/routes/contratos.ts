import { Router } from 'express';
import { requireSenhaTrocada, requireAdmin, type AuthedRequest } from '../auth';
import {
  criarSolicitacao, listarParaVendedor, listarParaAdmin, getParaVendedor, getParaAdmin,
  getConfigParaAdmin, configurarContrato, liberarLink, reabrirFormulario, getDadosCliente,
  editarDadosCliente, getConteudoAtual, editarConteudo, listarVersoes, getVersao, restaurarVersao,
  getPreview, aprovarEGerarPdf, listarPdfs, lerPdf,
} from '../contratos';
import { catalogoModelos } from '../modelos';
import { getAuditDoContrato } from '../audit';

export const contratosRouter = Router();

// Vendedor (ou admin) cria uma solicitação — só o nome da clínica.
// Campos comerciais NÃO são aceitos aqui, mesmo que enviados.
contratosRouter.post('/solicitacoes', requireSenhaTrocada, (req: AuthedRequest, res) => {
  try {
    const { clinicaNome } = req.body ?? {};
    const contrato = criarSolicitacao(req.user!.id, String(clinicaNome ?? ''));
    res.json({ contrato });
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err) });
  }
});

// Catálogo de modelos e blocos (só admin monta contrato). ANTES de '/:id'.
contratosRouter.get('/modelos', requireAdmin, (_req, res) => {
  res.json({ modelos: catalogoModelos() });
});

// Lista: admin vê TODAS; vendedor vê SÓ as próprias (visão reduzida).
contratosRouter.get('/', requireSenhaTrocada, (req: AuthedRequest, res) => {
  if (req.user!.role === 'admin') {
    return res.json({ contratos: listarParaAdmin() });
  }
  res.json({ contratos: listarParaVendedor(req.user!.id) });
});

// ---- Configuração do contrato (somente admin) ----

// Visão de configuração (valores parseados + pendências do contrato e da empresa).
contratosRouter.get('/:id/config', requireAdmin, (req, res) => {
  const view = getConfigParaAdmin(Number(req.params.id));
  if (!view) return res.status(404).json({ error: 'Contrato não encontrado' });
  res.json({ config: view });
});

// Salva a configuração (modelo, PF/PJ, blocos, fidelidade, valores, cidade/data).
contratosRouter.put('/:id/config', requireAdmin, (req: AuthedRequest, res) => {
  try {
    const view = configurarContrato(req.user!.id, Number(req.params.id), req.body ?? {});
    res.json({ config: view });
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err), code: err?.code, pendencias: err?.pendencias });
  }
});

// Gera e libera o link do cliente (bloqueia se contrato ou empresa incompletos).
contratosRouter.post('/:id/liberar-link', requireAdmin, (req: AuthedRequest, res) => {
  try {
    const view = liberarLink(req.user!.id, Number(req.params.id));
    res.json({ config: view });
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err), code: err?.code, pendencias: err?.pendencias });
  }
});

// Histórico de auditoria do contrato (só admin).
contratosRouter.get('/:id/auditoria', requireAdmin, (req, res) => {
  if (!getParaAdmin(Number(req.params.id))) return res.status(404).json({ error: 'Contrato não encontrado' });
  res.json({ auditoria: getAuditDoContrato(Number(req.params.id)) });
});

// Dados enviados pelo cliente, para a Manu revisar (só admin).
contratosRouter.get('/:id/dados-cliente', requireAdmin, (req, res) => {
  if (!getParaAdmin(Number(req.params.id))) return res.status(404).json({ error: 'Contrato não encontrado' });
  try {
    res.json({ dados: getDadosCliente(Number(req.params.id)) });
  } catch {
    res.status(503).json({ error: 'pii_indisponivel' });
  }
});

// Manu edita os dados do cliente (mesmos campos/validações, com confirmação).
contratosRouter.put('/:id/dados-cliente', requireAdmin, (req: AuthedRequest, res) => {
  try {
    const { form, confirmar } = req.body ?? {};
    const dados = editarDadosCliente(req.user!.id, Number(req.params.id), form ?? {}, !!confirmar);
    res.json({ dados });
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err), code: err?.code, erros: err?.erros });
  }
});

// Conteúdo atual do contrato (cláusulas). Só admin.
contratosRouter.get('/:id/conteudo', requireAdmin, (req, res) => {
  const conteudo = getConteudoAtual(Number(req.params.id));
  if (!conteudo) return res.status(404).json({ error: 'Contrato não encontrado' });
  res.json({ conteudo });
});

// Edita o conteúdo (cria versão personalizada). Só admin, com confirmação.
contratosRouter.put('/:id/conteudo', requireAdmin, (req: AuthedRequest, res) => {
  try {
    const { clausulas, confirmar, nota } = req.body ?? {};
    const versao = editarConteudo(req.user!.id, Number(req.params.id), clausulas, !!confirmar, nota);
    res.json({ versao });
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err), code: err?.code });
  }
});

// Histórico de versões (só admin).
contratosRouter.get('/:id/versoes', requireAdmin, (req, res) => {
  if (!getParaAdmin(Number(req.params.id))) return res.status(404).json({ error: 'Contrato não encontrado' });
  res.json({ versoes: listarVersoes(Number(req.params.id)) });
});

// Uma versão específica, com conteúdo (para comparação). Só admin.
contratosRouter.get('/:id/versoes/:versao', requireAdmin, (req, res) => {
  const v = getVersao(Number(req.params.id), Number(req.params.versao));
  if (!v) return res.status(404).json({ error: 'Versão não encontrada' });
  res.json({ versao: v });
});

// Restaura uma versão anterior (só admin, com confirmação).
contratosRouter.post('/:id/versoes/:versao/restaurar', requireAdmin, (req: AuthedRequest, res) => {
  try {
    const versao = restaurarVersao(req.user!.id, Number(req.params.id), Number(req.params.versao), !!req.body?.confirmar);
    res.json({ versao });
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err), code: err?.code });
  }
});

// Prévia integral do contrato (mesmo HTML do PDF) + pendências + versão. Só admin.
contratosRouter.get('/:id/preview', requireAdmin, (req, res) => {
  const preview = getPreview(Number(req.params.id));
  if (!preview) return res.status(404).json({ error: 'Contrato não encontrado' });
  res.json({ preview });
});

// Aprovar e gerar o PDF (bloqueia se houver pendências; exige confirmação). Só admin.
contratosRouter.post('/:id/gerar-pdf', requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const pdf = await aprovarEGerarPdf(req.user!.id, Number(req.params.id), !!req.body?.confirmar);
    res.json({ pdf });
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err), code: err?.code, pendencias: err?.pendencias });
  }
});

// Histórico de PDFs (ativo + substituídos). Só admin.
contratosRouter.get('/:id/pdfs', requireAdmin, (req, res) => {
  if (!getParaAdmin(Number(req.params.id))) return res.status(404).json({ error: 'Contrato não encontrado' });
  res.json({ pdfs: listarPdfs(Number(req.params.id)) });
});

// Download do PDF (ativo por padrão, ou ?pdfId=). Só admin — vendedor nunca recebe.
contratosRouter.get('/:id/pdf', requireAdmin, (req, res) => {
  const pdfId = req.query.pdfId != null ? Number(req.query.pdfId) : undefined;
  const arq = lerPdf(Number(req.params.id), pdfId);
  if (!arq) return res.status(404).json({ error: 'PDF não encontrado' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${arq.nome}"`);
  res.send(arq.buffer);
});

// Reabre o formulário para o cliente corrigir (só admin, auditado). Mantém o mesmo link.
contratosRouter.post('/:id/reabrir', requireAdmin, (req: AuthedRequest, res) => {
  try {
    const config = reabrirFormulario(req.user!.id, Number(req.params.id));
    res.json({ config });
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err) });
  }
});

// Detalhe: admin vê tudo; vendedor só o próprio (404 se não for dele — não vaza existência).
contratosRouter.get('/:id', requireSenhaTrocada, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (req.user!.role === 'admin') {
    const contrato = getParaAdmin(id);
    if (!contrato) return res.status(404).json({ error: 'Contrato não encontrado' });
    return res.json({ contrato });
  }
  const contrato = getParaVendedor(id, req.user!.id);
  if (!contrato) return res.status(404).json({ error: 'Contrato não encontrado' });
  res.json({ contrato });
});
