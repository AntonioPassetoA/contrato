import crypto from 'node:crypto';
import { db, type UserRow, type UserRole } from './db';
import { config } from './config';
import { logEvent } from './logger';

/** Gera hash de senha com scrypt nativo (salt:hash, ambos em hex). */
function hashSenha(senha: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/** Confere a senha em tempo constante contra o hash armazenado. */
export function verificarSenha(senha: string, armazenado: string): boolean {
  const [salt, hash] = armazenado.split(':');
  if (!salt || !hash) return false;
  const teste = crypto.scryptSync(senha, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(teste, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function nowISO() { return new Date().toISOString(); }

/** Versão do usuário sem o hash da senha — segura para enviar ao front. */
export type UserPublic = Omit<UserRow, 'senha_hash'>;

function semSenha(u: UserRow): UserPublic {
  const { senha_hash, ...rest } = u;
  return rest;
}

export function contarUsuarios(): number {
  const r = db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number };
  return r.n;
}

export function listarUsuarios(): UserPublic[] {
  const rows = db.prepare(`SELECT * FROM users ORDER BY id ASC`).all() as unknown as UserRow[];
  return rows.map(semSenha);
}

export function getUsuarioPorId(id: number): UserRow | undefined {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
}

export function getUsuarioPorEmail(email: string): UserRow | undefined {
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.trim().toLowerCase()) as UserRow | undefined;
}

export interface CriarUsuarioInput {
  nome: string;
  email: string;
  senha: string;
  role?: UserRole;
}

export function criarUsuario(input: CriarUsuarioInput): UserPublic {
  const nome = (input.nome || '').trim();
  const email = (input.email || '').trim().toLowerCase();
  const senha = input.senha || '';
  const role: UserRole = input.role === 'admin' ? 'admin' : 'vendedor';

  if (!nome) throw new Error('Informe o nome.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.');
  if (senha.length < 6) throw new Error('A senha deve ter ao menos 6 caracteres.');
  if (getUsuarioPorEmail(email)) throw new Error('Já existe um usuário com esse e-mail.');

  // Todo usuário nasce com senha TEMPORÁRIA (troca obrigatória no 1º acesso).
  const info = db.prepare(`
    INSERT INTO users (nome, email, senha_hash, role, ativo, must_change_password, created_at)
    VALUES (?, ?, ?, ?, 1, 1, ?)
  `).run(nome, email, hashSenha(senha), role, nowISO());

  logEvent('usuario_criado', { id: Number(info.lastInsertRowid), email, role });
  return semSenha(getUsuarioPorId(Number(info.lastInsertRowid))!);
}

export interface AtualizarUsuarioInput {
  nome?: string;
  senha?: string;
  role?: UserRole;
  ativo?: boolean;
}

export function atualizarUsuario(id: number, input: AtualizarUsuarioInput): UserPublic {
  const atual = getUsuarioPorId(id);
  if (!atual) throw new Error('Usuário não encontrado.');

  const nome = input.nome != null && input.nome.trim() ? input.nome.trim() : atual.nome;
  const role: UserRole = input.role === 'admin' || input.role === 'vendedor' ? input.role : atual.role;
  const ativo = input.ativo == null ? atual.ativo : input.ativo ? 1 : 0;
  const senhaHash = input.senha
    ? (input.senha.length >= 6 ? hashSenha(input.senha) : (() => { throw new Error('A senha deve ter ao menos 6 caracteres.'); })())
    : atual.senha_hash;

  // Não deixa remover/rebaixar/desativar o último admin ativo
  if ((role !== 'admin' || ativo === 0) && atual.role === 'admin') {
    const adminsAtivos = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role='admin' AND ativo=1`).get() as { n: number };
    if (adminsAtivos.n <= 1) throw new Error('Não é possível rebaixar/desativar o último administrador.');
  }

  // Se o admin redefiniu a senha, ela vira temporária (usuário troca no próximo acesso).
  const mustChange = input.senha ? 1 : atual.must_change_password;

  db.prepare(`UPDATE users SET nome=?, senha_hash=?, role=?, ativo=?, must_change_password=? WHERE id=?`)
    .run(nome, senhaHash, role, ativo, mustChange, id);
  logEvent('usuario_atualizado', { id, role, ativo }, null);
  return semSenha(getUsuarioPorId(id)!);
}

/** Troca de senha pelo próprio usuário (limpa a flag de senha temporária). */
export function trocarSenha(userId: number, senhaAtual: string, novaSenha: string): void {
  const u = getUsuarioPorId(userId);
  if (!u) throw new Error('Usuário não encontrado.');
  if (!verificarSenha(String(senhaAtual || ''), u.senha_hash)) throw new Error('Senha atual incorreta.');
  if ((novaSenha || '').length < 8) throw new Error('A nova senha deve ter ao menos 8 caracteres.');
  if (verificarSenha(novaSenha, u.senha_hash)) throw new Error('A nova senha deve ser diferente da atual.');
  db.prepare(`UPDATE users SET senha_hash=?, must_change_password=0 WHERE id=?`)
    .run(hashSenha(novaSenha), userId);
  logEvent('senha_trocada', { id: userId }, null);
}

export function removerUsuario(id: number): void {
  const atual = getUsuarioPorId(id);
  if (!atual) throw new Error('Usuário não encontrado.');
  if (atual.role === 'admin') {
    const adminsAtivos = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role='admin' AND ativo=1`).get() as { n: number };
    if (adminsAtivos.n <= 1) throw new Error('Não é possível remover o último administrador.');
  }
  db.prepare(`DELETE FROM users WHERE id=?`).run(id);
  logEvent('usuario_removido', { id }, null);
}

export function registrarLogin(id: number): void {
  db.prepare(`UPDATE users SET last_login_at=? WHERE id=?`).run(nowISO(), id);
}

/**
 * Garante que exista ao menos um administrador. Se a tabela estiver vazia,
 * cria o admin inicial a partir das variáveis de ambiente
 * (ADMIN_EMAIL, ADMIN_NOME e ADMIN_PASSWORD).
 */
export function garantirAdminInicial(): void {
  if (contarUsuarios() > 0) return;
  criarUsuario({
    nome: config.adminNome,
    email: config.adminEmail,
    senha: config.adminPassword,
    role: 'admin',
  });
  console.log(`   👤 Administrador inicial criado: ${config.adminEmail} (senha = ADMIN_PASSWORD do .env)`);
}
