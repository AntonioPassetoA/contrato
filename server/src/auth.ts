import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config';

const COOKIE_NAME = 'admin_session';
const MAX_AGE_MS = 1000 * 60 * 60 * 12; // 12h

function sign(payload: string): string {
  return crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('hex');
}

/** Cria um token de sessão assinado (payload = timestamp de expiração). */
export function createSessionToken(): string {
  const exp = String(Date.now() + MAX_AGE_MS);
  return `${exp}.${sign(exp)}`;
}

function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [exp, mac] = token.split('.');
  if (!exp || !mac) return false;
  const expected = sign(exp);
  // comparação em tempo constante
  if (mac.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  return Number(exp) > Date.now();
}

export function setSessionCookie(res: Response) {
  res.cookie(COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.publicBaseUrl.startsWith('https://'),
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/** Verifica a senha do admin em tempo constante. */
export function checkPassword(password: string): boolean {
  const a = Buffer.from(String(password || ''));
  const b = Buffer.from(config.adminPassword);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Middleware que protege rotas do admin. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];
  if (verifySessionToken(token)) return next();
  res.status(401).json({ error: 'Não autenticado' });
}
