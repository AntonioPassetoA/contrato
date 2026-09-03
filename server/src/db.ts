import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Banco em arquivo dentro de /server/data (ignorado no git).
// CONTRATOS_DB_PATH permite apontar para um banco isolado (usado nos testes),
// sem nunca tocar no banco real de desenvolvimento/produção.
const dbPath = process.env.CONTRATOS_DB_PATH
  ? resolve(process.env.CONTRATOS_DB_PATH)
  : (() => {
      const dataDir = resolve(import.meta.dirname, '../data');
      mkdirSync(dataDir, { recursive: true });
      return resolve(dataDir, 'contratos.sqlite');
    })();

export const db = new DatabaseSync(dbPath);

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

  CREATE TABLE IF NOT EXISTS users (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    nome                 TEXT NOT NULL,
    email                TEXT NOT NULL UNIQUE,
    senha_hash           TEXT NOT NULL,
    role                 TEXT NOT NULL DEFAULT 'vendedor',  -- 'admin' | 'vendedor'
    ativo                INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,        -- 1 = senha temporária, trocar no 1º acesso
    created_at           TEXT NOT NULL,
    last_login_at        TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

  -- Ciclo de vida do contrato: começa como solicitação do vendedor e evolui
  -- até a assinatura. Campos comerciais só são preenchidos pela admin (Manu).
  CREATE TABLE IF NOT EXISTS contratos (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    clinica_nome                TEXT NOT NULL,
    vendedor_id                 INTEGER NOT NULL,
    status                      TEXT NOT NULL DEFAULT 'solicitado',
    tipo_modelo                 TEXT,     -- prestacao_servicos | distrato | acordo | aditivo | credito | sdr
    tipo_pessoa                 TEXT,     -- pf | pj
    blocos                      TEXT,     -- JSON: blocos de serviço selecionados
    fidelidade                  TEXT,     -- JSON: { ativo, meses }
    social_midia                INTEGER NOT NULL DEFAULT 0, -- modificador do Funil (0/1)
    garantia                    TEXT,     -- JSON: { ativo, investimentoCentavos, periodoMeses, confirmadoEm }
    valor_centavos              INTEGER,
    dia_vencimento              INTEGER,
    limite_leads                INTEGER,
    cidade_assinatura           TEXT,
    data_assinatura             TEXT,
    configurado_por             INTEGER,  -- admin que configurou/liberou
    aprovado_por                INTEGER,  -- admin que aprovou o envio
    token                       TEXT UNIQUE,
    form_data                   TEXT,
    autentique_document_id      TEXT,
    autentique_signer_public_id TEXT,
    short_link                  TEXT,
    pdf_path                    TEXT,
    signed_pdf_path             TEXT,
    sandbox                     INTEGER NOT NULL DEFAULT 0,
    expires_at                  TEXT,
    created_at                  TEXT NOT NULL,
    updated_at                  TEXT,
    submitted_at                TEXT,
    approved_at                 TEXT,
    signed_at                   TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_contratos_vendedor ON contratos(vendedor_id);
  CREATE INDEX IF NOT EXISTS idx_contratos_status   ON contratos(status);
  CREATE INDEX IF NOT EXISTS idx_contratos_token    ON contratos(token);

  -- Auditoria: quem alterou o quê, quando (conteúdo antes/depois).
  CREATE TABLE IF NOT EXISTS audit (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    contrato_id  INTEGER,
    usuario_id   INTEGER,
    acao         TEXT NOT NULL,
    campo        TEXT,
    valor_antes  TEXT,
    valor_depois TEXT,
    created_at   TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audit_contrato ON audit(contrato_id);

  -- Configurações administrativas centralizadas (CONTRATADA, testemunhas, etc).
  CREATE TABLE IF NOT EXISTS config_admin (
    chave      TEXT PRIMARY KEY,
    valor      TEXT,
    updated_at TEXT
  );

  -- Versões do CONTEÚDO do contrato (cláusulas/textos). Cada edição manual cria uma
  -- versão nova, sem alterar o modelo-base. 'conteudo' é o JSON das cláusulas.
  CREATE TABLE IF NOT EXISTS contrato_versoes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    contrato_id   INTEGER NOT NULL,
    versao        INTEGER NOT NULL,
    origem        TEXT NOT NULL,          -- 'base' | 'personalizado' | 'restaurado'
    personalizado INTEGER NOT NULL DEFAULT 0,
    conteudo      TEXT NOT NULL,
    nota          TEXT,
    criado_por    INTEGER,
    created_at    TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_versoes_contrato ON contrato_versoes(contrato_id);

  -- PDFs GERADOS do contrato. Cada geração cria uma versão nova; a anterior é marcada
  -- 'substituido' (nunca sobrescrita). Arquivo fica em disco NÃO público (server/data/pdfs),
  -- acessível só pelo admin. Guarda hashes (conteúdo e arquivo) para integridade.
  CREATE TABLE IF NOT EXISTS contrato_pdfs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    contrato_id     INTEGER NOT NULL,
    versao_pdf      INTEGER NOT NULL,
    conteudo_versao INTEGER,                       -- versão de conteúdo que gerou (0 = base)
    hash_conteudo   TEXT NOT NULL,                 -- sha256 do conteúdo canônico (embutido no PDF)
    hash_arquivo    TEXT NOT NULL,                 -- sha256 dos bytes do PDF (integridade do arquivo)
    caminho         TEXT NOT NULL,                 -- caminho interno (não público)
    tamanho         INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'ativo', -- 'ativo' | 'substituido'
    gerado_por      INTEGER,
    created_at      TEXT NOT NULL,
    substituido_at  TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_pdfs_contrato ON contrato_pdfs(contrato_id);
`);

// Migração: coluna created_by em contracts (para bancos criados antes dos usuários)
const contractCols = db.prepare(`PRAGMA table_info(contracts)`).all() as { name: string }[];
if (!contractCols.some((c) => c.name === 'created_by')) {
  db.exec(`ALTER TABLE contracts ADD COLUMN created_by INTEGER`);
}

// Migração de papéis: super->admin, e qualquer papel legado -> vendedor.
db.exec(`
  UPDATE users SET role='admin'    WHERE role='super';
  UPDATE users SET role='vendedor' WHERE role NOT IN ('admin','vendedor');
`);

// Migração: coluna must_change_password em users (bancos criados antes).
const userCols = db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[];
if (!userCols.some((c) => c.name === 'must_change_password')) {
  db.exec(`ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`);
}

// Migração: coluna personalizado em contratos (marca "Contrato personalizado").
const contratoCols = db.prepare(`PRAGMA table_info(contratos)`).all() as { name: string }[];
if (contratoCols.length && !contratoCols.some((c) => c.name === 'personalizado')) {
  db.exec(`ALTER TABLE contratos ADD COLUMN personalizado INTEGER NOT NULL DEFAULT 0`);
}

// Migração: modificador Social Mídia (do Funil) e opt-in de Garantia (bancos antigos).
if (contratoCols.length && !contratoCols.some((c) => c.name === 'social_midia')) {
  db.exec(`ALTER TABLE contratos ADD COLUMN social_midia INTEGER NOT NULL DEFAULT 0`);
}
if (contratoCols.length && !contratoCols.some((c) => c.name === 'garantia')) {
  db.exec(`ALTER TABLE contratos ADD COLUMN garantia TEXT`);
}

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
  created_by: number | null;
}

export type UserRole = 'admin' | 'vendedor';

export interface UserRow {
  id: number;
  nome: string;
  email: string;
  senha_hash: string;
  role: UserRole;
  ativo: number;
  must_change_password: number;
  created_at: string;
  last_login_at: string | null;
}

export type ContratoStatus =
  | 'solicitado'             // vendedor criou a solicitação (só a clínica)
  | 'configurado'           // admin definiu modelo/blocos/comercial
  | 'link_liberado'         // admin liberou o link para o cliente preencher
  | 'preenchido'            // cliente enviou os dados; aguardando revisão da admin
  | 'aprovado'              // admin aprovou; gerando/enviando
  | 'aguardando_assinatura' // documento criado no Autentique
  | 'visualizado'
  | 'parcialmente_assinado'
  | 'assinado'
  | 'recusado'
  | 'cancelado'
  | 'expirado'
  | 'erro';

export interface ContratoRow {
  id: number;
  clinica_nome: string;
  vendedor_id: number;
  status: ContratoStatus;
  tipo_modelo: string | null;
  tipo_pessoa: 'pf' | 'pj' | null;
  blocos: string | null;
  fidelidade: string | null;
  social_midia: number;
  garantia: string | null;
  valor_centavos: number | null;
  dia_vencimento: number | null;
  limite_leads: number | null;
  cidade_assinatura: string | null;
  data_assinatura: string | null;
  configurado_por: number | null;
  aprovado_por: number | null;
  personalizado: number;
  token: string | null;
  form_data: string | null;
  autentique_document_id: string | null;
  autentique_signer_public_id: string | null;
  short_link: string | null;
  pdf_path: string | null;
  signed_pdf_path: string | null;
  sandbox: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  signed_at: string | null;
}
