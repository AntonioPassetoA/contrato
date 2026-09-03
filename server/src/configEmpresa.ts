// Configuração administrativa CENTRALIZADA da CONTRATADA e das testemunhas.
//
// Fica em config_admin (chave/valor JSON). Começa VAZIA (pendente): a admin precisa
// preencher antes de liberar qualquer link. Enquanto estiver incompleta, a liberação
// do link é bloqueada. NÃO semear com valores antigos — devem ser confirmados pela Manu.

import { db } from './db';
import { config } from './config';
import { logAudit } from './audit';

const CHAVE_CONTRATADA = 'contratada';
const CHAVE_TESTEMUNHAS = 'testemunhas';
const CHAVE_PRIVACIDADE = 'privacidade';

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

export interface Testemunha {
  nome: string;
  cpf: string;
}

export interface ConfigEmpresa {
  contratada: Contratada | null;
  testemunhas: Testemunha[];
}

function lerJson<T>(chave: string): T | null {
  const row = db.prepare(`SELECT valor FROM config_admin WHERE chave = ?`).get(chave) as { valor: string } | undefined;
  if (!row?.valor) return null;
  try { return JSON.parse(row.valor) as T; } catch { return null; }
}

function gravarJson(chave: string, valor: unknown): void {
  db.prepare(`
    INSERT INTO config_admin (chave, valor, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at
  `).run(chave, JSON.stringify(valor), new Date().toISOString());
}

export function getConfigEmpresa(): ConfigEmpresa {
  return {
    contratada: lerJson<Contratada>(CHAVE_CONTRATADA),
    testemunhas: lerJson<Testemunha[]>(CHAVE_TESTEMUNHAS) ?? [],
  };
}

/** Verdadeiro só se CONTRATADA e testemunhas estiverem completas o bastante para emitir. */
export function empresaCompleta(cfg: ConfigEmpresa = getConfigEmpresa()): boolean {
  return pendenciasEmpresa(cfg).length === 0;
}

/** Lista legível de pendências (para mostrar à admin e bloquear a liberação). */
export function pendenciasEmpresa(cfg: ConfigEmpresa = getConfigEmpresa()): string[] {
  const p: string[] = [];
  const c = cfg.contratada;
  if (!c) {
    p.push('CONTRATADA não configurada.');
  } else {
    if (!c.razao_social?.trim()) p.push('Razão social da CONTRATADA.');
    if (!c.cnpj?.trim()) p.push('CNPJ da CONTRATADA.');
    if (!c.endereco?.trim()) p.push('Endereço da CONTRATADA.');
    const reps = (c.representantes ?? []).filter((r) => r.nome?.trim() && r.cpf?.trim());
    if (reps.length === 0) p.push('Ao menos um representante da CONTRATADA (nome + CPF).');
  }
  const test = (cfg.testemunhas ?? []).filter((t) => t.nome?.trim() && t.cpf?.trim());
  if (test.length < 2) p.push('Duas testemunhas (nome + CPF).');
  return p;
}

export function salvarContratada(adminId: number, contratada: Contratada): void {
  const antes = lerJson<Contratada>(CHAVE_CONTRATADA);
  gravarJson(CHAVE_CONTRATADA, contratada);
  logAudit(null, adminId, 'config_contratada_atualizada', CHAVE_CONTRATADA, antes, contratada);
}

export function salvarTestemunhas(adminId: number, testemunhas: Testemunha[]): void {
  const antes = lerJson<Testemunha[]>(CHAVE_TESTEMUNHAS);
  gravarJson(CHAVE_TESTEMUNHAS, testemunhas);
  logAudit(null, adminId, 'config_testemunhas_atualizada', CHAVE_TESTEMUNHAS, antes, testemunhas);
}

/** URL da política de privacidade (configurável). Fallback: env PRIVACY_POLICY_URL. */
export function getPrivacidadeUrl(): string {
  const cfg = lerJson<{ url?: string }>(CHAVE_PRIVACIDADE);
  return (cfg?.url || config.privacyPolicyUrl || '').trim();
}

export function salvarPrivacidadeUrl(adminId: number, url: string): void {
  const antes = lerJson<{ url?: string }>(CHAVE_PRIVACIDADE);
  const limpo = (url || '').trim();
  gravarJson(CHAVE_PRIVACIDADE, { url: limpo });
  logAudit(null, adminId, 'config_privacidade_atualizada', CHAVE_PRIVACIDADE, antes?.url ?? null, limpo || null);
}
