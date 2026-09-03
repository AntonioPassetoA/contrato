// Prova dos 12 casos de BLOQUEIO/LIBERAÇÃO da geração de PDF (Etapa 3). Banco/PDF
// temporários e chave FICTÍCIA. Casos permitidos usam SOMENTE blocos validados
// (funil, clinica_top1). Casos bloqueados: nenhum PDF é gerado NEM armazenado.
// O caso 12 sobe o servidor HTTP real e prova que a chamada direta à API também bloqueia.
// Rode: npx tsx --test server/test/etapa3c.test.ts
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { rmSync, existsSync, readdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

const tmpDb = resolve(tmpdir(), `contratos-3c-${process.pid}.sqlite`);
const tmpPdfDir = resolve(tmpdir(), `contratos-3c-pdfs-${process.pid}`);
process.env.CONTRATOS_DB_PATH = tmpDb;
process.env.CONTRATOS_PDF_DIR = tmpPdfDir;
process.env.AUTENTIQUE_TOKEN ??= 'test-token';
process.env.ADMIN_PASSWORD ??= 'test-admin-pass';
process.env.SESSION_SECRET ??= 'test-session-secret';
process.env.DATA_ENCRYPTION_KEY = 'chave-ficticia-isolada-3c';

let ok = 0, fail = 0;
function check(nome: string, cond: boolean, extra = '') {
  if (cond) { ok++; console.log(`  ✓ ${nome}`); }
  else { fail++; console.log(`  ✗ ${nome}${extra ? '  — ' + extra : ''}`); }
}
async function bloqueado(nome: string, id: number, fn: () => Promise<unknown>) {
  const antesArqs = existsSync(tmpPdfDir) ? readdirSync(tmpPdfDir).filter((f) => f.includes(`contrato-${id}-`)).length : 0;
  let code = '';
  try { await fn(); } catch (e: any) { code = e?.code ?? ''; }
  const depoisArqs = existsSync(tmpPdfDir) ? readdirSync(tmpPdfDir).filter((f) => f.includes(`contrato-${id}-`)).length : 0;
  const semRegistro = contratos.listarPdfs(id).length === 0;
  const semArquivo = depoisArqs === antesArqs;
  check(nome, code === 'pendencias_geracao' && semRegistro && semArquivo,
    `code='${code}' registros=${contratos.listarPdfs(id).length} arqsΔ=${depoisArqs - antesArqs}`);
}

const { db } = await import('../src/db.ts');
const users = await import('../src/users.ts');
const contratos = await import('../src/contratos.ts');
const empresa = await import('../src/configEmpresa.ts');
const express = (await import('express')).default;
const cookieParser = (await import('cookie-parser')).default;
const { adminRouter } = await import('../src/routes/admin.ts');
const { contratosRouter } = await import('../src/routes/contratos.ts');
const modelos = await import('../src/modelos.ts');

// Todos os blocos estão VALIDADOS (aprovação 2026-09-01). Para exercitar os CASOS
// BLOQUEADOS, colocamos o alvo TEMPORARIAMENTE como pendente e restauramos em seguida.
function setPendente(alvo: string): () => void {
  const v: any = alvo === 'fidelidade' ? modelos.FIDELIDADE_VALIDACAO
    : alvo === 'garantia' ? modelos.GARANTIA_VALIDACAO
    : modelos.getBloco('prestacao_servicos', alvo)!.validacao;
  const bak = v.validacaoJuridica; v.validacaoJuridica = 'pendente';
  return () => { v.validacaoJuridica = bak; };
}

const fakeRender = async (html: string, footer: string): Promise<Buffer> =>
  Buffer.from(`%PDF-1.4 fake html=${html.length} footer=${footer.length}\n%%EOF`);

const CPF = '390.533.447-05';
const CPF2 = '111.444.777-35';
function endereco(p: string) {
  return { [`${p}cep`]: '86360-000', [`${p}logradouro`]: 'Rua das Flores', [`${p}numero`]: '123', [`${p}bairro`]: 'Centro', [`${p}municipio`]: 'Bandeirantes', [`${p}estado`]: 'Paraná' } as Record<string, string>;
}
function formPF(nome = 'João Cliente Fictício') {
  return { nome, nacionalidade: 'Brasileiro(a)', estado_civil: 'solteiro(a)', profissao: 'Dentista', rg: '12.345.678-9', rg_orgao: 'SSP/PR', cpf: CPF, telefone: '(43) 99999-0000', email: 'joao@example.com', ...endereco('res_') };
}
const MODELO = 'prestacao_servicos';

let servidor: import('node:http').Server | null = null;
try {
  const admin = users.criarUsuario({ nome: 'Manu', email: 'manu@example.com', senha: 'senha-teste-123', role: 'admin' });
  const vend = users.criarUsuario({ nome: 'Vend', email: 'vend@example.com', senha: 'senha-teste-123', role: 'vendedor' });
  // Admin programático: dispensa a troca de senha inicial para permitir a chamada HTTP autenticada.
  db.exec('UPDATE users SET must_change_password = 0');
  empresa.salvarContratada(admin.id, {
    razao_social: 'AGÊNCIA FICTÍCIA LTDA', cnpj: '11.444.777/0001-61', endereco: 'Rua Exemplo, nº 259, Centro, Bandeirantes/PR',
    email: 'contato@ficticia.com', representantes: [{ nome: 'Rep Um Fictício', cpf: CPF2, endereco: 'Rua A, 1' }],
  });
  empresa.salvarTestemunhas(admin.id, [{ nome: 'Testemunha Um', cpf: CPF }, { nome: 'Testemunha Dois', cpf: CPF2 }]);

  function preparar(nome: string, blocos: string[], over: Partial<any> = {}) {
    const id = contratos.criarSolicitacao(vend.id, nome).id;
    contratos.configurarContrato(admin.id, id, {
      tipoModelo: MODELO, tipoPessoa: 'pf', blocos, fidelidadeAtiva: false,
      valorCentavos: 220000, diaVencimento: 10,
      limiteLeads: blocos.includes('crc') ? 100 : null,
      cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20', ...over,
    });
    const lib = contratos.liberarLink(admin.id, id);
    contratos.submeterFormularioPublico(lib.token!, formPF());
    return id;
  }

  console.log('\n=== CASOS PERMITIDOS (somente blocos validados) ===');
  const cF = preparar('01 Funil', ['funil']);
  const pdfF = await contratos.aprovarEGerarPdf(admin.id, cF, true, fakeRender);
  check('[1] Só Funil validado → PDF PERMITIDO (v1, ativo, hash 64hex)',
    pdfF.versaoPdf === 1 && pdfF.status === 'ativo' && /^[a-f0-9]{64}$/.test(pdfF.hashConteudo));

  const cT = preparar('02 Clinica Top1', ['clinica_top1']);
  const pdfT = await contratos.aprovarEGerarPdf(admin.id, cT, true, fakeRender);
  check('[2] Só Clínica Top 1 validado → PDF PERMITIDO', pdfT.versaoPdf === 1 && existsSync(contratos.getContratoRow(cT)!.pdf_path!));

  console.log('\n=== CASOS BLOQUEADOS (bloco/opt-in TEMPORARIAMENTE pendente) ===');
  async function casoBloq(rot: string, blocos: string[], alvo: string, over: Partial<any> = {}) {
    const restore = setPendente(alvo);
    try {
      const id = preparar(rot, blocos, over);
      await bloqueado(`${rot} → PDF bloqueado (nada gerado/armazenado)`, id, () => contratos.aprovarEGerarPdf(admin.id, id, true, fakeRender));
      return id;
    } finally { restore(); }
  }
  await casoBloq('[3] CRC pendente', ['crc'], 'crc');
  await casoBloq('[4] IA pendente', ['ia'], 'ia');
  await casoBloq('[5] Google Ads pendente', ['google_ads'], 'google_ads');
  await casoBloq('[6] Site pendente', ['site'], 'site');
  await casoBloq('[7] Consignado pendente', ['consignado'], 'consignado');
  await casoBloq('[8] Fidelidade pendente', ['funil'], 'fidelidade', { fidelidadeAtiva: true, fidelidadeMeses: 6 });
  await casoBloq('[9] Garantia pendente', ['funil'], 'garantia', { garantiaAtiva: true, garantiaInvestimentoCentavos: 100000, garantiaPeriodoMeses: 6, confirmarGarantia: true });
  await casoBloq('[10] Validado + pendente (funil + CRC)', ['funil', 'crc'], 'crc');

  console.log('\n=== [11] Editor NÃO libera (registro é a fonte da verdade) ===');
  const restore11 = setPendente('crc');
  const cEd = preparar('11 Editor', ['funil', 'crc']);
  const atual = contratos.getConteudoAtual(cEd) as any;
  const mexido = atual.conteudo.clausulas.map((cl: any) => ({ ...cl, texto: 'Texto inserido manualmente pela administração.' }));
  contratos.editarConteudo(admin.id, cEd, mexido, true);
  await bloqueado('[11] Após burla no editor → PDF continua bloqueado', cEd, () => contratos.aprovarEGerarPdf(admin.id, cEd, true, fakeRender));
  restore11();

  console.log('\n=== [12] Chamada direta à API HTTP também bloqueia ===');
  const restore12 = setPendente('crc');
  const cApi = preparar('12 API', ['funil', 'crc']);
  // Sobe o app Express REAL (mesmos routers do index.ts) numa porta efêmera, no processo.
  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/admin', adminRouter);
  app.use('/api/contratos', contratosRouter);
  servidor = app.listen(0);
  const port = (servidor.address() as AddressInfo).port;
  const base = `http://localhost:${port}`;
  const login = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close' }, body: JSON.stringify({ email: 'manu@example.com', password: 'senha-teste-123' }) });
  const cookie = ((login.headers as any).getSetCookie?.() ?? []).map((c: string) => c.split(';')[0]).find((c: string) => c.startsWith('admin_session=')) || '';
  const resp = await fetch(base + `/api/contratos/${cApi}/gerar-pdf`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close', Cookie: cookie }, body: JSON.stringify({ confirmar: true }) });
  const jr = await resp.json().catch(() => ({}));
  const semArquivoApi = !(existsSync(tmpPdfDir) ? readdirSync(tmpPdfDir).some((f) => f.includes(`contrato-${cApi}-`)) : false);
  check('[12] API /gerar-pdf → 400 pendencias_geracao, sem PDF gerado/armazenado',
    resp.status === 400 && jr?.code === 'pendencias_geracao' && contratos.listarPdfs(cApi).length === 0 && semArquivoApi,
    `status=${resp.status} code=${jr?.code}`);
  restore12();

  // Fecha o servidor HTTP de forma limpa antes do teardown geral (destrói sockets keep-alive).
  try { (servidor as any)?.closeAllConnections?.(); } catch {}
  await new Promise<void>((r) => { if (servidor) servidor.close(() => r()); else r(); });
  servidor = null;

  console.log(`\n================ RESULTADO: ${ok} ok, ${fail} falhas ================\n`);
} finally {
  try { (servidor as any)?.closeAllConnections?.(); servidor?.close(); } catch {}
  try {
    rmSync(tmpDb, { force: true }); rmSync(tmpDb + '-wal', { force: true }); rmSync(tmpDb + '-shm', { force: true });
    rmSync(tmpPdfDir, { recursive: true, force: true });
  } catch {}
}
// Sai pelo exitCode (evita abort de handles ainda fechando no Windows).
process.exitCode = fail === 0 ? 0 : 1;
