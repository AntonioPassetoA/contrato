// Catálogo dos modelos de contrato e dos blocos de serviço selecionáveis pela admin.
//
// IMPORTANTE (Etapa 2): aqui ficam apenas os METADADOS de seleção (id, rótulo,
// resumo neutro para a UI). O TEXTO JURÍDICO VERBATIM de cada cláusula/bloco será
// ligado na Etapa 3 (renderização do PDF), copiado integralmente dos contratos reais,
// sem reescrever nem simplificar. NÃO inclua texto de cláusula fabricado neste arquivo.

/**
 * Controle interno de validação de um bloco jurídico, em DOIS níveis independentes:
 *
 *   - fonteConferida:   a redação foi transcrita INTEGRALMENTE do documento original
 *                       (conferência documental). NÃO significa aprovação jurídica.
 *   - validacaoJuridica: o conteúdo foi APROVADO pelo responsável jurídico autorizado.
 *
 * Regra de liberação do PDF: um bloco só libera a geração quando `fonteConferida` é
 * verdadeira E `validacaoJuridica` é 'validado'. Enquanto a validação jurídica estiver
 * pendente, a PRÉVIA é permitida, mas a GERAÇÃO definitiva do PDF fica bloqueada.
 *
 * Este registro é a FONTE DA VERDADE do bloqueio: o editor da Manu NÃO altera estes
 * controles nem contorna o bloqueio (apagar o marcador no texto não valida nada).
 * Transcrever o PDF pode, no máximo, marcar `fonteConferida = true`; nunca concede
 * automaticamente a validação jurídica.
 */
export type StatusValidacao = 'pendente' | 'validado';

/**
 * Proveniência formal da decisão jurídica (para auditoria). NÃO inventar nome/OAB:
 * campos não informados ficam como 'não informado'.
 */
export interface AprovacaoJuridica {
  /** Data comunicada da aprovação (ISO YYYY-MM-DD). */
  dataComunicada: string;
  /** Origem da decisão. */
  fonteDecisao: string;
  /** Dossiê de referência (caminho gitignored). */
  dossie: string;
  /** Hash SHA-256 do dossiê no momento da decisão. */
  dossieHash: string;
  /** Responsável jurídico (nome), se informado. */
  responsavel: string | null;
  /** Nº da OAB, se informado. */
  oab: string | null;
}

export interface ValidacaoBloco {
  /** A redação foi transcrita integralmente do documento original (conferência documental). */
  fonteConferida: boolean;
  /** Aprovação pelo responsável jurídico autorizado. */
  validacaoJuridica: StatusValidacao;
  /** Data (ISO YYYY-MM-DD) em que a fonte foi conferida, ou null. */
  fonteConferidaEm: string | null;
  /** Data (ISO YYYY-MM-DD) da validação jurídica, ou null enquanto pendente. */
  validadoJuridicoEm: string | null;
  /** Documento-fonte usado (identificador interno; sem armazenar o PDF no Git). */
  fonte: string | null;
  /** Versão da redação. */
  versaoRedacao: string | null;
  /** Proveniência da decisão jurídica (preenchida quando validado). */
  aprovacao?: AprovacaoJuridica | null;
}

export interface BlocoServico {
  id: string;
  label: string;
  /** Descrição curta e neutra para a UI (não é a cláusula do contrato). */
  resumo: string;
  /** Quando true, este bloco usa a variável "limite mensal de leads". */
  usaLimiteLeads?: boolean;
  /** Controle interno de validação (fonte conferida + validação jurídica). */
  validacao: ValidacaoBloco;
}

/** Ainda não transcrito e não validado (bloqueia PDF por fonte E por jurídico). */
const PENDENTE_TOTAL: ValidacaoBloco = {
  fonteConferida: false, validacaoJuridica: 'pendente',
  fonteConferidaEm: null, validadoJuridicoEm: null, fonte: null, versaoRedacao: null,
};

/** Cria um registro com a FONTE já conferida (transcrição integral), mas jurídico PENDENTE. */
function fonteConferida(fonte: string, em = '2026-08-24', versao = 'v1'): ValidacaoBloco {
  return {
    fonteConferida: true, validacaoJuridica: 'pendente',
    fonteConferidaEm: em, validadoJuridicoEm: null, fonte, versaoRedacao: versao,
  };
}

/** Cria um registro totalmente liberado (fonte conferida + validação jurídica). */
function totalmenteValidado(fonte: string, em = '2026-08-21', versao = 'v1'): ValidacaoBloco {
  return {
    fonteConferida: true, validacaoJuridica: 'validado',
    fonteConferidaEm: em, validadoJuridicoEm: em, fonte, versaoRedacao: versao,
  };
}

/**
 * Aprovação jurídica FORMAL comunicada em 2026-09-01 pelo responsável do projeto,
 * com base no dossiê _amostras/DOSSIE-VALIDACAO-JURIDICA.md. Nome/OAB não informados.
 */
export const APROVACAO_JURIDICA_2026_09_01: AprovacaoJuridica = {
  dataComunicada: '2026-09-01',
  fonteDecisao: 'aprovação jurídica formal comunicada pelo responsável do projeto',
  dossie: '_amostras/DOSSIE-VALIDACAO-JURIDICA.md',
  dossieHash: 'e5b743485ca7b19be305a79b66ac0760472e62642b0fed402ecc5f8be5ff2df9',
  responsavel: 'não informado',
  oab: 'não informado',
};

/** Registro com fonte conferida E validação jurídica CONCLUÍDA (aprovação 2026-09-01). */
function validadoJuridico(fonte: string, fonteEm = '2026-08-24', versao = 'v1'): ValidacaoBloco {
  return {
    fonteConferida: true, validacaoJuridica: 'validado',
    fonteConferidaEm: fonteEm, validadoJuridicoEm: '2026-09-01', fonte, versaoRedacao: versao,
    aprovacao: APROVACAO_JURIDICA_2026_09_01,
  };
}

export interface ModeloContrato {
  id: string;
  nome: string;
  descricao: string;
  /** Modular = admin monta os blocos. Os independentes entram depois (Etapa posterior). */
  modular: boolean;
  suportaPF: boolean;
  suportaPJ: boolean;
  blocos: BlocoServico[];
  /**
   * Conteúdo jurídico INTEGRAL e fiel já inserido/validado?
   * Enquanto FALSE, o "Editar contrato" fica INDISPONÍVEL ("Modelo jurídico pendente
   * de validação") — não se edita contrato com cláusulas provisórias/resumidas.
   * Só vira TRUE quando TODOS os textos oficiais (base + blocos + fidelidade) forem
   * inseridos verbatim dos contratos originais e validados juridicamente.
   */
  conteudoValidado: boolean;
}

// Blocos de serviço do "Contrato de Prestação de Serviços" (modular).
// funil e clinica_top1 são a BASE original (Plano Prata) já validada juridicamente.
// crc, ia, google_ads, site, consignado, facebook_meta tiveram a redação transcrita dos
// contratos originais E foram VALIDADOS JURIDICAMENTE em 2026-09-01 (ver
// APROVACAO_JURIDICA_2026_09_01) — logo, NÃO bloqueiam mais a geração por validação
// jurídica (as regras comerciais e de dados do cliente continuam valendo).
//
// SERVIÇOS DE PROPRIEDADE INTELECTUAL (cláusula 9), representados EXPLICITAMENTE:
//   - `google_ads`   → cláusula 9 B1 (Google Ads).
//   - `facebook_meta`→ cláusula 9 B2 (Facebook Business / Meta). É um SERVIÇO próprio,
//                      NÃO o modificador comercial "social_midia".
// "Social Mídia" NÃO é bloco autônomo e NÃO aciona B2: é apenas um MODIFICADOR do Funil
// (acrescenta vídeos/conteúdos ao objeto — ver conteudoContrato.ts). "Garantia" é um
// opt-in separado (ver GARANTIA_VALIDACAO), nunca selecionado por padrão.
const FONTE_PRATA = 'Plano Prata — contrato base original (verbatim)';
const BLOCOS_PRESTACAO: BlocoServico[] = [
  { id: 'funil',        label: 'Funil de Captação de Leads',        resumo: 'Metodologia Funil de Captação de Leads (anúncios, impulsionamento e relatórios).',
    validacao: totalmenteValidado(FONTE_PRATA) },
  { id: 'clinica_top1', label: 'Clínica Top 1 (Google Maps)',       resumo: 'Otimização e posicionamento do perfil no Google Maps.',
    validacao: totalmenteValidado(FONTE_PRATA) },
  { id: 'crc',          label: 'CRC — Relacionamento com o Cliente', resumo: 'Agendamento por CRC com limite mensal de leads.', usaLimiteLeads: true,
    validacao: validadoJuridico('Contrato de CRC (Autentique 8c6317c6…, 12/03/2025)') },
  { id: 'ia',           label: 'Inteligência Artificial (IA)',      resumo: 'Agendamento por IA no WhatsApp.',
    validacao: validadoJuridico('Contrato de IA (Autentique d62fe84a…, 11/11/2025)') },
  { id: 'google_ads',   label: 'Google Ads',                        resumo: 'Funil de captação de leads via Google Ads + Google Business Profile.',
    validacao: validadoJuridico('Google + Site (Autentique bfbbe4f3…, 24/03/2026)') },
  { id: 'site',         label: 'Site Profissional',                 resumo: 'Criação de site profissional otimizado para SEO.',
    validacao: validadoJuridico('Google + Site (Autentique bfbbe4f3…, 24/03/2026)') },
  { id: 'consignado',   label: 'Consignado',                        resumo: 'Facilitação de crédito para pacientes (correspondentes bancários).',
    validacao: validadoJuridico('Consignado (Autentique 498691af…, 02/07/2026)') },
  { id: 'facebook_meta', label: 'Facebook / Meta Ads',              resumo: 'Anúncios pagos no Facebook/Instagram via Gerenciador de Negócios do Facebook (Meta).',
    validacao: validadoJuridico('Facebook Business — cláusula 9 ampliada (Consignado, Autentique 498691af…, 02/07/2026)') },
];

/**
 * Validação da cláusula OPCIONAL de fidelidade (período mínimo 2.2 + multa 8.4/8.5).
 * Fonte transcrita integralmente; validação jurídica PENDENTE → ativar fidelidade
 * bloqueia a GERAÇÃO do PDF (a prévia continua permitida).
 */
export const FIDELIDADE_VALIDACAO: ValidacaoBloco =
  validadoJuridico('Plano Prata c/ social mídia (Autentique 181b7981…, 27/04/2026) — cláusulas 2.2, 8.4, 8.5');

/**
 * Validação da GARANTIA de resultados (cláusula "DA GARANTIA", opt-in separado e nunca
 * padrão). Fonte transcrita integralmente; validação jurídica PENDENTE → ativar garantia
 * bloqueia a GERAÇÃO do PDF. Envolve obrigação financeira (devolução de mensalidades).
 */
export const GARANTIA_VALIDACAO: ValidacaoBloco =
  validadoJuridico('Plano Bronze com GARANTIA (Autentique d7838a6d…, 10/10/2025) — cláusula 10');

/**
 * Cláusula 9 (Propriedade Intelectual) AMPLIADA, por serviço:
 *   - B1: Google Ads (bloco `google_ads`) — fonte google_site.pdf.
 *   - B2: Facebook Business (modificador `social_midia`) — fonte consignado.pdf.
 * Fonte transcrita integralmente; validação jurídica PENDENTE → quando o serviço
 * correspondente entra na composição, a GERAÇÃO do PDF fica bloqueada (prévia liberada).
 * NÃO flipar para 'validado' sem autorização formal do responsável jurídico.
 */
export const PROPRIEDADE_B1_VALIDACAO: ValidacaoBloco =
  validadoJuridico('Google + Site (Autentique bfbbe4f3…, 24/03/2026) — cláusula 9 ampliada (Google Ads)');
export const PROPRIEDADE_B2_VALIDACAO: ValidacaoBloco =
  validadoJuridico('Consignado (Autentique 498691af…, 02/07/2026) — cláusula 9 ampliada (Facebook Business)');

/** True se a cláusula 9 B1 (Google Ads) está liberada (fonte conferida E validação jurídica). */
export function propriedadeB1Liberada(): boolean {
  return validacaoLiberada(PROPRIEDADE_B1_VALIDACAO);
}
/** True se a cláusula 9 B2 (Facebook) está liberada (fonte conferida E validação jurídica). */
export function propriedadeB2Liberada(): boolean {
  return validacaoLiberada(PROPRIEDADE_B2_VALIDACAO);
}

export const MODELOS: ModeloContrato[] = [
  {
    id: 'prestacao_servicos',
    nome: 'Contrato de Prestação de Serviços',
    descricao: 'Contrato modular de marketing digital — a admin escolhe os blocos de serviço.',
    modular: true,
    suportaPF: true,
    suportaPJ: true,
    blocos: BLOCOS_PRESTACAO,
    // BASE VALIDADA (Etapa 3): os textos-base (cabeçalhos PF/PJ, cláusulas-base,
    // pagamento, vencimento, rescisão, propriedade, condições, foro, assinaturas)
    // e os blocos funil + clinica_top1 são verbatim dos contratos originais, então
    // o editor fica disponível. A COMPLETUDE jurídica por contrato continua sendo
    // exigida na geração do PDF: qualquer bloco pendente (CRC, IA, Google+Site,
    // Social Mídia, Consignado) ou a cláusula de fidelidade — enquanto não tiverem
    // redação oficial inserida — BLOQUEIAM o PDF via marcador de pendência.
    conteudoValidado: true,
  },
  // Modelos independentes (Distrato, Acordo, Aditivo, Facilitação de Crédito, Contrato SDR)
  // serão adicionados numa etapa posterior — a arquitetura já os comporta via tipo_modelo.
];

export function getModelo(id: string): ModeloContrato | undefined {
  return MODELOS.find((m) => m.id === id);
}

/** True só se o conteúdo jurídico integral do modelo foi inserido e validado. */
export function modeloConteudoValidado(id: string | null | undefined): boolean {
  return !!(id && getModelo(id)?.conteudoValidado);
}

export function getBloco(modeloId: string, blocoId: string): BlocoServico | undefined {
  return getModelo(modeloId)?.blocos.find((b) => b.id === blocoId);
}

/** True se o bloco está totalmente LIBERADO (fonte conferida E validação jurídica). */
export function blocoLiberado(modeloId: string, blocoId: string): boolean {
  return validacaoLiberada(getBloco(modeloId, blocoId)?.validacao);
}

/** Regra única de liberação: fonte conferida E validação jurídica concluída. */
export function validacaoLiberada(v: ValidacaoBloco | undefined | null): boolean {
  return !!v && v.fonteConferida && v.validacaoJuridica === 'validado';
}

/** Motivo de um bloco/cláusula continuar bloqueando o PDF (ou null se liberado). */
export type MotivoBloqueio = 'fonte' | 'juridica';
export function motivoBloqueio(v: ValidacaoBloco | undefined | null): MotivoBloqueio | null {
  if (!v || !v.fonteConferida) return 'fonte';
  if (v.validacaoJuridica !== 'validado') return 'juridica';
  return null;
}

export interface BlocoPendencia { label: string; motivo: MotivoBloqueio }

/**
 * Blocos SELECIONADOS que ainda bloqueiam a GERAÇÃO do PDF, com o motivo (fonte
 * incompleta vs. validação jurídica pendente). Fonte da verdade do bloqueio —
 * independe do que foi digitado no editor.
 */
export function blocosPendentesGeracao(modeloId: string, blocos: string[]): BlocoPendencia[] {
  const m = getModelo(modeloId);
  if (!m) return blocos.map((label) => ({ label, motivo: 'fonte' as const }));
  const out: BlocoPendencia[] = [];
  for (const id of blocos) {
    const b = m.blocos.find((x) => x.id === id);
    if (!b) { out.push({ label: id, motivo: 'fonte' }); continue; }
    const motivo = motivoBloqueio(b.validacao);
    if (motivo) out.push({ label: b.label, motivo });
  }
  return out;
}

/** True se a cláusula de fidelidade está totalmente liberada (fonte + jurídico). */
export function fidelidadeLiberada(): boolean {
  return validacaoLiberada(FIDELIDADE_VALIDACAO);
}

/** True se a cláusula de garantia está totalmente liberada (fonte + jurídico). */
export function garantiaLiberada(): boolean {
  return validacaoLiberada(GARANTIA_VALIDACAO);
}

/** Metadados enxutos para o front (catálogo de seleção). */
export function catalogoModelos() {
  return MODELOS.map((m) => ({
    id: m.id,
    nome: m.nome,
    descricao: m.descricao,
    modular: m.modular,
    suportaPF: m.suportaPF,
    suportaPJ: m.suportaPJ,
    blocos: m.blocos.map((b) => ({
      id: b.id, label: b.label, resumo: b.resumo, usaLimiteLeads: !!b.usaLimiteLeads,
      fonteConferida: b.validacao.fonteConferida,
      validacaoJuridica: b.validacao.validacaoJuridica,
      liberado: validacaoLiberada(b.validacao),
    })),
  }));
}
