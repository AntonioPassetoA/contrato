// Criptografia dos dados pessoais gravados em `form_data` (AES-256-GCM).
//
// - A chave vem SOMENTE de DATA_ENCRYPTION_KEY (variável de ambiente, nunca no Git).
// - Apenas o back-end criptografa/descriptografa.
// - Em PRODUÇÃO, a ausência/invalidez da chave BLOQUEIA o acesso aos dados pessoais.
// - Em desenvolvimento/teste, sem a variável, deriva uma chave efêmera do SESSION_SECRET
//   (com aviso) só para não travar o ambiente local. Testes definem sua própria chave.

import crypto from 'node:crypto';
import { config } from '../config';

const PREFIXO = 'enc:v1:';
const SALT = 'contrato-pii-v1'; // salt fixo do scrypt (a força vem da chave secreta)

/** Erro dedicado — nunca inclui dados pessoais na mensagem. */
export class PiiError extends Error {}

let avisouDev = false;

function derivarChave(): Buffer {
  const raw = (config.dataEncryptionKey || '').trim();
  if (raw) return crypto.scryptSync(raw, SALT, 32);
  if (config.isProduction) {
    throw new PiiError('DATA_ENCRYPTION_KEY ausente — acesso a dados pessoais bloqueado em produção.');
  }
  if (!avisouDev) {
    console.warn('[pii] DATA_ENCRYPTION_KEY ausente — usando chave de desenvolvimento efêmera (NÃO usar em produção).');
    avisouDev = true;
  }
  return crypto.scryptSync('dev:' + config.sessionSecret, SALT, 32);
}

/** Criptografa um objeto para string opaca. Sempre usada antes de gravar PII. */
export function encryptJSON(obj: unknown): string {
  const chave = derivarChave();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', chave, iv);
  const texto = Buffer.from(JSON.stringify(obj ?? {}), 'utf8');
  const enc = Buffer.concat([cipher.update(texto), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIXO + Buffer.concat([iv, tag, enc]).toString('base64');
}

/** True se o valor está no formato criptografado. */
export function isEncrypted(valor: string | null | undefined): boolean {
  return typeof valor === 'string' && valor.startsWith(PREFIXO);
}

/**
 * Descriptografa. Aceita legado em texto aberto (JSON puro) apenas fora de produção,
 * para migração suave. Em produção, dado não-criptografado é rejeitado.
 */
export function decryptJSON<T = Record<string, unknown>>(valor: string | null | undefined): T {
  if (valor == null || valor === '') return {} as T;
  if (!isEncrypted(valor)) {
    if (config.isProduction) throw new PiiError('Dado pessoal não está criptografado.');
    try { return JSON.parse(valor) as T; } catch { return {} as T; }
  }
  const chave = derivarChave();
  const bruto = Buffer.from(valor.slice(PREFIXO.length), 'base64');
  const iv = bruto.subarray(0, 12);
  const tag = bruto.subarray(12, 28);
  const enc = bruto.subarray(28);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', chave, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString('utf8')) as T;
  } catch {
    // Chave inválida ou dado adulterado — nunca vaza detalhe/PII.
    throw new PiiError('Não foi possível descriptografar os dados pessoais (chave inválida?).');
  }
}
