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

export interface CampoAdmin {
  name: string;
  label: string;
  type: 'valor' | 'dia' | 'text';
  required: boolean;
  help?: string;
}

export interface TemplateResumo {
  id: string;
  nome: string;
  descricao: string;
  suportaPF: boolean;
  suportaPJ: boolean;
  camposAdmin: CampoAdmin[];
}

export interface PublicForm {
  token: string;
  template: { id: string; nome: string; descricao: string; suportaPF: boolean; suportaPJ: boolean };
  campos: { pf: CampoDef[] | null; pj: CampoDef[] | null };
}

export interface Contrato {
  id: number;
  token: string;
  template_nome: string;
  cliente_label: string | null;
  valor_centavos: number | null;
  dia_vencimento: number | null;
  status: string;
  tipo_pessoa: 'pf' | 'pj' | null;
  short_link: string | null;
  autentique_document_id: string | null;
  sandbox: number;
  expires_at: string | null;
  created_at: string;
  submitted_at: string | null;
  signed_at: string | null;
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
  adminLogin: (password: string) =>
    req<{ ok: true }>('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) }),
  adminLogout: () => req<{ ok: true }>('/api/admin/logout', { method: 'POST' }),
  adminMe: () => req<{ ok: true }>('/api/admin/me'),
  getTemplates: () => req<{ templates: TemplateResumo[] }>('/api/admin/templates'),
  criarLink: (payload: {
    templateId: string;
    clienteLabel?: string;
    valorReais?: string;
    diaVencimento?: number;
    expiraEmDias?: number;
  }) => req<{ id: number; token: string; url: string; expiresAt: string }>('/api/admin/links', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getContratos: () => req<{ contracts: Contrato[] }>('/api/admin/contracts'),
  refreshContrato: (id: number) =>
    req<{ status: string }>(`/api/admin/contracts/${id}/refresh`, { method: 'POST' }),
  pdfUrl: (id: number) => `/api/admin/contracts/${id}/pdf`,

  // ----- Público -----
  getPublicForm: (token: string) => req<PublicForm>(`/api/public/form/${token}`),
  submit: (token: string, tipoPessoa: 'pf' | 'pj', form: Record<string, string>) =>
    req<{ ok: true; shortLink: string; documentId: string }>(`/api/public/submit/${token}`, {
      method: 'POST',
      body: JSON.stringify({ tipoPessoa, form }),
    }),
};
