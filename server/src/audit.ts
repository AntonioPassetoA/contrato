import { db } from './db';

function serial(v: unknown): string | null {
  if (v == null) return null;
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/**
 * Registra uma ação de auditoria (quem, o quê, quando, antes/depois).
 * Toda edição relevante feita pela admin deve passar por aqui.
 */
export function logAudit(
  contratoId: number | null,
  usuarioId: number | null,
  acao: string,
  campo?: string,
  antes?: unknown,
  depois?: unknown,
): void {
  db.prepare(
    `INSERT INTO audit (contrato_id, usuario_id, acao, campo, valor_antes, valor_depois, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(contratoId, usuarioId, acao, campo ?? null, serial(antes), serial(depois), new Date().toISOString());
}

export function getAuditDoContrato(contratoId: number) {
  return db
    .prepare(`SELECT * FROM audit WHERE contrato_id = ? ORDER BY id DESC`)
    .all(contratoId);
}
