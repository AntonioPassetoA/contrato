export type TipoPessoa = 'pf' | 'pj';

export type CampoTipo =
  | 'text'
  | 'cpf'
  | 'cnpj'
  | 'phone'
  | 'cep'
  | 'email'
  | 'select'
  | 'uf';

export interface CampoDef {
  name: string;
  label: string;
  type: CampoTipo;
  required: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Título do grupo visual no formulário (ex.: "Endereço da sede"). */
  group?: string;
  /** Largura no grid (1 = metade, 2 = linha inteira). Default 1. */
  colSpan?: 1 | 2;
  /** Se preenchido por CEP (ViaCEP), quais chaves esse campo alimenta. */
  cepTarget?: boolean;
}

export interface SignatarioFixo {
  name: string;
  email: string;
  action: 'SIGN' | 'SIGN_AS_A_WITNESS';
}

export interface CampoAdmin {
  name: string;
  label: string;
  type: 'valor' | 'dia' | 'text';
  required: boolean;
  help?: string;
}

export interface RenderInput {
  tipoPessoa: TipoPessoa;
  form: Record<string, string>;
  admin: { valorCentavos?: number | null; diaVencimento?: number | null; [k: string]: unknown };
  dataAssinatura: Date;
}

export interface TemplateDef {
  id: string;
  nome: string;
  descricao: string;
  suportaPF: boolean;
  suportaPJ: boolean;
  /** Campos preenchidos pelo ADMIN ao gerar o link. */
  camposAdmin: CampoAdmin[];
  /** Campos do formulário do cliente, dependentes do tipo de pessoa. */
  campos: (tipo: TipoPessoa) => CampoDef[];
  /** Nome do documento no Autentique. */
  documentName: (input: RenderInput) => string;
  /** Signatários fixos (além do cliente). */
  signatariosFixos: SignatarioFixo[];
  /** Gera o HTML completo do contrato para virar PDF. */
  render: (input: RenderInput) => string;
}
