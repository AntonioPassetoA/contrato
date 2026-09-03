import { config } from './config';

const ENDPOINT = 'https://api.autentique.com.br/v2/graphql';

export type DeliveryMethod =
  | 'DELIVERY_METHOD_EMAIL'
  | 'DELIVERY_METHOD_LINK'
  | 'DELIVERY_METHOD_SMS'
  | 'DELIVERY_METHOD_WHATSAPP';

export type SignerAction = 'SIGN' | 'SIGN_AS_A_WITNESS' | 'APPROVE' | 'RECOGNIZE';

/** Verificações de identidade suportadas (SecurityVerificationEnum do Autentique). */
export type SecurityVerification =
  | 'SMS' | 'UPLOAD' | 'LIVE' | 'PF_FACIAL' | 'PF_FACIAL_MATCH'
  | 'MANUAL' | 'BIOMETRIC_AND_TEXT_EXTRACTION' | 'LIVENESS_AND_TEXT_EXTRACTION';

export interface SecurityVerificationInput {
  type: SecurityVerification;
  verify_phone?: string;
  fallback_behavior?: 'DISABLE_FALLBACK';
  max_attempts?: number;
}

export interface SignerInput {
  name?: string;
  email?: string;
  phone?: string;
  delivery_method?: DeliveryMethod;
  action: SignerAction;
  security_verifications?: SecurityVerificationInput[];
}

export interface DocumentInput {
  name: string;
  message?: string;
  refusable?: boolean;
  sortable?: boolean;
}

export interface CreatedSignature {
  public_id: string;
  name: string | null;
  email: string | null;
  action: { name: string } | null;
  link: { short_link: string } | null;
}

export interface CreatedDocument {
  id: string;
  name: string;
  sandbox?: boolean;
  signatures: CreatedSignature[];
}

class AutentiqueError extends Error {}

/**
 * Guarda de ambiente: em teste/desenvolvimento (config.autentiqueOffline) NENHUMA
 * requisição de rede à Autentique é permitida. Lançamos ANTES de qualquer `fetch`,
 * de modo que suíte de testes, build local, typecheck e geração local de PDF nunca
 * alcancem a rede. Em produção o guard fica inativo (comportamento controlado).
 */
function assertOnline(operacao: string): void {
  if (config.autentiqueOffline) {
    throw new AutentiqueError(
      `Autentique OFFLINE: chamada externa bloqueada neste ambiente (${operacao}). ` +
      'Defina AUTENTIQUE_OFFLINE=0 e rode em produção para habilitar chamadas reais.',
    );
  }
}

/** Executa uma query/mutation GraphQL simples (sem upload de arquivo). */
export async function gql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  assertOnline('gql');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.autentiqueToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => null) as any;
  if (!res.ok || !json) {
    throw new AutentiqueError(`Autentique HTTP ${res.status}`);
  }
  if (json.errors?.length) {
    throw new AutentiqueError(json.errors.map((e: any) => e.message).join(' | '));
  }
  return json.data as T;
}

const CREATE_DOCUMENT_MUTATION = `
  mutation CreateDocument($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!, $sandbox: Boolean) {
    createDocument(document: $document, signers: $signers, file: $file, sandbox: $sandbox) {
      id
      name
      sandbox
      signatures {
        public_id
        name
        email
        action { name }
        link { short_link }
      }
    }
  }
`;

/**
 * Cria um documento no Autentique enviando o PDF montado (upload multipart,
 * conforme a spec de GraphQL multipart request).
 */
export async function createDocumentWithFile(params: {
  document: DocumentInput;
  signers: SignerInput[];
  fileBuffer: Buffer;
  filename: string;
}): Promise<CreatedDocument> {
  assertOnline('createDocumentWithFile');
  const { document, signers, fileBuffer, filename } = params;

  const operations = {
    query: CREATE_DOCUMENT_MUTATION,
    variables: { document, signers, file: null, sandbox: config.autentiqueSandbox },
  };
  const map = { '0': ['variables.file'] };

  const form = new FormData();
  form.append('operations', JSON.stringify(operations));
  form.append('map', JSON.stringify(map));
  form.append(
    '0',
    new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' }),
    filename
  );

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.autentiqueToken}` },
    body: form,
  });
  const json = await res.json().catch(() => null) as any;
  if (!res.ok || !json) {
    throw new AutentiqueError(`Autentique HTTP ${res.status} ao criar documento`);
  }
  if (json.errors?.length) {
    throw new AutentiqueError(json.errors.map((e: any) => e.message).join(' | '));
  }
  return json.data.createDocument as CreatedDocument;
}

/** Gera (ou recupera) o link público de assinatura de um signatário. */
export async function createLinkToSignature(publicId: string): Promise<string | null> {
  const data = await gql<{ createLinkToSignature: { short_link: string } }>(
    `mutation ($public_id: UUID!) { createLinkToSignature(public_id: $public_id) { short_link } }`,
    { public_id: publicId }
  );
  return data?.createLinkToSignature?.short_link ?? null;
}

/** Busca um documento para checar status das assinaturas. */
export async function getDocument(id: string) {
  const data = await gql<{ document: any }>(
    `query ($id: UUID!) {
      document(id: $id) {
        id
        name
        signatures {
          public_id
          email
          signed { created_at }
          rejected { created_at }
        }
      }
    }`,
    { id }
  );
  return data.document;
}

/** Confirma que o token é válido e retorna o usuário. */
export async function me() {
  const data = await gql<{ me: { id: string; name: string; email: string } }>(
    `query { me { id name email } }`
  );
  return data.me;
}
