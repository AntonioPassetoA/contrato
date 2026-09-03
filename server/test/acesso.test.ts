// Teste HTTP de ponta a ponta: controle de acesso por papel, hardening público
// (corpo grande → 413, excesso de requisições → 429) e ausência de PII em respostas
// públicas e nos logs. Sobe o servidor real em banco temporário. Sem PDF/Autentique.
// Rode: npx tsx server/test/acesso.test.ts
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { rmSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';

const PORT = 3500 + (process.pid % 300); // porta única por processo (evita servidores residuais)
const base = `http://localhost:${PORT}`;
const tmpDb = resolve(tmpdir(), `contratos-acesso-${process.pid}.sqlite`);
const tmpPdfDir = resolve(tmpdir(), `contratos-acesso-pdfs-${process.pid}`);
const CPF = '390.533.447-05';

const env = {
  ...process.env,
  PORT: String(PORT),
  CONTRATOS_DB_PATH: tmpDb,
  CONTRATOS_PDF_DIR: tmpPdfDir,
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_PASSWORD: 'admin-inicial-123',
  SESSION_SECRET: 'test-session-secret',
  AUTENTIQUE_TOKEN: 'test-token',
  DATA_ENCRYPTION_KEY: 'chave-ficticia-isolada-para-testes',
};

let ok = 0, fail = 0;
function check(nome: string, cond: boolean, extra = '') {
  if (cond) { ok++; console.log(`  ✓ ${nome}`); }
  else { fail++; console.log(`  ✗ ${nome}${extra ? '  — ' + extra : ''}`); }
}

let logBuffer = '';
const child = spawn('npx tsx server/src/index.ts', { shell: true, env, cwd: resolve(import.meta.dirname, '../..') });
child.stdout.on('data', (d) => { logBuffer += d.toString(); });
child.stderr.on('data', (d) => { logBuffer += d.toString(); });

function extractSession(setCookie: string[]): string | null {
  for (const c of setCookie) if (c.startsWith('admin_session=')) return c.split(';')[0];
  return null;
}
async function api(path: string, opts: { method?: string; body?: any; cookie?: string | null; rawBody?: string } = {}) {
  const method = opts.method ?? 'GET';
  const semCorpo = method === 'GET' || method === 'HEAD';
  const body = semCorpo ? undefined : opts.rawBody !== undefined ? opts.rawBody : opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(opts.cookie ? { Cookie: opts.cookie } : {}) },
    body,
  });
  const setCookie = (res.headers as any).getSetCookie?.() ?? [];
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, cookie: extractSession(setCookie) };
}

async function esperarServidor() {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(base + '/api/health'); if (r.ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

try {
  const up = await esperarServidor();
  if (!up) throw new Error('servidor não subiu\n' + logBuffer);

  console.log('\n[1] Login admin + troca de senha temporária');
  const login = await api('/api/admin/login', { method: 'POST', body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } });
  check('admin login 200', login.status === 200, String(login.status));
  check('admin exige troca de senha', login.json?.mustChangePassword === true);
  const adminCookie = login.cookie;
  const troca = await api('/api/admin/change-password', { method: 'POST', cookie: adminCookie, body: { senhaAtual: env.ADMIN_PASSWORD, novaSenha: 'admin-nova-123' } });
  check('troca de senha admin 200', troca.status === 200, String(troca.status));

  console.log('\n[2] Admin cria vendedor; vendedor faz login e troca senha');
  const criaVend = await api('/api/admin/users', { method: 'POST', cookie: adminCookie, body: { nome: 'Vendedor', email: 'vendedor@example.com', senha: 'vend-inicial-123', role: 'vendedor' } });
  check('criação de vendedor 200', criaVend.status === 200, String(criaVend.status));
  const vLogin = await api('/api/admin/login', { method: 'POST', body: { email: 'vendedor@example.com', password: 'vend-inicial-123' } });
  const vendCookie = vLogin.cookie;
  await api('/api/admin/change-password', { method: 'POST', cookie: vendCookie, body: { senhaAtual: 'vend-inicial-123', novaSenha: 'vend-nova-123' } });
  check('vendedor autenticado', !!vendCookie);

  console.log('\n[3] Vendedor NÃO acessa rotas administrativas (403)');
  const rotasAdmin: Array<[string, string]> = [
    ['GET', '/api/contratos/modelos'],
    ['PUT', '/api/contratos/1/dados-cliente'],
    ['PUT', '/api/contratos/1/conteudo'],
    ['GET', '/api/contratos/1/versoes'],
    ['POST', '/api/contratos/1/versoes/1/restaurar'],
    ['GET', '/api/contratos/1/config'],
    ['GET', '/api/contratos/1/preview'],
    ['POST', '/api/contratos/1/gerar-pdf'],
    ['GET', '/api/contratos/1/pdf'],
    ['GET', '/api/contratos/1/pdfs'],
  ];
  for (const [method, path] of rotasAdmin) {
    const r = await api(path, { method, cookie: vendCookie, body: {} });
    check(`vendedor bloqueado em ${method} ${path}`, r.status === 403, `veio ${r.status}`);
  }

  console.log('\n[4] Admin monta um contrato PF e libera link');
  const sol = await api('/api/contratos/solicitacoes', { method: 'POST', cookie: adminCookie, body: { clinicaNome: 'Clínica HTTP' } });
  const cid = sol.json?.contrato?.id;
  await api(`/api/contratos/${cid}/config`, { method: 'PUT', cookie: adminCookie, body: {
    tipoModelo: 'prestacao_servicos', tipoPessoa: 'pf', blocos: ['funil'], fidelidadeAtiva: false,
    valorCentavos: 424242, diaVencimento: 10, limiteLeads: 50, cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20',
  } });
  await api('/api/config/empresa/contratada', { method: 'PUT', cookie: adminCookie, body: { razao_social: 'X LTDA', cnpj: '11.222.333/0001-81', endereco: 'Rua 1', representantes: [{ nome: 'R', cpf: CPF }] } });
  await api('/api/config/empresa/testemunhas', { method: 'PUT', cookie: adminCookie, body: { testemunhas: [{ nome: 'T1', cpf: CPF }, { nome: 'T2', cpf: CPF }] } });
  await api('/api/config/empresa/privacidade', { method: 'PUT', cookie: adminCookie, body: { url: 'https://example.com/privacidade' } });
  const lib = await api(`/api/contratos/${cid}/liberar-link`, { method: 'POST', cookie: adminCookie });
  const token = lib.json?.config?.token;
  check('link liberado com token', !!token, String(lib.status));

  console.log('\n[5] API pública: sem dados comerciais/PII, com aviso de privacidade');
  const pub = await api(`/api/public/contrato/${token}`);
  check('GET público 200', pub.status === 200, String(pub.status));
  check('retorna privacidadeUrl', pub.json?.privacidadeUrl === 'https://example.com/privacidade');
  check('não expõe valor/blocos/fidelidade', !/valor|424242|blocos|fidelidade|vendedor|testemunha|contratada/i.test(pub.text), pub.text.slice(0, 120));

  console.log('\n[6] Envio válido + ausência de PII nos logs');
  const envio = await api(`/api/public/contrato/${token}`, { method: 'POST', body: { form: {
    nome: 'Cliente Secreto', nacionalidade: 'Brasileiro(a)', estado_civil: 'solteiro(a)', profissao: 'Dentista',
    rg: '12.345.678-9', rg_orgao: 'SSP/SP', cpf: CPF, telefone: '(11) 98765-4321', email: 'x@example.com',
    res_cep: '01001-000', res_logradouro: 'Rua A', res_numero: '10', res_bairro: 'Centro', res_municipio: 'São Paulo', res_estado: 'São Paulo',
  } } });
  check('envio público 200', envio.status === 200, String(envio.status));
  check('resposta do envio não traz PII', !/390|98765|Cliente Secreto/.test(envio.text));
  await new Promise((r) => setTimeout(r, 200));
  check('logs do servidor SEM CPF/nome do cliente', !logBuffer.includes('390.533.447-05') && !logBuffer.includes('39053344705') && !logBuffer.includes('Cliente Secreto'));

  console.log('\n[6b] Prévia + geração de PDF (admin) e download restrito ao admin');
  const preview = await api(`/api/contratos/${cid}/preview`, { cookie: adminCookie });
  check('preview admin 200 e pronto', preview.status === 200 && preview.json?.preview?.pronto === true, String(preview.status));
  check('preview traz HTML do documento', typeof preview.json?.preview?.html === 'string' && preview.json.preview.html.includes('CONTRATANTE'));
  const gerar = await api(`/api/contratos/${cid}/gerar-pdf`, { method: 'POST', cookie: adminCookie, body: { confirmar: true } });
  check('geração de PDF 200 com hash', gerar.status === 200 && /^[a-f0-9]{64}$/.test(gerar.json?.pdf?.hashConteudo ?? ''), String(gerar.status));
  const dl = await api(`/api/contratos/${cid}/pdf`, { cookie: adminCookie });
  check('download admin 200 application/pdf', dl.status === 200 && dl.text.startsWith('%PDF'), String(dl.status));
  const dlVend = await api(`/api/contratos/${cid}/pdf`, { cookie: vendCookie });
  check('vendedor NÃO baixa o PDF (403)', dlVend.status === 403, String(dlVend.status));
  const vendDetalhe = await api(`/api/contratos/${cid}`, { cookie: vendCookie });
  check('visão do vendedor não expõe pdf_path/caminho', !/pdf_path|contratos-acesso-pdfs|\.pdf/i.test(vendDetalhe.text));

  console.log('\n[7] Corpo grande demais → 413');
  const grande = JSON.stringify({ form: { lixo: 'a'.repeat(40000) } });
  const big = await api(`/api/public/contrato/${token}`, { method: 'POST', rawBody: grande });
  check('corpo > 16kb rejeitado (413)', big.status === 413, String(big.status));

  console.log('\n[8] Rate limit por IP → 429');
  let viu429 = false;
  for (let i = 0; i < 40; i++) {
    const r = await api(`/api/public/contrato/inexistente-${i}`);
    if (r.status === 429) { viu429 = true; break; }
  }
  check('excesso de requisições retorna 429', viu429);

  console.log(`\n================ RESULTADO: ${ok} ok, ${fail} falhas ================\n`);
} catch (e: any) {
  fail++;
  console.log('ERRO GERAL:', e?.message ?? e);
} finally {
  // Mata a ÁRVORE de processos (o npx cria um neto node que child.kill não alcança).
  try { if (child.pid) execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' }); } catch {}
  try { child.kill(); } catch {}
  await new Promise((r) => setTimeout(r, 400));
  try { rmSync(tmpDb, { force: true }); rmSync(tmpDb + '-wal', { force: true }); rmSync(tmpDb + '-shm', { force: true }); rmSync(tmpPdfDir, { recursive: true, force: true }); } catch {}
}

process.exit(fail === 0 ? 0 : 1);
