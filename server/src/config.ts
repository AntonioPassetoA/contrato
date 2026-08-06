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

export const config = {
  port: Number(opt('PORT', '3333')),
  publicBaseUrl: opt('PUBLIC_BASE_URL', 'http://localhost:3333').replace(/\/+$/, ''),
  autentiqueToken: req('AUTENTIQUE_TOKEN'),
  autentiqueSandbox: opt('AUTENTIQUE_SANDBOX', 'true').toLowerCase() === 'true',
  autentiqueWebhookSecret: opt('AUTENTIQUE_WEBHOOK_SECRET', ''),
  // Modo de teste seguro: com sandbox ligado, os signatários fixos são
  // redirecionados para este e-mail (usando +tags), sem notificar os reais.
  testSignerEmail: opt('TEST_SIGNER_EMAIL', ''),
  adminPassword: req('ADMIN_PASSWORD'),
  sessionSecret: req('SESSION_SECRET'),
  linkExpirationDays: Number(opt('LINK_EXPIRATION_DAYS', '7')),
};

export type AppConfig = typeof config;
