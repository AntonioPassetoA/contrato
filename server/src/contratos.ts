import crypto from 'node:crypto';
import { db, type ContratoRow, type ContratoStatus } from './db';
import { config } from './config';
import { logAudit } from './audit';
import { getModelo, modeloConteudoValidado, type ModeloContrato } from './modelos';
import { empresaCompleta, pendenciasEmpresa, getPrivacidadeUrl } from './configEmpresa';
import { camposCliente, validarFormularioCliente, sanitizarFormulario } from './formulariosCliente';
import type { CampoDef } from './templates/types';
import { encryptJSON, decryptJSON } from './seguranca/pii';
import { mascararCampo } from './seguranca/mascarar';
import { montarConteudoBase, montarClausulasBase, type Clausula, type ConteudoContrato } from './conteudoContrato';
import { comporContrato, pendenciasParaGeracao } from './composicaoContrato';
import { gerarPdfArquivo, renderContratoHtml, type RenderPdf } from './pdfContrato';
import { readFileSync } from 'node:fs';

function nowISO() { return new Date().toISOString(); }
function hojeISODate() { return new Date().toISOString().slice(0, 10); } // YYYY-MM-DD
function gerarToken() { return crypto.randomBytes(24).toString('base64url'); }

const CIDADE_PADRAO = 'Bandeirantes/PR';

/** Estados em que a admin ainda pode (re)configurar/editar o contrato (nunca após assinado). */
const STATUS_EDITAVEL = new Set<ContratoStatus>([
  'solicitado', 'configurado', 'link_liberado', 'preenchido', 'aprovado',
  'aguardando_assinatura', 'visualizado', 'parcialmente_assinado',
]);
/** Estados em que o documento já foi enviado para assinatura (Autentique). */
const STATUS_ENVIADO = new Set<ContratoStatus>([
  'aguardando_assinatura', 'visualizado', 'parcialmente_assinado',
]);

/** Estados em que o link do formulário do cliente já foi liberado pela admin. */
const STATUS_COM_LINK = new Set([
  'link_liberado', 'preenchido', 'aprovado', 'aguardando_assinatura',
  'visualizado', 'parcialmente_assinado', 'assinado',
]);

export function getContratoRow(id: number): ContratoRow | undefined {
  return db.prepare(`SELECT * FROM contratos WHERE id = ?`).get(id) as ContratoRow | undefined;
}

// ---------- Vendedor: criar solicitação ----------

export function criarSolicitacao(vendedorId: number, clinicaNome: string): ContratoVendedorView {
  const nome = (clinicaNome || '').trim();
  if (!nome) throw new Error('Informe o nome da clínica.');

  const info = db.prepare(`
    INSERT INTO contratos (clinica_nome, vendedor_id, status, created_at, updated_at)
    VALUES (?, ?, 'solicitado', ?, ?)
  `).run(nome, vendedorId, nowISO(), nowISO());

  const id = Number(info.lastInsertRowid);
  logAudit(id, vendedorId, 'solicitacao_criada', 'clinica_nome', null, nome);
  return toVendedorView(getContratoRow(id)!);
}

// ---------- Visões por papel ----------

/** O que o VENDEDOR pode ver — nunca valores, blocos, fidelidade ou condições. */
export interface ContratoVendedorView {
  id: number;
  clinica_nome: string;
  status: string;
  link: string | null;      // link do formulário, só depois de liberado pela admin
  assinado: boolean;
  created_at: string;
  updated_at: string | null;
}

function toVendedorView(c: ContratoRow): ContratoVendedorView {
  const temLink = !!c.token && STATUS_COM_LINK.has(c.status);
  return {
    id: c.id,
    clinica_nome: c.clinica_nome,
    status: c.status,
    link: temLink ? `${config.publicBaseUrl}/c/${c.token}` : null,
    assinado: c.status === 'assinado',
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

/** Visão da ADMIN — completa (com o vendedor que originou). */
export interface ContratoAdminView extends ContratoRow {
  vendedor_nome: string | null;
}

export function listarParaVendedor(vendedorId: number): ContratoVendedorView[] {
  const rows = db.prepare(
    `SELECT * FROM contratos WHERE vendedor_id = ? ORDER BY id DESC`,
  ).all(vendedorId) as unknown as ContratoRow[];
  return rows.map(toVendedorView);
}

export function listarParaAdmin(): ContratoAdminView[] {
  return db.prepare(`
    SELECT c.*, u.nome AS vendedor_nome
    FROM contratos c
    LEFT JOIN users u ON u.id = c.vendedor_id
    ORDER BY c.id DESC
  `).all() as unknown as ContratoAdminView[];
}

export function getParaVendedor(id: number, vendedorId: number): ContratoVendedorView | null {
  const c = getContratoRow(id);
  if (!c || c.vendedor_id !== vendedorId) return null;
  return toVendedorView(c);
}

export function getParaAdmin(id: number): ContratoAdminView | null {
  const c = db.prepare(`
    SELECT c.*, u.nome AS vendedor_nome
    FROM contratos c LEFT JOIN users u ON u.id = c.vendedor_id
    WHERE c.id = ?
  `).get(id) as ContratoAdminView | undefined;
  return c ?? null;
}

// ---------- Admin: configuração do contrato (Etapa 2) ----------

function parseBlocos(raw: string | null): string[] {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}

function parseFidelidade(raw: string | null): { ativo: boolean; meses: number | null } {
  if (!raw) return { ativo: false, meses: null };
  try {
    const v = JSON.parse(raw);
    return { ativo: !!v?.ativo, meses: v?.meses != null ? Number(v.meses) : null };
  } catch { return { ativo: false, meses: null }; }
}

export interface GarantiaView { ativo: boolean; investimentoCentavos: number | null; periodoMeses: number | null }
function parseGarantia(raw: string | null): GarantiaView {
  if (!raw) return { ativo: false, investimentoCentavos: null, periodoMeses: null };
  try {
    const v = JSON.parse(raw);
    return {
      ativo: !!v?.ativo,
      investimentoCentavos: v?.investimentoCentavos != null ? Number(v.investimentoCentavos) : null,
      periodoMeses: v?.periodoMeses != null ? Number(v.periodoMeses) : null,
    };
  } catch { return { ativo: false, investimentoCentavos: null, periodoMeses: null }; }
}

/** Visão de CONFIGURAÇÃO para a admin — valores já parseados + defaults sugeridos. */
export interface ContratoConfigView {
  id: number;
  clinica_nome: string;
  vendedor_id: number;
  vendedor_nome: string | null;
  status: ContratoStatus;
  tipo_modelo: string | null;
  tipo_pessoa: 'pf' | 'pj' | null;
  blocos: string[];
  fidelidade: { ativo: boolean; meses: number | null };
  social_midia: boolean;               // modificador do Funil
  garantia: GarantiaView;              // opt-in separado (nunca padrão)
  valor_centavos: number | null;
  dia_vencimento: number | null;
  limite_leads: number | null;
  cidade_assinatura: string;   // já com default sugerido
  data_assinatura: string;     // já com default sugerido (hoje)
  token: string | null;
  link: string | null;
  personalizado: boolean;      // conteúdo foi editado manualmente?
  configurado: boolean;        // config do contrato está completa?
  pendencias_contrato: string[];
  empresa_completa: boolean;   // CONTRATADA + testemunhas ok?
  pendencias_empresa: string[];
  created_at: string;
  updated_at: string | null;
}

export function getConfigParaAdmin(id: number): ContratoConfigView | null {
  const c = getParaAdmin(id);
  if (!c) return null;
  const blocos = parseBlocos(c.blocos);
  const view = {
    id: c.id,
    clinica_nome: c.clinica_nome,
    vendedor_id: c.vendedor_id,
    vendedor_nome: c.vendedor_nome,
    status: c.status,
    tipo_modelo: c.tipo_modelo,
    tipo_pessoa: c.tipo_pessoa,
    blocos,
    fidelidade: parseFidelidade(c.fidelidade),
    social_midia: c.social_midia === 1,
    garantia: parseGarantia(c.garantia),
    valor_centavos: c.valor_centavos,
    dia_vencimento: c.dia_vencimento,
    limite_leads: c.limite_leads,
    cidade_assinatura: c.cidade_assinatura || CIDADE_PADRAO,
    data_assinatura: c.data_assinatura || hojeISODate(),
    token: c.token,
    link: c.token && STATUS_COM_LINK.has(c.status) ? `${config.publicBaseUrl}/c/${c.token}` : null,
    personalizado: c.personalizado === 1,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
  const pendencias_contrato = pendenciasContrato(c);
  return {
    ...view,
    configurado: pendencias_contrato.length === 0,
    pendencias_contrato,
    empresa_completa: empresaCompleta(),
    pendencias_empresa: pendenciasEmpresa(),
  };
}

/** Pendências da configuração DO CONTRATO (independente da empresa). */
export function pendenciasContrato(c: ContratoRow, modelo?: ModeloContrato): string[] {
  const p: string[] = [];
  const m = modelo ?? (c.tipo_modelo ? getModelo(c.tipo_modelo) : undefined);
  if (!m) { p.push('Modelo de contrato.'); return p; }
  if (c.tipo_pessoa !== 'pf' && c.tipo_pessoa !== 'pj') p.push('Tipo de pessoa (PF ou PJ).');
  const blocos = parseBlocos(c.blocos);
  if (blocos.length === 0) p.push('Ao menos um bloco de serviço.');
  if (!(c.valor_centavos && c.valor_centavos > 0)) p.push('Valor mensal.');
  if (!(c.dia_vencimento && c.dia_vencimento >= 1 && c.dia_vencimento <= 31)) p.push('Dia de vencimento (1 a 31).');
  const usaLeads = blocos.some((id) => m.blocos.find((b) => b.id === id)?.usaLimiteLeads);
  if (usaLeads && !(c.limite_leads && c.limite_leads > 0)) p.push('Limite mensal de leads (bloco CRC selecionado).');
  // Social Mídia é um MODIFICADOR do Funil — não pode existir sem o Funil selecionado.
  if (c.social_midia === 1 && !blocos.includes('funil')) p.push('Social Mídia exige o bloco Funil selecionado.');
  const fid = parseFidelidade(c.fidelidade);
  if (fid.ativo && !(fid.meses && fid.meses >= 1)) p.push('Meses de fidelidade.');
  const gar = parseGarantia(c.garantia);
  if (gar.ativo) {
    if (!(gar.investimentoCentavos && gar.investimentoCentavos > 0)) p.push('Investimento mínimo de mídia paga (Garantia).');
    if (!(gar.periodoMeses && gar.periodoMeses >= 1)) p.push('Período da garantia (em meses).');
  }
  if (!c.cidade_assinatura?.trim()) p.push('Cidade de assinatura.');
  if (!c.data_assinatura?.trim()) p.push('Data de assinatura.');
  return p;
}

export interface ConfigContratoInput {
  tipoModelo: string;
  tipoPessoa: 'pf' | 'pj';
  blocos: string[];
  /** Modificador do Funil (inclui "vídeos" + item de conteúdos educacionais). Exige Funil. */
  socialMidia?: boolean;
  fidelidadeAtiva: boolean;
  fidelidadeMeses?: number | null;
  /** Garantia (opt-in separado, nunca padrão). Ativar exige confirmação específica. */
  garantiaAtiva?: boolean;
  garantiaInvestimentoCentavos?: number | null;
  garantiaPeriodoMeses?: number | null;
  /** Confirmação específica exigida para ATIVAR a garantia (obrigação financeira). */
  confirmarGarantia?: boolean;
  valorCentavos: number;
  diaVencimento: number;
  limiteLeads?: number | null;
  cidadeAssinatura: string;
  dataAssinatura: string;
  /** Exigido quando a alteração muda os blocos de um contrato já configurado. */
  confirmarAlteracaoBlocos?: boolean;
  /** Exigido quando o contrato já teve link liberado (invalida o link e volta à revisão). */
  confirmarAlteracaoComLink?: boolean;
}

/** Contrato já tem link ativo ou já foi preenchido/enviado → mudança exige reconfirmação. */
function precisaReconfirmar(c: ContratoRow): boolean {
  return c.token != null || STATUS_JA_PREENCHIDO.has(c.status);
}

/** Invalida o link e devolve o contrato para revisão ('configurado'), auditando. */
function invalidarLinkEVoltarRevisao(id: number, c: ContratoRow, adminId: number, motivo: string): void {
  if (c.token != null) logAudit(id, adminId, 'link_invalidado', 'token', c.token, null);
  if (c.status !== 'configurado' && c.status !== 'solicitado') {
    logAudit(id, adminId, 'voltou_para_revisao', 'status', c.status, 'configurado');
  }
  db.prepare(`UPDATE contratos SET token = NULL, status = 'configurado', updated_at = ? WHERE id = ?`)
    .run(nowISO(), id);
  logAudit(id, adminId, motivo);
}

/**
 * Configura (ou reconfigura) o contrato pela admin. Valida tudo, audita cada campo
 * alterado (antes/depois) e passa o status para 'configurado'. Alteração de blocos
 * de um contrato já configurado exige confirmação explícita.
 */
export function configurarContrato(adminId: number, id: number, input: ConfigContratoInput): ContratoConfigView {
  const c = getContratoRow(id);
  if (!c) throw new Error('Contrato não encontrado.');
  if (!STATUS_EDITAVEL.has(c.status)) {
    throw new Error(`Este contrato não pode mais ser editado (status: ${c.status}).`);
  }

  const modelo = getModelo(String(input.tipoModelo || ''));
  if (!modelo || !modelo.modular) throw new Error('Modelo de contrato inválido.');

  const tipoPessoa = input.tipoPessoa;
  if (tipoPessoa !== 'pf' && tipoPessoa !== 'pj') throw new Error('Selecione PF ou PJ.');
  if (tipoPessoa === 'pf' && !modelo.suportaPF) throw new Error('Este modelo não suporta PF.');
  if (tipoPessoa === 'pj' && !modelo.suportaPJ) throw new Error('Este modelo não suporta PJ.');

  const blocos = Array.from(new Set((input.blocos || []).map(String)));
  if (blocos.length === 0) throw new Error('Selecione ao menos um bloco de serviço.');
  const idsValidos = new Set(modelo.blocos.map((b) => b.id));
  const invalido = blocos.find((b) => !idsValidos.has(b));
  if (invalido) throw new Error(`Bloco inválido: ${invalido}.`);

  const valorCentavos = Math.round(Number(input.valorCentavos));
  if (!Number.isFinite(valorCentavos) || valorCentavos <= 0) throw new Error('Informe um valor mensal válido.');

  const diaVencimento = Math.trunc(Number(input.diaVencimento));
  if (!Number.isInteger(diaVencimento) || diaVencimento < 1 || diaVencimento > 31) {
    throw new Error('Dia de vencimento deve ser entre 1 e 31.');
  }

  const usaLeads = blocos.some((bid) => modelo.blocos.find((b) => b.id === bid)?.usaLimiteLeads);
  let limiteLeads: number | null = null;
  if (usaLeads) {
    limiteLeads = Math.trunc(Number(input.limiteLeads));
    if (!Number.isInteger(limiteLeads) || limiteLeads <= 0) {
      throw new Error('Informe o limite mensal de leads (maior que zero) para o bloco CRC.');
    }
  }

  // Social Mídia é um MODIFICADOR do Funil (não bloco autônomo): só pode ser ativado
  // se o Funil estiver selecionado. Caso contrário, é rejeitado nesta versão.
  const socialMidia = !!input.socialMidia;
  if (socialMidia && !blocos.includes('funil')) {
    throw new Error('Social Mídia só pode ser ativado com o bloco Funil de Captação selecionado.');
  }

  const fidelidadeAtiva = !!input.fidelidadeAtiva;
  let fidelidadeMeses: number | null = null;
  if (fidelidadeAtiva) {
    fidelidadeMeses = Math.trunc(Number(input.fidelidadeMeses));
    if (!Number.isInteger(fidelidadeMeses) || fidelidadeMeses < 1) {
      throw new Error('Informe os meses de fidelidade (maior que zero).');
    }
  }

  // Garantia (opt-in separado, nunca padrão). Envolve obrigação financeira (devolução de
  // mensalidades): ATIVAR exige confirmação específica + variáveis (investimento mínimo e
  // período). Nunca é ligada automaticamente.
  const garantiaAtiva = !!input.garantiaAtiva;
  let garantiaInvestimento: number | null = null;
  let garantiaPeriodo: number | null = null;
  const garantiaJaAtiva = parseGarantia(c.garantia).ativo;
  if (garantiaAtiva) {
    if (!garantiaJaAtiva && !input.confirmarGarantia) {
      const err: any = new Error('Ativar a Garantia de resultados implica obrigação financeira (possível devolução de mensalidades). Confirme para prosseguir.');
      err.code = 'confirmar_garantia';
      throw err;
    }
    garantiaInvestimento = Math.round(Number(input.garantiaInvestimentoCentavos));
    if (!Number.isFinite(garantiaInvestimento) || garantiaInvestimento <= 0) {
      throw new Error('Informe o investimento mínimo de mídia paga da garantia (maior que zero).');
    }
    garantiaPeriodo = Math.trunc(Number(input.garantiaPeriodoMeses));
    if (!Number.isInteger(garantiaPeriodo) || garantiaPeriodo < 1) {
      throw new Error('Informe o período da garantia em meses (maior que zero).');
    }
  }

  const cidade = (input.cidadeAssinatura || '').trim();
  if (!cidade) throw new Error('Informe a cidade de assinatura.');
  const data = (input.dataAssinatura || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Data de assinatura inválida (use AAAA-MM-DD).');

  const fidelidadeJson = JSON.stringify({ ativo: fidelidadeAtiva, meses: fidelidadeMeses });
  const blocosJson = JSON.stringify(blocos);
  const garantiaJson = garantiaAtiva
    ? JSON.stringify({ ativo: true, investimentoCentavos: garantiaInvestimento, periodoMeses: garantiaPeriodo })
    : null;
  const socialMidiaInt = socialMidia ? 1 : 0;

  // Detecta o que mudou (para auditar e decidir sobre confirmações/invalidação).
  const dif: Array<[string, unknown, unknown]> = [
    ['tipo_modelo', c.tipo_modelo, modelo.id],
    ['tipo_pessoa', c.tipo_pessoa, tipoPessoa],
    ['blocos', c.blocos, blocosJson],
    ['social_midia', c.social_midia, socialMidiaInt],
    ['fidelidade', c.fidelidade, fidelidadeJson],
    ['garantia', c.garantia, garantiaJson],
    ['valor_centavos', c.valor_centavos, valorCentavos],
    ['dia_vencimento', c.dia_vencimento, diaVencimento],
    ['limite_leads', c.limite_leads, limiteLeads],
    ['cidade_assinatura', c.cidade_assinatura, cidade],
    ['data_assinatura', c.data_assinatura, data],
  ];
  const mudou = dif.filter(([, a, d]) => (a == null ? null : String(a)) !== (d == null ? null : String(d)));

  // Auditoria específica: ATIVAÇÃO da garantia (obrigação financeira) é registrada à parte.
  if (garantiaAtiva && !garantiaJaAtiva) {
    logAudit(id, adminId, 'garantia_ativada', 'garantia', null, `investimento=${garantiaInvestimento} periodo_meses=${garantiaPeriodo}`);
  } else if (!garantiaAtiva && garantiaJaAtiva) {
    logAudit(id, adminId, 'garantia_desativada', 'garantia', 'ativa', null);
  }

  // Confirmação obrigatória ao mudar os blocos de um contrato já configurado.
  const blocosAntes = parseBlocos(c.blocos);
  const jaConfigurado = c.status !== 'solicitado' && blocosAntes.length > 0;
  const mudouBlocos = JSON.stringify([...blocosAntes].sort()) !== JSON.stringify([...blocos].sort());
  if (jaConfigurado && mudouBlocos && !input.confirmarAlteracaoBlocos) {
    const err: any = new Error('Alterar os blocos de serviço exige confirmação.');
    err.code = 'confirmar_alteracao_blocos';
    throw err;
  }

  // Contrato com link ativo / já preenchido / já enviado → mudança relevante exige
  // NOVA confirmação, invalida o link e devolve para revisão.
  if (mudou.length > 0 && precisaReconfirmar(c) && !input.confirmarAlteracaoComLink) {
    const err: any = new Error(
      STATUS_ENVIADO.has(c.status)
        ? 'O documento já foi enviado para assinatura. Alterar exige confirmação e reiniciará uma nova versão.'
        : 'Este contrato já tem um link liberado. Alterar invalida o link atual e exige confirmação.',
    );
    err.code = 'confirmar_alteracao_com_link';
    throw err;
  }

  for (const [campo, antes, depois] of mudou) {
    logAudit(id, adminId, 'contrato_config_alterada', campo, antes, depois);
  }

  // Alteração relevante após já haver PDF gerado → marca o PDF como substituído e
  // exige nova aprovação (nunca sobrescreve silenciosamente).
  if (mudou.length > 0) invalidarPdfsAtivos(id, adminId, 'configuracao_alterada');

  // Se já enviado para a Autentique, registra a pendência de cancelamento do documento
  // (o cancelamento efetivo na Autentique é feito na Etapa 3).
  if (STATUS_ENVIADO.has(c.status) && mudou.length > 0) {
    logAudit(id, adminId, 'autentique_cancelamento_pendente', 'status', c.status, null);
  }

  const invalidarToken = c.token != null;
  db.prepare(`
    UPDATE contratos SET
      tipo_modelo = ?, tipo_pessoa = ?, blocos = ?, social_midia = ?, fidelidade = ?, garantia = ?,
      valor_centavos = ?, dia_vencimento = ?, limite_leads = ?,
      cidade_assinatura = ?, data_assinatura = ?,
      configurado_por = ?, token = NULL, status = 'configurado', updated_at = ?
    WHERE id = ?
  `).run(
    modelo.id, tipoPessoa, blocosJson, socialMidiaInt, fidelidadeJson, garantiaJson,
    valorCentavos, diaVencimento, limiteLeads,
    cidade, data,
    adminId, nowISO(), id,
  );

  if (invalidarToken) logAudit(id, adminId, 'link_invalidado', 'token', c.token, null);
  logAudit(id, adminId, 'contrato_configurado', 'status', c.status, 'configurado');
  return getConfigParaAdmin(id)!;
}

/**
 * Gera e libera o link do formulário do cliente. Só permite se a configuração do
 * contrato E a configuração da empresa (CONTRATADA + testemunhas) estiverem completas.
 * NÃO gera PDF e NÃO envia para a Autentique (Etapa 3).
 */
export function liberarLink(adminId: number, id: number): ContratoConfigView {
  const c = getContratoRow(id);
  if (!c) throw new Error('Contrato não encontrado.');

  const pendC = pendenciasContrato(c);
  if (pendC.length > 0) {
    const err: any = new Error('Configuração do contrato incompleta.');
    err.code = 'contrato_incompleto';
    err.pendencias = pendC;
    throw err;
  }
  const pendE = pendenciasEmpresa();
  if (pendE.length > 0) {
    const err: any = new Error('Configuração da empresa (CONTRATADA/testemunhas) incompleta.');
    err.code = 'empresa_incompleta';
    err.pendencias = pendE;
    throw err;
  }

  // Sempre gera um token NOVO — nunca reutiliza (o anterior já foi invalidado na edição).
  const token = gerarToken();
  db.prepare(`
    UPDATE contratos SET token = ?, status = 'link_liberado', aprovado_por = ?, updated_at = ?
    WHERE id = ?
  `).run(token, adminId, nowISO(), id);

  logAudit(id, adminId, 'link_liberado', 'status', c.status, 'link_liberado');
  return getConfigParaAdmin(id)!;
}

// ---------- Fluxo público (cliente) — usa SOMENTE a tabela `contratos` ----------

function getPorToken(token: string): ContratoRow | undefined {
  if (!token) return undefined;
  return db.prepare(`SELECT * FROM contratos WHERE token = ?`).get(token) as ContratoRow | undefined;
}

/** Estados em que o formulário do cliente pode ser preenchido. */
const STATUS_FORM_ABERTO = new Set<ContratoStatus>(['link_liberado']);
/** Estados em que já foi preenchido/enviado (não permite novo preenchimento livre). */
const STATUS_JA_PREENCHIDO = new Set<ContratoStatus>([
  'preenchido', 'aprovado', 'aguardando_assinatura', 'visualizado', 'parcialmente_assinado', 'assinado',
]);

/** Payload PÚBLICO — só o necessário para montar o formulário. Sem dados internos. */
export interface FormularioPublico {
  clinicaNome: string;
  tipoPessoa: 'pf' | 'pj';
  campos: CampoDef[];
  privacidadeUrl: string;
}
export type ResultadoAbertura =
  | { estado: 'ok'; form: FormularioPublico }
  | { estado: 'nao_encontrado' }
  | { estado: 'ja_preenchido'; clinicaNome: string }
  | { estado: 'indisponivel' };

export function abrirFormularioPublico(token: string): ResultadoAbertura {
  const c = getPorToken(token);
  if (!c) return { estado: 'nao_encontrado' };
  if (STATUS_JA_PREENCHIDO.has(c.status)) return { estado: 'ja_preenchido', clinicaNome: c.clinica_nome };
  if (!STATUS_FORM_ABERTO.has(c.status) || !c.tipo_pessoa) return { estado: 'indisponivel' };
  return {
    estado: 'ok',
    form: {
      clinicaNome: c.clinica_nome,
      tipoPessoa: c.tipo_pessoa,
      campos: camposCliente(c.tipo_pessoa),
      privacidadeUrl: getPrivacidadeUrl(),
    },
  };
}

export type ResultadoEnvio =
  | { estado: 'ok' }
  | { estado: 'nao_encontrado' }
  | { estado: 'ja_preenchido' }
  | { estado: 'indisponivel' }
  | { estado: 'invalido'; erros: Record<string, string> };

/** Envio do formulário: valida, salva os dados do cliente e marca 'preenchido'. Sem PDF/Autentique. */
export function submeterFormularioPublico(token: string, form: Record<string, unknown>): ResultadoEnvio {
  const c = getPorToken(token);
  if (!c) return { estado: 'nao_encontrado' };
  if (STATUS_JA_PREENCHIDO.has(c.status)) return { estado: 'ja_preenchido' };
  if (!STATUS_FORM_ABERTO.has(c.status) || !c.tipo_pessoa) return { estado: 'indisponivel' };

  const erros = validarFormularioCliente(c.tipo_pessoa, form || {});
  if (Object.keys(erros).length > 0) return { estado: 'invalido', erros };

  const limpo = sanitizarFormulario(c.tipo_pessoa, form || {});
  // PII criptografada em repouso (AES-256-GCM). Nunca gravada em texto aberto.
  db.prepare(`
    UPDATE contratos SET form_data = ?, status = 'preenchido', submitted_at = ?, updated_at = ?
    WHERE id = ?
  `).run(encryptJSON(limpo), nowISO(), nowISO(), c.id);

  // Auditoria sem PII: registra o evento, não os dados pessoais (que ficam em form_data).
  logAudit(c.id, null, 'formulario_preenchido', 'status', c.status, 'preenchido');
  return { estado: 'ok' };
}

/**
 * Reabertura do formulário pela Manu (o cliente não reedita sozinho após enviar).
 * Mantém o mesmo token/link (mesmo cliente) e registra na auditoria.
 */
export function reabrirFormulario(adminId: number, id: number): ContratoConfigView {
  const c = getContratoRow(id);
  if (!c) throw new Error('Contrato não encontrado.');
  if (!STATUS_JA_PREENCHIDO.has(c.status)) {
    throw new Error('Só é possível reabrir um contrato já preenchido.');
  }
  if (!c.token) throw new Error('Este contrato não tem link ativo para reabrir. Gere um novo link.');
  db.prepare(`UPDATE contratos SET status = 'link_liberado', updated_at = ? WHERE id = ?`).run(nowISO(), id);
  logAudit(id, adminId, 'formulario_reaberto', 'status', c.status, 'link_liberado');
  return getConfigParaAdmin(id)!;
}

/** Dados enviados pelo cliente, para a Manu revisar (admin). null se ainda não preenchido.
 *  Descriptografa apenas no back-end; só o endpoint admin expõe estes valores. */
export function getDadosCliente(id: number): { tipo_pessoa: 'pf' | 'pj' | null; campos: CampoDef[]; valores: Record<string, string> } | null {
  const c = getContratoRow(id);
  if (!c || !c.form_data || !c.tipo_pessoa) return null;
  const valores = decryptJSON<Record<string, string>>(c.form_data);
  return { tipo_pessoa: c.tipo_pessoa, campos: camposCliente(c.tipo_pessoa), valores };
}

/**
 * Manu edita os dados do cliente pelo painel (mesmos campos/validações do formulário).
 * Audita QUEM/QUANDO e QUAIS campos mudaram — com valores MASCARADOS (sem PII completa).
 */
export function editarDadosCliente(
  adminId: number, id: number, form: Record<string, unknown>, confirmar: boolean,
): { tipo_pessoa: 'pf' | 'pj' | null; campos: CampoDef[]; valores: Record<string, string> } {
  const c = getContratoRow(id);
  if (!c) throw new Error('Contrato não encontrado.');
  if (!c.tipo_pessoa) throw new Error('Defina o tipo de pessoa antes de editar os dados.');
  if (!c.form_data) throw new Error('Este contrato ainda não tem dados do cliente.');
  if (!confirmar) {
    const err: any = new Error('Confirme a alteração dos dados do cliente.');
    err.code = 'confirmar_edicao_dados';
    throw err;
  }

  const erros = validarFormularioCliente(c.tipo_pessoa, form || {});
  if (Object.keys(erros).length > 0) {
    const err: any = new Error('Dados inválidos.');
    err.code = 'validacao';
    err.erros = erros;
    throw err;
  }

  const antes = decryptJSON<Record<string, string>>(c.form_data);
  const depois = sanitizarFormulario(c.tipo_pessoa, form || {});

  // Registra só os campos alterados, com valores mascarados.
  const alterados: string[] = [];
  for (const campo of camposCliente(c.tipo_pessoa)) {
    const a = String(antes[campo.name] ?? '');
    const d = String(depois[campo.name] ?? '');
    if (a !== d) {
      alterados.push(campo.name);
      logAudit(id, adminId, 'dados_cliente_alterados', campo.name, mascararCampo(campo.name, a), mascararCampo(campo.name, d));
    }
  }
  db.prepare(`UPDATE contratos SET form_data = ?, updated_at = ? WHERE id = ?`)
    .run(encryptJSON(depois), nowISO(), id);
  logAudit(id, adminId, 'dados_cliente_editados', 'campos', null, alterados.join(', ') || '(nenhum)');

  // Dados do cliente mudaram após já haver PDF → substitui o PDF e exige nova aprovação.
  if (alterados.length > 0) invalidarPdfsAtivos(id, adminId, 'dados_cliente_alterados');

  return { tipo_pessoa: c.tipo_pessoa, campos: camposCliente(c.tipo_pessoa), valores: depois };
}

// ---------- Edição de CONTEÚDO + versionamento (admin) ----------
// As versões guardam só as cláusulas (sem PII). O modelo-base nunca é alterado:
// uma edição manual cria uma VERSÃO personalizada daquele contrato.

interface VersaoRow {
  id: number; contrato_id: number; versao: number; origem: string;
  personalizado: number; conteudo: string; nota: string | null;
  criado_por: number | null; created_at: string;
}

export interface VersaoResumo {
  id: number; versao: number; origem: string; personalizado: boolean;
  nota: string | null; criado_por: number | null; created_at: string;
}
export interface VersaoCompleta extends VersaoResumo { conteudo: ConteudoContrato }

function versoesRows(id: number): VersaoRow[] {
  return db.prepare(`SELECT * FROM contrato_versoes WHERE contrato_id = ? ORDER BY versao ASC`)
    .all(id) as unknown as VersaoRow[];
}

function inserirVersao(id: number, origem: string, personalizado: 0 | 1, conteudo: ConteudoContrato, nota: string | null, adminId: number): VersaoRow {
  const ultimo = db.prepare(`SELECT MAX(versao) AS m FROM contrato_versoes WHERE contrato_id = ?`).get(id) as { m: number | null };
  const versao = (ultimo?.m ?? 0) + 1;
  const info = db.prepare(`
    INSERT INTO contrato_versoes (contrato_id, versao, origem, personalizado, conteudo, nota, criado_por, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, versao, origem, personalizado, JSON.stringify(conteudo), nota, adminId, nowISO());
  return db.prepare(`SELECT * FROM contrato_versoes WHERE id = ?`).get(Number(info.lastInsertRowid)) as unknown as VersaoRow;
}

function toResumo(v: VersaoRow): VersaoResumo {
  return { id: v.id, versao: v.versao, origem: v.origem, personalizado: v.personalizado === 1, nota: v.nota, criado_por: v.criado_por, created_at: v.created_at };
}
function parseConteudo(v: VersaoRow): ConteudoContrato {
  try { return JSON.parse(v.conteudo) as ConteudoContrato; } catch { return { titulo: 'Contrato', clausulas: [] }; }
}

const AVISO_MODELO_PENDENTE = 'Modelo jurídico pendente de validação';

/** Conteúdo atual: última versão salva; se não houver, o base gerado da config (não persistido).
 *  Se o modelo NÃO tem conteúdo jurídico validado, o editor fica INDISPONÍVEL. */
export function getConteudoAtual(id: number):
  | { disponivel: false; aviso: string; versao: number; origem: string; personalizado: boolean; persistido: boolean; conteudo: ConteudoContrato }
  | { disponivel: true; versao: number; origem: string; personalizado: boolean; persistido: boolean; conteudo: ConteudoContrato }
  | null {
  const c = getContratoRow(id);
  if (!c) return null;
  if (!modeloConteudoValidado(c.tipo_modelo)) {
    return { disponivel: false, aviso: AVISO_MODELO_PENDENTE, versao: 0, origem: '', personalizado: false, persistido: false, conteudo: { titulo: '', clausulas: [] } };
  }
  const rows = versoesRows(id);
  if (rows.length === 0) {
    return { disponivel: true, versao: 0, origem: 'base', personalizado: false, persistido: false, conteudo: montarConteudoBase(c) };
  }
  const ultima = rows[rows.length - 1];
  return { disponivel: true, versao: ultima.versao, origem: ultima.origem, personalizado: ultima.personalizado === 1, persistido: true, conteudo: parseConteudo(ultima) };
}

/** Bloqueia edição/versão enquanto o conteúdo jurídico do modelo não estiver validado. */
function exigirModeloValidado(c: ContratoRow): void {
  if (!modeloConteudoValidado(c.tipo_modelo)) {
    const err: any = new Error(AVISO_MODELO_PENDENTE);
    err.code = 'modelo_pendente';
    throw err;
  }
}

export function listarVersoes(id: number): VersaoResumo[] {
  return versoesRows(id).map(toResumo).reverse(); // mais recente primeiro
}

export function getVersao(id: number, versao: number): VersaoCompleta | null {
  const v = db.prepare(`SELECT * FROM contrato_versoes WHERE contrato_id = ? AND versao = ?`).get(id, versao) as unknown as VersaoRow | undefined;
  if (!v) return null;
  return { ...toResumo(v), conteudo: parseConteudo(v) };
}

function validarClausulas(clausulas: unknown): Clausula[] {
  if (!Array.isArray(clausulas) || clausulas.length === 0) throw new Error('O contrato precisa de ao menos uma cláusula.');
  return clausulas.map((cl: any, i) => {
    const titulo = String(cl?.titulo ?? '').trim();
    const texto = String(cl?.texto ?? '');
    if (!titulo) throw new Error(`A cláusula ${i + 1} precisa de um título.`);
    return { id: String(cl?.id ?? `clausula_${i + 1}`), titulo, texto };
  });
}

/**
 * Edita o CONTEÚDO do contrato criando uma versão personalizada (modelo-base intacto).
 * Se o contrato já tem link/foi preenchido/enviado, exige confirmação, invalida o link
 * e devolve para revisão.
 */
export function editarConteudo(adminId: number, id: number, clausulasInput: unknown, confirmar: boolean, nota?: string): VersaoCompleta {
  const c = getContratoRow(id);
  if (!c) throw new Error('Contrato não encontrado.');
  exigirModeloValidado(c);
  if (!STATUS_EDITAVEL.has(c.status)) throw new Error(`Este contrato não pode mais ser editado (status: ${c.status}).`);

  const clausulas = validarClausulas(clausulasInput);

  if (precisaReconfirmar(c) && !confirmar) {
    const err: any = new Error(
      STATUS_ENVIADO.has(c.status)
        ? 'O documento já foi enviado para assinatura. Editar o conteúdo exige confirmação e reiniciará uma nova versão.'
        : 'Este contrato já tem um link liberado. Editar o conteúdo invalida o link atual e exige confirmação.',
    );
    err.code = 'confirmar_alteracao_com_link';
    throw err;
  }

  // Garante o snapshot BASE como v1 (preserva o original no histórico).
  if (versoesRows(id).length === 0) {
    inserirVersao(id, 'base', 0, montarConteudoBase(c), 'Versão base (modelo)', adminId);
  }

  const conteudo: ConteudoContrato = { titulo: 'Contrato de Prestação de Serviços', clausulas };
  const nova = inserirVersao(id, 'personalizado', 1, conteudo, (nota || '').trim() || null, adminId);
  db.prepare(`UPDATE contratos SET personalizado = 1, updated_at = ? WHERE id = ?`).run(nowISO(), id);
  logAudit(id, adminId, 'contrato_conteudo_editado', 'versao', null, String(nova.versao));

  // Cláusulas mudaram após já haver PDF → substitui o PDF e exige nova aprovação.
  invalidarPdfsAtivos(id, adminId, 'conteudo_alterado');
  if (STATUS_ENVIADO.has(c.status)) logAudit(id, adminId, 'autentique_cancelamento_pendente', 'status', c.status, null);
  if (precisaReconfirmar(c)) invalidarLinkEVoltarRevisao(id, c, adminId, 'conteudo_alterado_link_invalidado');

  return { ...toResumo(nova), conteudo };
}

/**
 * Restaura uma versão anterior (antes do envio) criando uma NOVA versão a partir dela.
 * Mantém o histórico. Se houver link, exige confirmação e invalida o link.
 */
export function restaurarVersao(adminId: number, id: number, versao: number, confirmar: boolean): VersaoCompleta {
  const c = getContratoRow(id);
  if (!c) throw new Error('Contrato não encontrado.');
  exigirModeloValidado(c);
  if (!STATUS_EDITAVEL.has(c.status)) throw new Error(`Este contrato não pode mais ser editado (status: ${c.status}).`);
  const fonte = db.prepare(`SELECT * FROM contrato_versoes WHERE contrato_id = ? AND versao = ?`).get(id, versao) as unknown as VersaoRow | undefined;
  if (!fonte) throw new Error('Versão não encontrada.');

  if (precisaReconfirmar(c) && !confirmar) {
    const err: any = new Error('Restaurar uma versão anterior invalida o link atual e exige confirmação.');
    err.code = 'confirmar_alteracao_com_link';
    throw err;
  }

  const conteudo = parseConteudo(fonte);
  const nova = inserirVersao(id, 'restaurado', fonte.personalizado as 0 | 1, conteudo, `Restaurada da versão ${versao}`, adminId);
  db.prepare(`UPDATE contratos SET personalizado = ?, updated_at = ? WHERE id = ?`).run(fonte.personalizado, nowISO(), id);
  logAudit(id, adminId, 'versao_restaurada', 'versao', null, String(versao));

  invalidarPdfsAtivos(id, adminId, 'versao_restaurada');
  if (precisaReconfirmar(c)) invalidarLinkEVoltarRevisao(id, c, adminId, 'conteudo_alterado_link_invalidado');
  return { ...toResumo(nova), conteudo };
}

// ---------- PDF: prévia, aprovação/geração e versionamento (admin) ----------
// O PDF fica em disco NÃO público (só admin). Cada geração cria uma versão nova;
// a anterior é marcada 'substituido' (nunca sobrescrita). Guarda hash de conteúdo
// (embutido no PDF) e hash do arquivo, além do identificador interno do contrato.

interface PdfRow {
  id: number; contrato_id: number; versao_pdf: number; conteudo_versao: number | null;
  hash_conteudo: string; hash_arquivo: string; caminho: string; tamanho: number;
  status: string; gerado_por: number | null; created_at: string; substituido_at: string | null;
}

export interface PdfResumo {
  id: number; versaoPdf: number; conteudoVersao: number | null;
  hashConteudo: string; hashArquivo: string; tamanho: number;
  status: string; geradoPor: number | null; createdAt: string; substituidoAt: string | null;
}

function toPdfResumo(r: PdfRow): PdfResumo {
  return {
    id: r.id, versaoPdf: r.versao_pdf, conteudoVersao: r.conteudo_versao,
    hashConteudo: r.hash_conteudo, hashArquivo: r.hash_arquivo, tamanho: r.tamanho,
    status: r.status, geradoPor: r.gerado_por, createdAt: r.created_at, substituidoAt: r.substituido_at,
  };
}

function pdfsRows(id: number): PdfRow[] {
  return db.prepare(`SELECT * FROM contrato_pdfs WHERE contrato_id = ? ORDER BY versao_pdf DESC`).all(id) as unknown as PdfRow[];
}
function pdfAtivoRow(id: number): PdfRow | undefined {
  return db.prepare(`SELECT * FROM contrato_pdfs WHERE contrato_id = ? AND status = 'ativo' ORDER BY versao_pdf DESC LIMIT 1`).get(id) as PdfRow | undefined;
}

/** Lista os PDFs do contrato (ativo + substituídos), mais recente primeiro. Só admin. */
export function listarPdfs(id: number): PdfResumo[] {
  return pdfsRows(id).map(toPdfResumo);
}

/** Lê o arquivo do PDF (ativo por padrão, ou um específico). Só admin. */
export function lerPdf(id: number, pdfId?: number): { buffer: Buffer; nome: string; resumo: PdfResumo } | null {
  const row = pdfId != null
    ? (db.prepare(`SELECT * FROM contrato_pdfs WHERE contrato_id = ? AND id = ?`).get(id, pdfId) as PdfRow | undefined)
    : pdfAtivoRow(id);
  if (!row) return null;
  let buffer: Buffer;
  try { buffer = readFileSync(row.caminho); } catch { return null; }
  return { buffer, nome: `contrato-${id}-v${row.versao_pdf}.pdf`, resumo: toPdfResumo(row) };
}

/** Marca os PDFs ativos como substituídos e, se aprovado, revoga a aprovação (exige nova). */
function invalidarPdfsAtivos(id: number, adminId: number, motivo: string): boolean {
  const ativo = pdfAtivoRow(id);
  if (!ativo) return false;
  db.prepare(`UPDATE contrato_pdfs SET status = 'substituido', substituido_at = ? WHERE contrato_id = ? AND status = 'ativo'`)
    .run(nowISO(), id);
  logAudit(id, adminId, 'pdf_substituido', 'versao_pdf', String(ativo.versao_pdf), motivo);
  const c = getContratoRow(id);
  if (c && c.status === 'aprovado') {
    db.prepare(`UPDATE contratos SET status = 'preenchido', pdf_path = NULL, updated_at = ? WHERE id = ?`).run(nowISO(), id);
    logAudit(id, adminId, 'aprovacao_revogada', 'status', 'aprovado', 'preenchido');
  }
  return true;
}

export interface PreviewContrato {
  pronto: boolean;
  pendencias: string[];
  versao: number; origem: string; personalizado: boolean;
  html: string;
  pdf: PdfResumo | null;
  temPdfSubstituido: boolean;
}

/**
 * Prévia integral do contrato — o MESMO HTML que vira PDF (para a Manu conferir antes
 * de aprovar). Mostra pendências e a versão utilizada. Só admin (contém PII do cliente).
 */
export function getPreview(id: number): PreviewContrato | null {
  const c = getContratoRow(id);
  if (!c) return null;
  const composto = comporContrato(c);
  const pendencias = pendenciasParaGeracao(c, pendenciasContrato);
  const pdfs = pdfsRows(id);
  const ativo = pdfs.find((p) => p.status === 'ativo') ?? null;
  return {
    pronto: pendencias.length === 0,
    pendencias,
    versao: composto.versao, origem: composto.origem, personalizado: composto.personalizado,
    html: renderContratoHtml(composto),
    pdf: ativo ? toPdfResumo(ativo) : null,
    temPdfSubstituido: pdfs.some((p) => p.status === 'substituido'),
  };
}

/**
 * "Aprovar e gerar PDF": exige que NÃO haja pendências e a confirmação explícita da Manu.
 * Compõe o contrato, gera o PDF, guarda em local não público, versiona (marca o anterior
 * como substituído) e passa o status para 'aprovado'. NÃO envia para a Autentique.
 */
export async function aprovarEGerarPdf(
  adminId: number, id: number, confirmar: boolean, render?: RenderPdf,
): Promise<PdfResumo> {
  const c = getContratoRow(id);
  if (!c) throw new Error('Contrato não encontrado.');
  if (!STATUS_EDITAVEL.has(c.status)) {
    throw new Error(`Este contrato não pode gerar PDF no status atual (${c.status}).`);
  }

  const pendencias = pendenciasParaGeracao(c, pendenciasContrato);
  if (pendencias.length > 0) {
    const err: any = new Error('Não é possível gerar o PDF: há pendências.');
    err.code = 'pendencias_geracao';
    err.pendencias = pendencias;
    throw err;
  }
  if (!confirmar) {
    const err: any = new Error('Confirme a aprovação para gerar o PDF.');
    err.code = 'confirmar_geracao';
    throw err;
  }

  const composto = comporContrato(c);
  const ultimo = db.prepare(`SELECT MAX(versao_pdf) AS m FROM contrato_pdfs WHERE contrato_id = ?`).get(id) as { m: number | null };
  const versaoPdf = (ultimo?.m ?? 0) + 1;

  const arquivo = await gerarPdfArquivo(composto, versaoPdf, render);

  // Substitui o PDF anterior (nunca sobrescreve) e registra o novo como ativo.
  db.prepare(`UPDATE contrato_pdfs SET status = 'substituido', substituido_at = ? WHERE contrato_id = ? AND status = 'ativo'`)
    .run(nowISO(), id);
  const info = db.prepare(`
    INSERT INTO contrato_pdfs
      (contrato_id, versao_pdf, conteudo_versao, hash_conteudo, hash_arquivo, caminho, tamanho, status, gerado_por, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'ativo', ?, ?)
  `).run(id, versaoPdf, composto.versao, arquivo.hashConteudo, arquivo.hashArquivo, arquivo.caminho, arquivo.tamanho, adminId, nowISO());

  db.prepare(`UPDATE contratos SET status = 'aprovado', pdf_path = ?, aprovado_por = ?, approved_at = ?, updated_at = ? WHERE id = ?`)
    .run(arquivo.caminho, adminId, nowISO(), nowISO(), id);

  // Auditoria SEM PII: registra a versão e o hash (não são dados pessoais).
  logAudit(id, adminId, 'pdf_gerado', 'versao_pdf', null, String(versaoPdf));
  logAudit(id, adminId, 'pdf_hash', 'hash_conteudo', null, arquivo.hashConteudo);
  logAudit(id, adminId, 'contrato_aprovado', 'status', c.status, 'aprovado');

  const nova = db.prepare(`SELECT * FROM contrato_pdfs WHERE id = ?`).get(Number(info.lastInsertRowid)) as unknown as PdfRow;
  return toPdfResumo(nova);
}
