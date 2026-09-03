// Testes dos ajustes finais da Etapa 2 (serviço), isolado em banco temporário e com
// CHAVE DE CRIPTOGRAFIA FICTÍCIA. Cobre: PII criptografada, auditoria mascarada,
// edição de dados pela Manu, versionamento/restore, preservação do modelo-base,
// invalidação de link com confirmação e rate limiter.
// Rode: npx tsx server/test/etapa2b.test.ts
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { rmSync } from 'node:fs';
import assert from 'node:assert/strict';

const tmpDb = resolve(tmpdir(), `contratos-2b-${process.pid}.sqlite`);
process.env.CONTRATOS_DB_PATH = tmpDb;
process.env.AUTENTIQUE_TOKEN ??= 'test-token';
process.env.ADMIN_PASSWORD ??= 'test-admin-pass';
process.env.SESSION_SECRET ??= 'test-session-secret';
process.env.DATA_ENCRYPTION_KEY = 'chave-ficticia-isolada-para-testes'; // fictícia e isolada

let ok = 0, fail = 0;
function check(nome: string, fn: () => void) {
  try { fn(); ok++; console.log(`  ✓ ${nome}`); }
  catch (e: any) { fail++; console.log(`  ✗ ${nome}\n      ${e?.message ?? e}`); }
}
function esperaCode(nome: string, code: string, fn: () => void) {
  try { fn(); fail++; console.log(`  ✗ ${nome} (esperava '${code}', passou)`); }
  catch (e: any) { if (e?.code === code) { ok++; console.log(`  ✓ ${nome}`); } else { fail++; console.log(`  ✗ ${nome}: veio '${e?.code}' (${e?.message})`); } }
}

const { db } = await import('../src/db.ts');
const users = await import('../src/users.ts');
const contratos = await import('../src/contratos.ts');
const empresa = await import('../src/configEmpresa.ts');
const audit = await import('../src/audit.ts');
const modelos = await import('../src/modelos.ts');
const { mascararCampo } = await import('../src/seguranca/mascarar.ts');
const { criarRateLimit } = await import('../src/seguranca/rateLimit.ts');
const { isEncrypted } = await import('../src/seguranca/pii.ts');

const CPF = '390.533.447-05';
function enderecoRes() {
  return { res_cep: '01001-000', res_logradouro: 'Rua A', res_numero: '10', res_bairro: 'Centro', res_municipio: 'São Paulo', res_estado: 'São Paulo' };
}
function formPF(nome = 'Cliente Secreto') {
  return { nome, nacionalidade: 'Brasileiro(a)', estado_civil: 'solteiro(a)', profissao: 'Dentista', rg: '12.345.678-9', rg_orgao: 'SSP/SP', cpf: CPF, telefone: '(11) 98765-4321', email: 'cliente@example.com', ...enderecoRes() };
}
function prepararPF(admin: number, vend: number, nome: string) {
  const s = contratos.criarSolicitacao(vend, nome);
  contratos.configurarContrato(admin, s.id, {
    tipoModelo: 'prestacao_servicos', tipoPessoa: 'pf', blocos: ['funil'], fidelidadeAtiva: false,
    valorCentavos: 424242, diaVencimento: 10, limiteLeads: 50, cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20',
  });
  const lib = contratos.liberarLink(admin, s.id);
  return { id: s.id, token: lib.token! };
}

try {
  const admin = users.criarUsuario({ nome: 'Manu', email: 'manu@example.com', senha: 'senha-teste-123', role: 'admin' });
  const vend = users.criarUsuario({ nome: 'Vend', email: 'vend@example.com', senha: 'senha-teste-123', role: 'vendedor' });
  empresa.salvarContratada(admin.id, { razao_social: 'X LTDA', cnpj: '11.222.333/0001-81', endereco: 'Rua 1', representantes: [{ nome: 'R', cpf: CPF }] });
  empresa.salvarTestemunhas(admin.id, [{ nome: 'T1', cpf: CPF }, { nome: 'T2', cpf: CPF }]);

  console.log('\n[1] PII criptografada em repouso');
  const a = prepararPF(admin.id, vend.id, 'Clínica Cripto');
  contratos.submeterFormularioPublico(a.token, formPF('João Secreto'));
  const raw = (db.prepare('SELECT form_data FROM contratos WHERE id = ?').get(a.id) as any).form_data as string;
  check('form_data está criptografado (enc:v1:)', () => assert.ok(isEncrypted(raw)));
  check('CPF/nome NÃO aparecem em texto aberto no banco', () => {
    assert.ok(!raw.includes('390') && !raw.includes('João') && !raw.includes('98765'), 'PII em texto aberto!');
  });
  check('leitura descriptografada correta (admin)', () => {
    const d = contratos.getDadosCliente(a.id)!;
    assert.equal(d.valores.nome, 'João Secreto');
    assert.equal(d.valores.cpf, CPF);
  });

  console.log('\n[2] Manu edita dados do cliente com confirmação e auditoria mascarada');
  esperaCode('sem confirmar → bloqueia', 'confirmar_edicao_dados', () => contratos.editarDadosCliente(admin.id, a.id, formPF('João Secreto'), false));
  contratos.editarDadosCliente(admin.id, a.id, { ...formPF('Maria Nova'), cpf: '111.444.777-35' }, true);
  check('dado atualizado', () => assert.equal(contratos.getDadosCliente(a.id)!.valores.nome, 'Maria Nova'));
  const logs = audit.getAuditDoContrato(a.id) as any[];
  const rowCpf = logs.find((l) => l.acao === 'dados_cliente_alterados' && l.campo === 'cpf');
  check('auditoria registrou alteração de cpf', () => assert.ok(rowCpf));
  check('colunas corretas: valor_antes = antigo mascarado, valor_depois = novo mascarado', () => {
    // antigo CPF 390...-05 (termina 05) ; novo 111...-35 (termina 35)
    assert.equal(rowCpf.valor_antes, mascararCampo('cpf', CPF), 'valor_antes incorreto');
    assert.equal(rowCpf.valor_depois, mascararCampo('cpf', '111.444.777-35'), 'valor_depois incorreto');
    assert.ok(rowCpf.valor_antes.endsWith('05') && rowCpf.valor_depois.endsWith('35'), 'colunas trocadas!');
  });
  check('registra usuário responsável e data/hora', () => {
    assert.equal(rowCpf.usuario_id, admin.id);
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(rowCpf.created_at), 'created_at inválido');
  });
  check('auditoria NÃO guarda dado pessoal completo', () => {
    const s = JSON.stringify(logs);
    assert.ok(!s.includes('111.444.777-35') && !s.includes('11144477735'), 'CPF vazou na auditoria');
    assert.ok(!s.includes('Maria Nova'), 'nome completo vazou na auditoria');
    assert.ok(s.includes('•'), 'esperava valores mascarados');
  });

  console.log('\n[3] Editor INDISPONÍVEL quando o modelo jurídico não está validado');
  const b = prepararPF(admin.id, vend.id, 'Clínica Conteúdo');
  modelos.getModelo('prestacao_servicos')!.conteudoValidado = false; // simula modelo pendente
  const pend = contratos.getConteudoAtual(b.id)!;
  check('getConteudoAtual → disponivel=false com aviso', () => {
    assert.equal(pend.disponivel, false);
    assert.equal((pend as any).aviso, 'Modelo jurídico pendente de validação');
  });
  esperaCode('editarConteudo bloqueado (modelo pendente)', 'modelo_pendente', () => contratos.editarConteudo(admin.id, b.id, [{ id: 'x', titulo: 'X', texto: 'y' }], true));
  esperaCode('restaurarVersao bloqueado (modelo pendente)', 'modelo_pendente', () => contratos.restaurarVersao(admin.id, b.id, 1, true));

  console.log('\n[3b] Mecânicas de versão com o modelo VALIDADO');
  contratos.submeterFormularioPublico(b.token, formPF('Carlos Secreto')); // PII (criptografada) neste contrato
  modelos.getModelo('prestacao_servicos')!.conteudoValidado = true; // base validada (Etapa 3)
  const baseAntes = contratos.getConteudoAtual(b.id)!;
  check('conteúdo base disponível quando validado', () => assert.ok(baseAntes.disponivel && baseAntes.conteudo.clausulas.length > 5 && !baseAntes.persistido));
  const objetoOriginal = baseAntes.conteudo.clausulas.find((c: any) => c.id === 'objeto')!.texto;
  // edita a cláusula de objeto — precisa confirmar (tem link)
  const novo = baseAntes.conteudo.clausulas.map((c: any) => c.id === 'objeto' ? { ...c, texto: c.texto + '\n1.3) CLÁUSULA PERSONALIZADA DE TESTE.' } : c);
  esperaCode('editar com link sem confirmar → bloqueia', 'confirmar_alteracao_com_link', () => contratos.editarConteudo(admin.id, b.id, novo, false));
  const vNova = contratos.editarConteudo(admin.id, b.id, novo, true, 'ajuste de objeto');
  check('nova versão é personalizada', () => assert.ok(vNova.personalizado && vNova.versao >= 2));
  check('contrato marcado como personalizado', () => assert.equal(contratos.getConfigParaAdmin(b.id)!.personalizado, true));
  check('link invalidado e voltou para revisão', () => {
    const cfg = contratos.getConfigParaAdmin(b.id)!;
    assert.equal(cfg.status, 'configurado'); assert.equal(cfg.token, null);
  });
  check('versão base (v1) preservada com o texto original', () => {
    const v1 = contratos.getVersao(b.id, 1)!;
    assert.equal(v1.origem, 'base');
    assert.equal(v1.conteudo.clausulas.find((c: any) => c.id === 'objeto')!.texto, objetoOriginal);
  });
  check('MODELO-BASE global intacto (outro contrato gera texto original)', () => {
    const outro = contratos.criarSolicitacao(vend.id, 'Outra');
    contratos.configurarContrato(admin.id, outro.id, {
      tipoModelo: 'prestacao_servicos', tipoPessoa: 'pf', blocos: ['funil'], fidelidadeAtiva: false,
      valorCentavos: 100000, diaVencimento: 5, limiteLeads: 10, cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20',
    });
    const base = contratos.getConteudoAtual(outro.id)!;
    assert.ok(!base.conteudo.clausulas.find((c: any) => c.id === 'objeto')!.texto.includes('PERSONALIZADA'));
  });

  console.log('\n[4] Histórico e restauração de versões');
  const versoes = contratos.listarVersoes(b.id);
  check('histórico tem base + personalizada', () => assert.ok(versoes.length >= 2));
  const restaurada = contratos.restaurarVersao(admin.id, b.id, 1, true);
  check('restaurar cria nova versão a partir da v1', () => assert.ok(restaurada.versao > vNova.versao));
  check('conteúdo restaurado = original (sem a cláusula personalizada)', () => {
    assert.ok(!restaurada.conteudo.clausulas.find((c: any) => c.id === 'objeto')!.texto.includes('PERSONALIZADA'));
  });
  check('auditoria registrou restauração', () => assert.ok((audit.getAuditDoContrato(b.id) as any[]).some((l) => l.acao === 'versao_restaurada')));

  console.log('\n[4b] Versões guardam SÓ cláusulas — nenhuma PII descriptografada');
  check('contrato_versoes sem CPF/nome do cliente', () => {
    const rows = db.prepare('SELECT conteudo FROM contrato_versoes WHERE contrato_id = ?').all(b.id) as any[];
    const s = JSON.stringify(rows);
    assert.ok(rows.length >= 2, 'esperava versões salvas');
    assert.ok(!s.includes('Carlos Secreto') && !s.includes('Carlos') && !s.includes('390') && !s.includes(CPF), 'PII vazou nas versões!');
  });

  console.log('\n[5] Rate limiter');
  const rl = criarRateLimit({ janelaMs: 1000, max: 3 });
  function fakeReq() { return { ip: '9.9.9.9', socket: {} } as any; }
  function fakeRes() { const r: any = { code: 200, headers: {}, setHeader(k: string, v: string) { r.headers[k] = v; }, status(c: number) { r.code = c; return r; }, json() { return r; } }; return r; }
  let passou = 0;
  for (let i = 0; i < 3; i++) { const res = fakeRes(); rl(fakeReq(), res, () => passou++); }
  const quarto = fakeRes(); let quartoNext = false; rl(fakeReq(), quarto, () => { quartoNext = true; });
  check('3 primeiras passam', () => assert.equal(passou, 3));
  check('4ª é bloqueada com 429', () => { assert.equal(quarto.code, 429); assert.equal(quartoNext, false); });

  console.log(`\n================ RESULTADO: ${ok} ok, ${fail} falhas ================\n`);
} finally {
  try { rmSync(tmpDb, { force: true }); rmSync(tmpDb + '-wal', { force: true }); rmSync(tmpDb + '-shm', { force: true }); } catch {}
}

process.exit(fail === 0 ? 0 : 1);
