import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config';
import { getUsuarioPorId, type UserPublic } from './users';

const COOKIE_NAME = 'admin_session';
const MAX_AGE_MS = 1000 * 60 * 60 * 12; // 12h

/** Request com o usuário autenticado anexado pelo middleware. */
export interface AuthedRequest extends Request {
  user?: UserPublic;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('hex');
}

/** Cria um token de sessão assinado. Payload = "userId.expiração". */
export function createSessionToken(userId: number): string {
  const exp = String(Date.now() + MAX_AGE_MS);
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

/** Valida o token e devolve o userId, ou null se inválido/expirado. */
function parseSessionToken(token: string | undefined): number | null {
  if (!token) return null;
  const [userId, exp, mac] = token.split('.');
  if (!userId || !exp || !mac) return null;
  const expected = sign(`${userId}.${exp}`);
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  if (Number(exp) <= Date.now()) return null;
  return Number(userId);
}

export function setSessionCookie(res: Response, userId: number) {
  res.cookie(COOKIE_NAME, createSessionToken(userId), {
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

/** Middleware: exige um usuário logado e ativo (admin OU vendedor). Anexa req.user. */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const userId = parseSessionToken(req.cookies?.[COOKIE_NAME]);
  if (userId == null) return res.status(401).json({ error: 'Não autenticado' });

  const user = getUsuarioPorId(userId);
  if (!user || !user.ativo) return res.status(401).json({ error: 'Não autenticado' });

  const { senha_hash, ...pub } = user;
  req.user = pub;
  next();
}

/**
 * Middleware: usuário logado E com senha já trocada.
 * Enquanto `must_change_password = 1`, bloqueia TODAS as rotas protegidas
 * (mesmo acesso direto pela API) — só liberam /me, troca de senha e logout,
 * que usam `requireAuth`.
 */
export function requireSenhaTrocada(req: AuthedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.user?.must_change_password) {
      return res.status(403).json({
        error: 'Troque sua senha temporária antes de continuar.',
        code: 'senha_temporaria',
      });
    }
    next();
  });
}

/** Middleware: exige que o usuário logado seja ADMINISTRADOR (a Manu) e com senha trocada. */
export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  requireSenhaTrocada(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito ao administrador' });
    }
    next();
  });
}
