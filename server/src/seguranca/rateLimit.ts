// Rate limiting simples por IP (janela deslizante, em memória). Sem dependências.
// Protege as rotas públicas contra abuso. Respostas genéricas, sem dados pessoais.

import type { Request, Response, NextFunction } from 'express';

interface Balde { hits: number[]; }

export function criarRateLimit(opts: { janelaMs: number; max: number }) {
  const baldes = new Map<string, Balde>();

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    const agora = Date.now();
    const inicio = agora - opts.janelaMs;
    const ip = (req.ip || req.socket?.remoteAddress || 'desconhecido').toString();

    let b = baldes.get(ip);
    if (!b) { b = { hits: [] }; baldes.set(ip, b); }
    // Descarta hits fora da janela.
    b.hits = b.hits.filter((t) => t > inicio);

    if (b.hits.length >= opts.max) {
      const retry = Math.ceil((b.hits[0] + opts.janelaMs - agora) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retry)));
      return res.status(429).json({ error: 'rate_limited' });
    }
    b.hits.push(agora);

    // Limpeza oportunista para não crescer indefinidamente.
    if (baldes.size > 5000) {
      for (const [k, v] of baldes) {
        v.hits = v.hits.filter((t) => t > inicio);
        if (v.hits.length === 0) baldes.delete(k);
      }
    }
    next();
  };
}
