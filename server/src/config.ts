import { resolve } from 'node:path';
import dotenv from 'dotenv';

// Carrega o .env da raiz do projeto (um nível acima de /server)
dotenv.config({ path: resolve(import.meta.dirname, '../../.env') });

function req(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name} (verifique o arquivo .env)`);
  }
  return v.trim();
}

function opt(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

/** Validação simples de e-mail (formato local@dominio.tld). */
export function ehEmailValido(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * Resolve o e-mail do super-admin inicial SEM e-mail realista embutido no código.
 *   - Produção: ADMIN_EMAIL é OBRIGATÓRIO e válido; ausência/invalidez faz FALHA SEGURA
 *     (erro genérico, sem revelar configurações sensíveis) para impedir a inicialização.
 *   - Desenvolvimento/testes: usa ADMIN_EMAIL se válido; senão, um placeholder example.com.
 * Função pura (recebe o ambiente) para ser testável sem variáveis globais.
 */
export function resolveAdminEmail(env: string, rawAdminEmail: string | undefined): string {
  const raw = (rawAdminEmail ?? '').trim().toLowerCase();
  if (env === 'production') {
    if (!raw || !ehEmailValido(raw)) {
      // Mensagem GENÉRICA de propósito: não expõe o nome da variável nem valores.
      throw new Error('Configuração administrativa inválida. A inicialização foi interrompida.');
    }
    return raw;
  }
  return raw && ehEmailValido(raw) ? raw : 'admin@example.com';
}

// Serviço de e-mail (Opção A: enviar ao cliente o link de assinatura por e-mail).
// Vazio = inerte (nenhum e-mail é enviado). Preencher só após definição do serviço.
const smtpHost = opt('SMTP_HOST', '');
const smtpUser = opt('SMTP_USER', '');
const smtpPass = opt('SMTP_PASS', '');
const mailFrom = opt('MAIL_FROM', '');

const nodeEnv = opt('NODE_ENV', 'development');

// Bloqueio explícito de chamadas externas à Autentique (me/create/get/link/webhook).
// Regra: em PRODUÇÃO fica ONLINE (comportamento controlado preservado); em teste e
// desenvolvimento local fica OFFLINE por padrão — impede me()/create/get durante a
// suíte, o build, o typecheck e no startup do servidor local. Pode ser forçado nos dois
// sentidos por AUTENTIQUE_OFFLINE (1/true = offline; 0/false = online).
const _offlineFlag = opt('AUTENTIQUE_OFFLINE', '').toLowerCase();
const autentiqueOffline = _offlineFlag
  ? ['1', 'true', 'yes'].includes(_offlineFlag)
  : nodeEnv !== 'production';

// Confiança em proxy reverso (hospedagem). Define de quantos "saltos" confiar para
// obter o IP real do cliente (X-Forwarded-For) SEM confiar em cabeçalho arbitrário.
//   vazio/0/false -> não confia (dev, sem proxy)
//   1 (ou nº)     -> confia em N proxies à frente (produção típica: 1)
//   'true'        -> confia em todos (NÃO recomendado)
function parseTrustProxy(v: string): number | boolean {
  const t = v.trim().toLowerCase();
  if (t === '' || t === 'false' || t === '0') return false;
  if (t === 'true') return true;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : false;
}

export const config = {
  port: Number(opt('PORT', '3333')),
  publicBaseUrl: opt('PUBLIC_BASE_URL', 'http://localhost:3333').replace(/\/+$/, ''),
  nodeEnv,
  isProduction: nodeEnv === 'production',
  // Chave de criptografia dos dados pessoais (form_data). Só por variável de ambiente,
  // NUNCA no Git. Ausência/invalidez bloqueia o acesso a PII em produção.
  dataEncryptionKey: opt('DATA_ENCRYPTION_KEY', ''),
  // Aviso de privacidade no formulário público — link configurável (fallback via env).
  privacyPolicyUrl: opt('PRIVACY_POLICY_URL', ''),
  // Nº de proxies confiáveis à frente (rate limit usa o IP real do cliente).
  trustProxy: parseTrustProxy(opt('TRUST_PROXY', '')),
  smtpHost,
  smtpPort: Number(opt('SMTP_PORT', '587')),
  smtpUser,
  smtpPass,
  mailFrom,
  emailConfigurado: !!(smtpHost && smtpUser && smtpPass && mailFrom),
  autentiqueToken: req('AUTENTIQUE_TOKEN'),
  autentiqueSandbox: opt('AUTENTIQUE_SANDBOX', 'true').toLowerCase() === 'true',
  // OFFLINE: nenhuma requisição de rede à Autentique é permitida (teste/dev).
  autentiqueOffline,
  autentiqueWebhookSecret: opt('AUTENTIQUE_WEBHOOK_SECRET', ''),
  // Modo de teste seguro: com sandbox ligado, os signatários fixos são
  // redirecionados para este e-mail (usando +tags), sem notificar os reais.
  testSignerEmail: opt('TEST_SIGNER_EMAIL', ''),
  // Super-admin inicial: criado automaticamente na primeira execução se não houver
  // nenhum usuário. SEM e-mail realista no código — em produção, ADMIN_EMAIL é
  // obrigatório (falha segura se ausente/inválido); em dev/testes, usa example.com.
  adminEmail: resolveAdminEmail(nodeEnv, process.env.ADMIN_EMAIL),
  adminNome: opt('ADMIN_NOME', 'Administrador'),
  adminPassword: req('ADMIN_PASSWORD'),
  sessionSecret: req('SESSION_SECRET'),
  linkExpirationDays: Number(opt('LINK_EXPIRATION_DAYS', '7')),
};

export type AppConfig = typeof config;
