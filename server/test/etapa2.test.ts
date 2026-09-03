// Teste de integração da Etapa 2 (configuração + liberação de link), 100% isolado:
// usa um banco temporário via CONTRATOS_DB_PATH e dados FICTÍCIOS (nunca dados reais).
// Não chama a Autentique e não gera PDF. Rode com: npx tsx server/test/etapa2.test.ts
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { rmSync } from 'node:fs';
import assert from 'node:assert/strict';

const tmpDb = resolve(tmpdir(), `contratos-test-${process.pid}.sqlite`);
process.env.CONTRATOS_DB_PATH = tmpDb;
process.env.AUTENTIQUE_TOKEN ??= 'test-token';
process.env.ADMIN_PASSWORD ??= 'test-admin-pass';
process.env.SESSION_SECRET ??= 'test-session-secret';

let ok = 0, fail = 0;
function check(nome: string, fn: () => void) {
  try { fn(); ok++; console.log(`  ✓ ${nome}`); }
  catch (e: any) { fail++; console.log(`  ✗ ${nome}\n      ${e?.message ?? e}`); }
}
function esperaErro(nome: string, code: string, fn: () => void) {
  try { fn(); fail++; console.log(`  ✗ ${nome}\n      esperava erro '${code}', mas passou`); }
  catch (e: any) {
    if (e?.code === code) { ok++; console.log(`  ✓ ${nome}`); }
    else { fail++; console.log(`  ✗ ${nome}\n      esperava code '${code}', veio '${e?.code}' (${e?.message})`); }
  }
}

const users = await import('../src/users.ts');
const contratos = await import('../src/contratos.ts');
const empresa = await import('../src/configEmpresa.ts');
const audit = await import('../src/audit.ts');

try {
  // ----- Setup: usuários -----
  const admin = users.criarUsuario({ nome: 'Manu (teste)', email: 'manu.teste@example.com', senha: 'senha-teste-123', role: 'admin' });
  const vend = users.criarUsuario({ nome: 'Vendedor Teste', email: 'vend.teste@example.com', senha: 'senha-teste-123', role: 'vendedor' });

  console.log('\n[1] Vendedor cria solicitação (só o nome da clínica)');
  const sol = contratos.criarSolicitacao(vend.id, 'Clínica Fictícia de Teste');
  check('status inicial = solicitado', () => assert.equal(sol.status, 'solicitado'));
  check('visão do vendedor NÃO tem campos comerciais', () => {
    const chaves = Object.keys(sol);
    for (const proibido of ['valor_centavos', 'blocos', 'fidelidade', 'limite_leads', 'dia_vencimento', 'tipo_modelo']) {
      assert.ok(!chaves.includes(proibido), `vazou campo ${proibido}`);
    }
  });
  check('link ainda não existe para o vendedor', () => assert.equal(sol.link, null));

  console.log('\n[2] Liberar link ANTES de configurar → bloqueado');
  esperaErro('bloqueia por contrato incompleto', 'contrato_incompleto', () => contratos.liberarLink(admin.id, sol.id));

  console.log('\n[3] Manu configura o contrato (PF, com Funil + Clínica Top 1)');
  const VALOR_SECRETO = 333777; // R$ 3.337,77 — usado para provar que não vaza
  const cfgPF = contratos.configurarContrato(admin.id, sol.id, {
    tipoModelo: 'prestacao_servicos', tipoPessoa: 'pf',
    blocos: ['funil', 'clinica_top1'],
    fidelidadeAtiva: true, fidelidadeMeses: 12,
    valorCentavos: VALOR_SECRETO, diaVencimento: 10, limiteLeads: 100,
    cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20',
  });
  check('status = configurado', () => assert.equal(cfgPF.status, 'configurado'));
  check('configuração completa', () => assert.equal(cfgPF.configurado, true));
  check('tipo de pessoa = pf', () => assert.equal(cfgPF.tipo_pessoa, 'pf'));
  check('blocos salvos', () => assert.deepEqual([...cfgPF.blocos].sort(), ['clinica_top1', 'funil']));

  console.log('\n[4] Liberar link SEM dados da empresa → bloqueado');
  esperaErro('bloqueia por empresa incompleta', 'empresa_incompleta', () => contratos.liberarLink(admin.id, sol.id));

  console.log('\n[5] Manu preenche CONTRATADA + testemunhas (fictício)');
  empresa.salvarContratada(admin.id, {
    razao_social: 'EMPRESA FICTÍCIA LTDA', cnpj: '00.000.000/0001-00',
    endereco: 'Rua de Teste, 1, Centro, Cidade/UF', email: 'contato@example.com',
    representantes: [{ nome: 'Representante Fictício', cpf: '000.000.000-00' }],
  });
  empresa.salvarTestemunhas(admin.id, [
    { nome: 'Testemunha Um', cpf: '111.111.111-11' },
    { nome: 'Testemunha Dois', cpf: '222.222.222-22' },
  ]);
  check('empresa agora está completa', () => assert.equal(empresa.empresaCompleta(), true));

  console.log('\n[6] Liberar link (gera token, sem PDF, sem Autentique)');
  const liberado = contratos.liberarLink(admin.id, sol.id);
  check('status = link_liberado', () => assert.equal(liberado.status, 'link_liberado'));
  check('token gerado', () => assert.ok(liberado.token && liberado.token.length > 10));
  check('link aponta para /c/<token>', () => assert.match(liberado.link ?? '', /\/c\/.+/));
  check('NÃO foi criado documento na Autentique', () => {
    const row = contratos.getContratoRow(sol.id)!;
    assert.equal(row.autentique_document_id, null);
    assert.equal(row.pdf_path, null);
  });

  console.log('\n[7] Visão do vendedor após liberação');
  const listaVend = contratos.listarParaVendedor(vend.id);
  const solVend = listaVend.find((c) => c.id === sol.id)!;
  check('vendedor vê o link', () => assert.match(solVend.link ?? '', /\/c\/.+/));
  check('vendedor NÃO vê o valor comercial', () => {
    assert.ok(!JSON.stringify(solVend).includes('3337'), 'valor vazou para o vendedor');
    assert.ok(!JSON.stringify(solVend).includes(String(VALOR_SECRETO)), 'valor vazou para o vendedor');
  });

  console.log('\n[8] Segundo contrato como PJ');
  const sol2 = contratos.criarSolicitacao(vend.id, 'Empresa Fictícia PJ');
  const cfgPJ = contratos.configurarContrato(admin.id, sol2.id, {
    tipoModelo: 'prestacao_servicos', tipoPessoa: 'pj',
    blocos: ['ia'],
    fidelidadeAtiva: false,
    valorCentavos: 500000, diaVencimento: 5,
    cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20',
  });
  check('PJ configurado (sem Funil → sem limite de leads exigido)', () => assert.equal(cfgPJ.configurado, true));
  const liberado2 = contratos.liberarLink(admin.id, sol2.id);
  check('PJ com link liberado', () => assert.equal(liberado2.status, 'link_liberado'));

  console.log('\n[9] Alterar blocos exige confirmação e é auditado');
  esperaErro('sem confirmar → bloqueia', 'confirmar_alteracao_blocos', () => contratos.configurarContrato(admin.id, sol.id, {
    tipoModelo: 'prestacao_servicos', tipoPessoa: 'pf',
    blocos: ['funil', 'clinica_top1', 'crc'],
    fidelidadeAtiva: true, fidelidadeMeses: 12,
    valorCentavos: VALOR_SECRETO, diaVencimento: 10, limiteLeads: 100,
    cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20',
  }));
  const cfgAlterado = contratos.configurarContrato(admin.id, sol.id, {
    tipoModelo: 'prestacao_servicos', tipoPessoa: 'pf',
    blocos: ['funil', 'clinica_top1', 'crc'],
    fidelidadeAtiva: true, fidelidadeMeses: 12,
    valorCentavos: VALOR_SECRETO, diaVencimento: 10, limiteLeads: 100,
    cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20',
    confirmarAlteracaoBlocos: true, confirmarAlteracaoComLink: true,
  });
  check('com confirmação → blocos atualizados', () => assert.ok(cfgAlterado.blocos.includes('crc')));

  console.log('\n[10] Auditoria registra tudo');
  const log = audit.getAuditDoContrato(sol.id) as any[];
  check('há registros de auditoria', () => assert.ok(log.length >= 3));
  check('registrou link_liberado', () => assert.ok(log.some((a) => a.acao === 'link_liberado')));
  check('registrou alteração de configuração', () => assert.ok(log.some((a) => a.acao === 'contrato_config_alterada')));
  check('auditoria guarda antes/depois de blocos', () => assert.ok(
    log.some((a) => a.campo === 'blocos' && a.valor_antes != null && a.valor_depois != null),
  ));

  // ----- ARTEFATOS -----
  console.log('\n================ ARTEFATOS (6) ================');
  console.log('\n① Contrato configurado pela Manu (visão admin):');
  console.log(JSON.stringify({
    id: cfgPF.id, clinica: cfgPF.clinica_nome, status: 'link_liberado',
    tipo_pessoa: 'pf', blocos: cfgAlterado.blocos, fidelidade: cfgPF.fidelidade,
    valor_centavos: cfgPF.valor_centavos, dia_vencimento: cfgPF.dia_vencimento,
    limite_leads: cfgPF.limite_leads, cidade: cfgPF.cidade_assinatura, data: cfgPF.data_assinatura,
  }, null, 2));

  console.log('\n② Visão restrita do vendedor (mesma solicitação):');
  console.log(JSON.stringify(contratos.listarParaVendedor(vend.id).find((c) => c.id === sol.id), null, 2));

  console.log('\n③ Contrato PF (link liberado):');
  console.log(`   ${liberado.link}`);

  console.log('\n④ Contrato PJ (link liberado):');
  console.log(`   ${liberado2.link}`);

  console.log('\n⑤ Histórico de auditoria (contrato PF):');
  for (const a of log.slice(0, 8)) {
    console.log(`   [${a.created_at}] ${a.acao}${a.campo ? ' · ' + a.campo : ''}${a.valor_antes != null ? `  (${a.valor_antes} → ${a.valor_depois})` : ''}`);
  }

  console.log('\n⑥ Prova de não-vazamento comercial ao vendedor:');
  const vendView = JSON.stringify(contratos.listarParaVendedor(vend.id));
  console.log(`   contém "3337" (valor)? ${vendView.includes('3337')}`);
  console.log(`   contém "blocos"?       ${vendView.includes('blocos')}`);
  console.log(`   contém "fidelidade"?   ${vendView.includes('fidelidade')}`);
  console.log(`   contém "limite_leads"? ${vendView.includes('limite_leads')}`);

  console.log(`\n================ RESULTADO: ${ok} ok, ${fail} falhas ================\n`);
} finally {
  try { rmSync(tmpDb, { force: true }); rmSync(tmpDb + '-wal', { force: true }); rmSync(tmpDb + '-shm', { force: true }); } catch {}
}

process.exit(fail === 0 ? 0 : 1);
