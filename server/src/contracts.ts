import crypto from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, type ContractRow } from './db';
import { config } from './config';
import { logEvent } from './logger';
import { getTemplate } from './templates/registry';
import type { CampoDef, TipoPessoa } from './templates/types';
import { renderHtmlToPdf } from './pdf';
import { enviarLinkAssinatura } from './email';
import {
  createDocumentWithFile,
  createLinkToSignature,
  getDocument,
  type SignerInput,
  type SecurityVerificationInput,
} from './autentique';
import {
  isValidCPF, isValidCNPJ, isValidPhoneBR, isValidCEP, isValidEmail, onlyDigits,
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
 * no nome — então dois endereços que diferem apenas pela posição do ponto (por
 * exemplo "u.suario@example.com" e "us.uario@example.com") são distintos para o
 * Autentique (não unifica os signatários) e chegam na mesma caixa. Para provedores
 * fora do Gmail, usa o e-mail base (o Autentique unifica os fixos em um único
 * signatário de teste).
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

export interface DadosCliente {
  nome: string;
  email?: string;
  telefone?: string;
}

/**
 * Monta o signatário CLIENTE.
 * - Sempre exige foto do documento (verificação UPLOAD) — só do cliente.
 * - Em modo de teste: NÃO dispara nada (assina pelo link mostrado na tela),
 *   protegendo clientes reais durante os testes.
 * - Em produção: o Autentique dispara por WhatsApp (canal primário), com o
 *   e-mail e o telefone do cliente cadastrados no signatário.
 */
export function montarSignerCliente(dados: DadosCliente, modoTeste: boolean): SignerInput {
  const verificacoes: SecurityVerificationInput[] = [{ type: 'UPLOAD' }];
  if (modoTeste) {
    return {
      name: dados.nome,
      action: 'SIGN',
      delivery_method: 'DELIVERY_METHOD_LINK',
      security_verifications: verificacoes,
    };
  }
  // Produção: canal primário = WhatsApp. O Autentique NÃO aceita e-mail e telefone
  // no mesmo signatário (only_one_allowed:email, phone), então enviamos só o telefone.
  // O e-mail do cliente continua coletado e guardado no nosso sistema (form_data).
  return {
    name: dados.nome,
    phone: dados.telefone ? `+55${onlyDigits(dados.telefone)}` : undefined,
    action: 'SIGN',
    delivery_method: 'DELIVERY_METHOD_WHATSAPP',
    security_verifications: verificacoes,
  };
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

export function criarLink(input: CriarLinkInput, createdBy?: number) {
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
    INSERT INTO contracts (token, template_id, template_nome, cliente_label, valor_centavos, dia_vencimento, status, sandbox, expires_at, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?)
  `).run(
    token, template.id, template.nome, input.clienteLabel ?? null,
    valorCentavos, diaVencimento, config.autentiqueSandbox ? 1 : 0, expiresAt, nowISO(), createdBy ?? null
  );

  const id = Number(info.lastInsertRowid);
  logEvent('link_gerado', { templateId: template.id, clienteLabel: input.clienteLabel, sandbox: config.autentiqueSandbox, createdBy }, id);

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
      case 'email': if (!isValidEmail(raw)) erros[campo.name] = 'E-mail inválido'; break;
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
      else if (campo.type === 'email') v = v.toLowerCase();
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

    // 2) monta signatários (fixos + cliente)
    const clienteNome = form.nome || c.cliente_label || 'Cliente';

    // Modo de teste seguro: em sandbox, redireciona os fixos para o e-mail de teste
    // e NÃO dispara nada ao cliente real (ele assina pelo link mostrado na tela).
    const redirecionarTeste = config.autentiqueSandbox && !!config.testSignerEmail;
    if (redirecionarTeste) {
      logEvent('signatarios_redirecionados_teste', { para: config.testSignerEmail }, c.id);
    }

    const clienteSigner = montarSignerCliente(
      { nome: clienteNome, email: form.email || undefined, telefone: form.telefone || undefined },
      redirecionarTeste,
    );

    // Os 4 signatários fixos da agência assinam por e-mail, SEM verificação extra.
    const signers: SignerInput[] = [
      ...template.signatariosFixos.map((s, i) => ({
        name: s.name,
        email: redirecionarTeste ? emailDeTeste(i) : s.email,
        action: s.action,
        delivery_method: 'DELIVERY_METHOD_EMAIL' as const,
      })),
      clienteSigner,
    ];

    // 3) cria documento no Autentique
    const doc = await createDocumentWithFile({
      document: { name: template.documentName(renderInput), refusable: false, sortable: false },
      signers,
      fileBuffer: pdf,
      filename: `${template.documentName(renderInput)}.pdf`.replace(/[\\/:*?"<>|]/g, '-'),
    });
    logEvent('documento_criado', { autentiqueId: doc.id, sandbox: doc.sandbox }, c.id);

    // 4) descobre o signatário cliente e o link de assinatura.
    //    O cliente é o único signatário sem e-mail (teste=LINK, produção=WhatsApp por telefone).
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

    // Opção A: além do WhatsApp (Autentique), enviamos o MESMO link por e-mail.
    // Em modo de teste NÃO enviamos nada ao cliente real.
    if (redirecionarTeste) {
      logEvent('email_pulado_modo_teste', { para: form.email }, c.id);
    } else {
      await enviarLinkAssinatura({ para: form.email, nome: clienteNome, link: shortLink, contractId: c.id })
        .catch((err) => logEvent('email_erro', { mensagem: String(err?.message ?? err) }, c.id));
    }

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
    SELECT c.id, c.token, c.template_nome, c.cliente_label, c.valor_centavos, c.dia_vencimento,
           c.status, c.tipo_pessoa, c.short_link, c.autentique_document_id, c.sandbox,
           c.expires_at, c.created_at, c.submitted_at, c.signed_at,
           c.created_by, u.nome AS created_by_nome
    FROM contracts c
    LEFT JOIN users u ON u.id = c.created_by
    ORDER BY c.id DESC LIMIT ?
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
