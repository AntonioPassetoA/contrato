import crypto from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, type ContractRow } from './db';
import { config } from './config';
import { logEvent } from './logger';
import { getTemplate } from './templates/registry';
import type { CampoDef, TipoPessoa } from './templates/types';
import { renderHtmlToPdf } from './pdf';
import {
  createDocumentWithFile,
  createLinkToSignature,
  getDocument,
  type SignerInput,
} from './autentique';
import {
  isValidCPF, isValidCNPJ, isValidPhoneBR, isValidCEP,
  formatCPF, formatCNPJ, formatCEP, formatPhoneBR,
} from './validators';

const pdfDir = resolve(import.meta.dirname, '../data/pdfs');
mkdirSync(pdfDir, { recursive: true });

function nowISO() { return new Date().toISOString(); }

/**
 * Gera um e-mail de teste distinto para cada signatário fixo, todos caindo na
 * mesma caixa configurada em TEST_SIGNER_EMAIL.
 *
 * O Autentique rejeita "+tags" (format_is_invalid), mas o Gmail IGNORA pontos
 * no nome — então "a.ntoniomasterresults@gmail.com" e "an.toniomasterresults@gmail.com"
 * são endereços distintos para o Autentique (não unifica os signatários) e
 * chegam na mesma caixa. Para provedores fora do Gmail, usa o e-mail base
 * (o Autentique unifica os fixos em um único signatário de teste).
 */
function emailDeTeste(index: number): string {
  const base = config.testSignerEmail;
  const at = base.indexOf('@');
  if (at < 0) return base;
  const local = base.slice(0, at);
  const dominio = base.slice(at + 1).toLowerCase();
  if (dominio === 'gmail.com' || dominio === 'googlemail.com') {
    const semPontos = local.replace(/\./g, '');
    const pos = Math.min(index + 1, semPontos.length - 1);
    return `${semPontos.slice(0, pos)}.${semPontos.slice(pos)}@${dominio}`;
  }
  return base;
}

// ---------- Admin: gerar link ----------

export interface CriarLinkInput {
  templateId: string;
  clienteLabel?: string;
  valorReais?: string | number;
  diaVencimento?: number;
  expiraEmDias?: number;
}

function parseValorToCentavos(v: string | number | undefined): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Math.round(v * 100);
  // aceita "2200", "2.200,00", "2200.50"
  const cleaned = v.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function criarLink(input: CriarLinkInput) {
  const template = getTemplate(input.templateId);
  if (!template) throw new Error('Modelo não encontrado');

  const valorCentavos = parseValorToCentavos(input.valorReais);
  const diaVencimento = input.diaVencimento != null ? Number(input.diaVencimento) : null;

  // valida campos exigidos pelo admin
  for (const campo of template.camposAdmin) {
    if (campo.type === 'valor' && campo.required && (valorCentavos == null || valorCentavos <= 0)) {
      throw new Error(`Informe um valor válido para "${campo.label}"`);
    }
    if (campo.type === 'dia' && campo.required && (!diaVencimento || diaVencimento < 1 || diaVencimento > 31)) {
      throw new Error(`Informe um dia de vencimento válido (1 a 31) para "${campo.label}"`);
    }
  }

  const token = crypto.randomBytes(16).toString('hex');
  const dias = input.expiraEmDias ?? config.linkExpirationDays;
  const expiresAt = new Date(Date.now() + dias * 86400_000).toISOString();

  const info = db.prepare(`
    INSERT INTO contracts (token, template_id, template_nome, cliente_label, valor_centavos, dia_vencimento, status, sandbox, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?)
  `).run(
    token, template.id, template.nome, input.clienteLabel ?? null,
    valorCentavos, diaVencimento, config.autentiqueSandbox ? 1 : 0, expiresAt, nowISO()
  );

  const id = Number(info.lastInsertRowid);
  logEvent('link_gerado', { templateId: template.id, clienteLabel: input.clienteLabel, sandbox: config.autentiqueSandbox }, id);

  return {
    id,
    token,
    url: `${config.publicBaseUrl}/c/${token}`,
    expiresAt,
  };
}

// ---------- Público: buscar formulário ----------

export function getContractByToken(token: string): ContractRow | undefined {
  return db.prepare(`SELECT * FROM contracts WHERE token = ?`).get(token) as ContractRow | undefined;
}

export function getPublicForm(token: string) {
  const c = getContractByToken(token);
  if (!c) return { error: 'not_found' as const };

  if (c.status === 'assinado' || c.status === 'aguardando_assinatura' || c.status === 'preenchido') {
    return { error: 'ja_preenchido' as const, status: c.status, shortLink: c.short_link };
  }
  if (c.status === 'cancelado') return { error: 'cancelado' as const };
  if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) {
    return { error: 'expirado' as const };
  }

  const template = getTemplate(c.template_id);
  if (!template) return { error: 'not_found' as const };

  return {
    token,
    template: {
      id: template.id,
      nome: template.nome,
      descricao: template.descricao,
      suportaPF: template.suportaPF,
      suportaPJ: template.suportaPJ,
    },
    // campos por tipo — o front escolhe conforme PF/PJ
    campos: {
      pf: template.suportaPF ? template.campos('pf') : null,
      pj: template.suportaPJ ? template.campos('pj') : null,
    },
  };
}

// ---------- Público: validar + processar envio ----------

export function validarFormulario(campos: CampoDef[], form: Record<string, string>) {
  const erros: Record<string, string> = {};
  for (const campo of campos) {
    const raw = (form[campo.name] ?? '').toString().trim();
    if (!raw) {
      if (campo.required) erros[campo.name] = 'Campo obrigatório';
      continue;
    }
    switch (campo.type) {
      case 'cpf': if (!isValidCPF(raw)) erros[campo.name] = 'CPF inválido'; break;
      case 'cnpj': if (!isValidCNPJ(raw)) erros[campo.name] = 'CNPJ inválido'; break;
      case 'phone': if (!isValidPhoneBR(raw)) erros[campo.name] = 'Telefone inválido'; break;
      case 'cep': if (!isValidCEP(raw)) erros[campo.name] = 'CEP inválido'; break;
    }
  }
  return erros;
}

/** Normaliza os valores (aplica máscaras) para ficarem bonitos no contrato. */
function normalizar(campos: CampoDef[], form: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const campo of campos) {
    let v = (form[campo.name] ?? '').toString().trim();
    if (v) {
      if (campo.type === 'cpf') v = formatCPF(v);
      else if (campo.type === 'cnpj') v = formatCNPJ(v);
      else if (campo.type === 'cep') v = formatCEP(v);
      else if (campo.type === 'phone') v = formatPhoneBR(v);
    }
    out[campo.name] = v;
  }
  return out;
}

export async function processarEnvio(token: string, tipoPessoa: TipoPessoa, formBruto: Record<string, string>) {
  const c = getContractByToken(token);
  if (!c) return { error: 'not_found' as const };
  if (c.status !== 'pendente') return { error: 'ja_preenchido' as const, status: c.status, shortLink: c.short_link };
  if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) return { error: 'expirado' as const };

  const template = getTemplate(c.template_id);
  if (!template) return { error: 'not_found' as const };
  if ((tipoPessoa === 'pf' && !template.suportaPF) || (tipoPessoa === 'pj' && !template.suportaPJ)) {
    return { error: 'tipo_invalido' as const };
  }

  const campos = template.campos(tipoPessoa);
  const erros = validarFormulario(campos, formBruto);
  if (Object.keys(erros).length) return { error: 'validacao' as const, erros };

  const form = normalizar(campos, formBruto);

  const renderInput = {
    tipoPessoa,
    form,
    admin: { valorCentavos: c.valor_centavos, diaVencimento: c.dia_vencimento },
    dataAssinatura: new Date(),
  };

  try {
    // 1) HTML -> PDF
    const html = template.render(renderInput);
    const pdf = await renderHtmlToPdf(html);
    const pdfPath = resolve(pdfDir, `${token}.pdf`);
    writeFileSync(pdfPath, pdf);
    logEvent('pdf_gerado', { bytes: pdf.length }, c.id);

    // 2) monta signatários (fixos + cliente por LINK)
    const clienteNome = form.nome || c.cliente_label || 'Cliente';
    // Modo de teste seguro: em sandbox, redireciona os fixos para o e-mail de teste.
    const redirecionarTeste = config.autentiqueSandbox && !!config.testSignerEmail;
    if (redirecionarTeste) {
      logEvent('signatarios_redirecionados_teste', { para: config.testSignerEmail }, c.id);
    }
    const signers: SignerInput[] = [
      ...template.signatariosFixos.map((s, i) => ({
        name: s.name,
        email: redirecionarTeste ? emailDeTeste(i) : s.email,
        action: s.action,
        delivery_method: 'DELIVERY_METHOD_EMAIL' as const,
      })),
      { name: clienteNome, action: 'SIGN', delivery_method: 'DELIVERY_METHOD_LINK' },
    ];

    // 3) cria documento no Autentique
    const doc = await createDocumentWithFile({
      document: { name: template.documentName(renderInput), refusable: false, sortable: false },
      signers,
      fileBuffer: pdf,
      filename: `${template.documentName(renderInput)}.pdf`.replace(/[\\/:*?"<>|]/g, '-'),
    });
    logEvent('documento_criado', { autentiqueId: doc.id, sandbox: doc.sandbox }, c.id);

    // 4) descobre o signatário cliente (único sem e-mail) e o link de assinatura
    const clienteSig = doc.signatures.find((s) => !s.email) ?? doc.signatures.at(-1)!;
    let shortLink = clienteSig?.link?.short_link ?? null;
    if (!shortLink && clienteSig) {
      shortLink = await createLinkToSignature(clienteSig.public_id);
    }

    // 5) persiste
    db.prepare(`
      UPDATE contracts SET status='aguardando_assinatura', tipo_pessoa=?, form_data=?,
        autentique_document_id=?, autentique_signer_public_id=?, short_link=?, pdf_path=?, submitted_at=?
      WHERE id=?
    `).run(
      tipoPessoa, JSON.stringify(form), doc.id, clienteSig?.public_id ?? null,
      shortLink, pdfPath, nowISO(), c.id
    );
    logEvent('link_assinatura_pronto', { shortLink }, c.id);

    return { ok: true as const, shortLink, documentId: doc.id };
  } catch (err: any) {
    db.prepare(`UPDATE contracts SET status='erro' WHERE id=?`).run(c.id);
    logEvent('erro_processamento', { mensagem: String(err?.message ?? err) }, c.id);
    return { error: 'processamento' as const, mensagem: String(err?.message ?? err) };
  }
}

// ---------- Admin: listar/atualizar status ----------

export function listarContratos(limit = 100) {
  return db.prepare(`
    SELECT id, token, template_nome, cliente_label, valor_centavos, dia_vencimento,
           status, tipo_pessoa, short_link, autentique_document_id, sandbox,
           expires_at, created_at, submitted_at, signed_at
    FROM contracts ORDER BY id DESC LIMIT ?
  `).all(limit);
}

/** Consulta o Autentique e atualiza o status de um contrato aguardando assinatura. */
export async function atualizarStatus(id: number) {
  const c = db.prepare(`SELECT * FROM contracts WHERE id=?`).get(id) as ContractRow | undefined;
  if (!c || !c.autentique_document_id) return null;
  if (c.status === 'assinado') return c.status;

  const doc = await getDocument(c.autentique_document_id);
  const sigs: any[] = doc?.signatures ?? [];
  const todasAssinadas = sigs.length > 0 && sigs.every((s) => s.signed);
  if (todasAssinadas) {
    db.prepare(`UPDATE contracts SET status='assinado', signed_at=? WHERE id=?`).run(nowISO(), id);
    logEvent('documento_assinado', { autentiqueId: c.autentique_document_id }, id);
    return 'assinado';
  }
  return c.status;
}
