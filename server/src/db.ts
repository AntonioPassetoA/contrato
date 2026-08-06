import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Banco em arquivo dentro de /server/data (ignorado no git)
const dataDir = resolve(import.meta.dirname, '../data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(resolve(dataDir, 'contratos.sqlite'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS contracts (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    token                       TEXT NOT NULL UNIQUE,
    template_id                 TEXT NOT NULL,
    template_nome               TEXT NOT NULL,
    cliente_label               TEXT,
    valor_centavos              INTEGER,
    dia_vencimento              INTEGER,
    status                      TEXT NOT NULL DEFAULT 'pendente',
    tipo_pessoa                 TEXT,
    form_data                   TEXT,
    autentique_document_id      TEXT,
    autentique_signer_public_id TEXT,
    short_link                  TEXT,
    pdf_path                    TEXT,
    sandbox                     INTEGER NOT NULL DEFAULT 0,
    expires_at                  TEXT,
    created_at                  TEXT NOT NULL,
    submitted_at                TEXT,
    signed_at                   TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_contracts_token  ON contracts(token);
  CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
  CREATE INDEX IF NOT EXISTS idx_contracts_docid  ON contracts(autentique_document_id);

  CREATE TABLE IF NOT EXISTS logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER,
    event       TEXT NOT NULL,
    detail      TEXT,
    created_at  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_logs_contract ON logs(contract_id);
`);

export type ContractStatus =
  | 'pendente'            // link gerado, cliente ainda não preencheu
  | 'preenchido'          // cliente enviou o formulário, gerando documento
  | 'aguardando_assinatura' // documento criado no Autentique, aguardando assinaturas
  | 'assinado'            // todas as assinaturas concluídas
  | 'expirado'
  | 'cancelado'
  | 'erro';

export interface ContractRow {
  id: number;
  token: string;
  template_id: string;
  template_nome: string;
  cliente_label: string | null;
  valor_centavos: number | null;
  dia_vencimento: number | null;
  status: ContractStatus;
  tipo_pessoa: 'pf' | 'pj' | null;
  form_data: string | null;
  autentique_document_id: string | null;
  autentique_signer_public_id: string | null;
  short_link: string | null;
  pdf_path: string | null;
  sandbox: number;
  expires_at: string | null;
  created_at: string;
  submitted_at: string | null;
  signed_at: string | null;
}
