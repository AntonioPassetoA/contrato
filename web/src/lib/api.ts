export interface CampoDef {
  name: string;
  label: string;
  type: 'text' | 'cpf' | 'cnpj' | 'phone' | 'cep' | 'email' | 'select' | 'uf';
  required: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  group?: string;
  colSpan?: 1 | 2;
}

/** Resposta do formulário público — só o necessário para montar o form + nome da clínica. */
export interface FormularioPublico {
  clinicaNome: string;
  tipoPessoa: 'pf' | 'pj';
  campos: CampoDef[];
  privacidadeUrl: string;
}

/** Conteúdo (cláusulas) do contrato. */
export interface Clausula { id: string; titulo: string; texto: string }
export interface ConteudoContrato { titulo: string; clausulas: Clausula[] }
export interface ConteudoAtual {
  disponivel: boolean;
  aviso?: string;
  versao: number; origem: string; personalizado: boolean; persistido: boolean; conteudo: ConteudoContrato;
}
export interface VersaoResumo {
  id: number; versao: number; origem: string; personalizado: boolean;
  nota: string | null; criado_por: number | null; created_at: string;
}
export interface VersaoCompleta extends VersaoResumo { conteudo: ConteudoContrato }

/** Dados enviados pelo cliente, para a Manu revisar. */
export interface DadosCliente {
  tipo_pessoa: 'pf' | 'pj' | null;
  campos: CampoDef[];
  valores: Record<string, string>;
}

export type UserRole = 'admin' | 'vendedor';

export interface AdminUser {
  id: number;
  nome: string;
  email: string;
  role: UserRole;
  ativo: number;
  must_change_password?: number;
  created_at: string;
  last_login_at: string | null;
}

/** Visão do vendedor sobre uma solicitação (sem valores/blocos/condições). */
export interface SolicitacaoVendedor {
  id: number;
  clinica_nome: string;
  status: string;
  link: string | null;
  assinado: boolean;
  created_at: string;
  updated_at: string | null;
}

/** Visão da admin — completa. */
export interface ContratoAdmin {
  id: number;
  clinica_nome: string;
  vendedor_id: number;
  vendedor_nome: string | null;
  status: string;
  tipo_modelo: string | null;
  tipo_pessoa: 'pf' | 'pj' | null;
  valor_centavos: number | null;
  dia_vencimento: number | null;
  short_link: string | null;
  created_at: string;
  updated_at: string | null;
}

/** Catálogo de modelos/blocos (para a admin montar o contrato). */
export interface BlocoCatalogo {
  id: string;
  label: string;
  resumo: string;
  usaLimiteLeads: boolean;
  /** Redação transcrita integralmente do documento original (conferência documental). */
  fonteConferida: boolean;
  /** Aprovação jurídica do texto. */
  validacaoJuridica: 'pendente' | 'validado';
  /** Totalmente liberado (fonte conferida E validação jurídica). Se false, bloqueia o PDF. */
  liberado: boolean;
}
export interface ModeloCatalogo {
  id: string;
  nome: string;
  descricao: string;
  modular: boolean;
  suportaPF: boolean;
  suportaPJ: boolean;
  blocos: BlocoCatalogo[];
}

/** Visão de configuração de um contrato para a admin. */
export interface ContratoConfig {
  id: number;
  clinica_nome: string;
  vendedor_id: number;
  vendedor_nome: string | null;
  status: string;
  tipo_modelo: string | null;
  tipo_pessoa: 'pf' | 'pj' | null;
  blocos: string[];
  fidelidade: { ativo: boolean; meses: number | null };
  social_midia: boolean;
  garantia: { ativo: boolean; investimentoCentavos: number | null; periodoMeses: number | null };
  valor_centavos: number | null;
  dia_vencimento: number | null;
  limite_leads: number | null;
  cidade_assinatura: string;
  data_assinatura: string;
  token: string | null;
  link: string | null;
  personalizado: boolean;
  configurado: boolean;
  pendencias_contrato: string[];
  empresa_completa: boolean;
  pendencias_empresa: string[];
  created_at: string;
  updated_at: string | null;
}

export interface ConfigContratoPayload {
  tipoModelo: string;
  tipoPessoa: 'pf' | 'pj';
  blocos: string[];
  socialMidia?: boolean;
  fidelidadeAtiva: boolean;
  fidelidadeMeses?: number | null;
  garantiaAtiva?: boolean;
  garantiaInvestimentoCentavos?: number | null;
  garantiaPeriodoMeses?: number | null;
  confirmarGarantia?: boolean;
  valorCentavos: number;
  diaVencimento: number;
  limiteLeads?: number | null;
  cidadeAssinatura: string;
  dataAssinatura: string;
  confirmarAlteracaoBlocos?: boolean;
  confirmarAlteracaoComLink?: boolean;
}

/** Resumo de um PDF gerado (sem PII, sem caminho do arquivo). */
export interface PdfResumo {
  id: number; versaoPdf: number; conteudoVersao: number | null;
  hashConteudo: string; hashArquivo: string; tamanho: number;
  status: string; geradoPor: number | null; createdAt: string; substituidoAt: string | null;
}

/** Prévia integral do contrato (mesmo HTML do PDF) + pendências + versão. */
export interface PreviewContrato {
  pronto: boolean;
  pendencias: string[];
  versao: number; origem: string; personalizado: boolean;
  html: string;
  pdf: PdfResumo | null;
  temPdfSubstituido: boolean;
}

export interface AuditoriaItem {
  id: number;
  contrato_id: number | null;
  usuario_id: number | null;
  acao: string;
  campo: string | null;
  valor_antes: string | null;
  valor_depois: string | null;
  created_at: string;
}

/** Configuração centralizada da empresa (CONTRATADA + testemunhas). */
export interface RepresentanteContratada {
  nome: string;
  nacionalidade?: string;
  estado_civil?: string;
  profissao?: string;
  rg?: string;
  cpf: string;
  endereco?: string;
}
export interface Contratada {
  razao_social: string;
  cnpj: string;
  endereco: string;
  email?: string;
  representantes: RepresentanteContratada[];
}
export interface Testemunha { nome: string; cpf: string }
export interface EmpresaConfig {
  contratada: Contratada | null;
  testemunhas: Testemunha[];
  pendencias: string[];
  completa: boolean;
  privacidadeUrl?: string;
}

class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, message: string, data: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('application/json') ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.error || `Erro ${res.status}`, body);
  }
  return body as T;
}

export const api = {
  ApiError,

  // ----- Admin -----
  adminLogin: (email: string, password: string) =>
    req<{ ok: true; user: AdminUser; mustChangePassword: boolean }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  adminLogout: () => req<{ ok: true }>('/api/admin/logout', { method: 'POST' }),
  adminMe: () => req<{ ok: true; user: AdminUser }>('/api/admin/me'),
  trocarSenha: (senhaAtual: string, novaSenha: string) =>
    req<{ ok: true }>('/api/admin/change-password', {
      method: 'POST',
      body: JSON.stringify({ senhaAtual, novaSenha }),
    }),

  // ----- Solicitações / Contratos (papel decide a visão no back) -----
  criarSolicitacao: (clinicaNome: string) =>
    req<{ contrato: SolicitacaoVendedor }>('/api/contratos/solicitacoes', {
      method: 'POST',
      body: JSON.stringify({ clinicaNome }),
    }),
  // Vendedor recebe SolicitacaoVendedor[]; admin recebe ContratoAdmin[]
  getSolicitacoes: <T = SolicitacaoVendedor[] | ContratoAdmin[]>() =>
    req<{ contratos: T }>('/api/contratos'),

  // ----- Configuração do contrato (só admin) -----
  getModelos: () => req<{ modelos: ModeloCatalogo[] }>('/api/contratos/modelos'),
  getContratoConfig: (id: number) => req<{ config: ContratoConfig }>(`/api/contratos/${id}/config`),
  salvarContratoConfig: (id: number, payload: ConfigContratoPayload) =>
    req<{ config: ContratoConfig }>(`/api/contratos/${id}/config`, {
      method: 'PUT', body: JSON.stringify(payload),
    }),
  liberarLink: (id: number) =>
    req<{ config: ContratoConfig }>(`/api/contratos/${id}/liberar-link`, { method: 'POST' }),
  getAuditoria: (id: number) => req<{ auditoria: AuditoriaItem[] }>(`/api/contratos/${id}/auditoria`),
  getDadosCliente: (id: number) => req<{ dados: DadosCliente | null }>(`/api/contratos/${id}/dados-cliente`),
  editarDadosCliente: (id: number, form: Record<string, string>, confirmar: boolean) =>
    req<{ dados: DadosCliente }>(`/api/contratos/${id}/dados-cliente`, {
      method: 'PUT', body: JSON.stringify({ form, confirmar }),
    }),
  reabrirFormulario: (id: number) =>
    req<{ config: ContratoConfig }>(`/api/contratos/${id}/reabrir`, { method: 'POST' }),

  // ----- Conteúdo / versões do contrato (só admin) -----
  getConteudo: (id: number) => req<{ conteudo: ConteudoAtual }>(`/api/contratos/${id}/conteudo`),
  salvarConteudo: (id: number, clausulas: Clausula[], confirmar: boolean, nota?: string) =>
    req<{ versao: VersaoCompleta }>(`/api/contratos/${id}/conteudo`, {
      method: 'PUT', body: JSON.stringify({ clausulas, confirmar, nota }),
    }),
  getVersoes: (id: number) => req<{ versoes: VersaoResumo[] }>(`/api/contratos/${id}/versoes`),
  getVersao: (id: number, versao: number) => req<{ versao: VersaoCompleta }>(`/api/contratos/${id}/versoes/${versao}`),
  restaurarVersao: (id: number, versao: number, confirmar: boolean) =>
    req<{ versao: VersaoCompleta }>(`/api/contratos/${id}/versoes/${versao}/restaurar`, {
      method: 'POST', body: JSON.stringify({ confirmar }),
    }),

  // ----- Prévia + geração/versionamento de PDF (só admin) -----
  getPreview: (id: number) => req<{ preview: PreviewContrato }>(`/api/contratos/${id}/preview`),
  gerarPdf: (id: number, confirmar: boolean) =>
    req<{ pdf: PdfResumo }>(`/api/contratos/${id}/gerar-pdf`, {
      method: 'POST', body: JSON.stringify({ confirmar }),
    }),
  getPdfs: (id: number) => req<{ pdfs: PdfResumo[] }>(`/api/contratos/${id}/pdfs`),
  /** URL do PDF para abrir/baixar (o cookie de sessão vai junto). */
  pdfUrl: (id: number, pdfId?: number) =>
    `/api/contratos/${id}/pdf${pdfId != null ? `?pdfId=${pdfId}` : ''}`,

  // ----- Configuração da empresa (só admin) -----
  getEmpresa: () => req<EmpresaConfig>('/api/config/empresa'),
  salvarContratada: (contratada: Contratada) =>
    req<EmpresaConfig>('/api/config/empresa/contratada', {
      method: 'PUT', body: JSON.stringify(contratada),
    }),
  salvarTestemunhas: (testemunhas: Testemunha[]) =>
    req<EmpresaConfig>('/api/config/empresa/testemunhas', {
      method: 'PUT', body: JSON.stringify({ testemunhas }),
    }),
  salvarPrivacidadeUrl: (url: string) =>
    req<{ ok: true; privacidadeUrl: string }>('/api/config/empresa/privacidade', {
      method: 'PUT', body: JSON.stringify({ url }),
    }),

  // Usuários (só admin)
  getUsuarios: () => req<{ users: AdminUser[] }>('/api/admin/users'),
  criarUsuario: (payload: { nome: string; email: string; senha: string; role: UserRole }) =>
    req<{ user: AdminUser }>('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  atualizarUsuario: (id: number, payload: { nome?: string; senha?: string; role?: UserRole; ativo?: boolean }) =>
    req<{ user: AdminUser }>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  removerUsuario: (id: number) =>
    req<{ ok: true }>(`/api/admin/users/${id}`, { method: 'DELETE' }),

  // ----- Público (cliente) -----
  abrirFormularioPublico: (token: string) =>
    req<FormularioPublico | { jaPreenchido: true; clinicaNome: string }>(`/api/public/contrato/${token}`),
  enviarFormularioPublico: (token: string, form: Record<string, string>) =>
    req<{ ok: true }>(`/api/public/contrato/${token}`, {
      method: 'POST',
      body: JSON.stringify({ form }),
    }),
};
