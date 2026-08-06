import { db } from './db';

const insertLog = db.prepare(
  `INSERT INTO logs (contract_id, event, detail, created_at) VALUES (?, ?, ?, ?)`
);

/**
 * Registra um evento de auditoria no banco e no console.
 * @param event nome curto do evento (ex.: 'link_gerado', 'documento_criado')
 * @param detail objeto serializável com detalhes (nunca inclua o token do Autentique)
 * @param contractId id do contrato relacionado, se houver
 */
export function logEvent(event: string, detail: unknown = null, contractId: number | null = null) {
  const now = new Date().toISOString();
  let detailStr: string | null = null;
  try {
    detailStr = detail == null ? null : JSON.stringify(detail);
  } catch {
    detailStr = String(detail);
  }
  insertLog.run(contractId, event, detailStr, now);
  const ctx = contractId ? ` [contrato#${contractId}]` : '';
  console.log(`[${now}] ${event}${ctx}${detailStr ? ' ' + detailStr : ''}`);
}

export function getLogs(contractId?: number, limit = 200) {
  if (contractId) {
    return db
      .prepare(`SELECT * FROM logs WHERE contract_id = ? ORDER BY id DESC LIMIT ?`)
      .all(contractId, limit);
  }
  return db.prepare(`SELECT * FROM logs ORDER BY id DESC LIMIT ?`).all(limit);
}
