// Teste de integração do FLUXO PÚBLICO (link /c/:token) da Etapa 2, 100% isolado:
// banco temporário via CONTRATOS_DB_PATH e dados FICTÍCIOS. Sem PDF, sem Autentique.
// Rode com: npx tsx server/test/publico.test.ts
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { rmSync } from 'node:fs';
import assert from 'node:assert/strict';

const tmpDb = resolve(tmpdir(), `contratos-pub-test-${process.pid}.sqlite`);
process.env.CONTRATOS_DB_PATH = tmpDb;
process.env.AUTENTIQUE_TOKEN ??= 'test-token';
process.env.ADMIN_PASSWORD ??= 'test-admin-pass';
process.env.SESSION_SECRET ??= 'test-session-secret';

let ok = 0, fail = 0;
function check(nome: string, fn: () => void) {
  try { fn(); ok++; console.log(`  ✓ ${nome}`); }
  catch (e: any) { fail++; console.log(`  ✗ ${nome}\n      ${e?.message ?? e}`); }
}
function esperaCodePub(nome: string, code: string, fn: () => void) {
  try { fn(); fail++; console.log(`  ✗ ${nome} (esperava '${code}', passou)`); }
  catch (e: any) { if (e?.code === code) { ok++; console.log(`  ✓ ${nome}`); } else { fail++; console.log(`  ✗ ${nome}: veio '${e?.code}' (${e?.message})`); } }
}

const users = await import('../src/users.ts');
const contratos = await import('../src/contratos.ts');
const empresa = await import('../src/configEmpresa.ts');

// Valores fictícios VÁLIDOS (CPF/CNPJ com dígitos verificadores corretos).
const CPF_OK = '390.533.447-05';
const CNPJ_OK = '11.222.333/0001-81';
function enderecoPF(pref: string) {
  return {
    [`${pref}cep`]: '01001-000', [`${pref}logradouro`]: 'Rua de Teste', [`${pref}numero`]: '100',
    [`${pref}bairro`]: 'Centro', [`${pref}municipio`]: 'São Paulo', [`${pref}estado`]: 'São Paulo',
  };
}
function formPF(nome = 'Cliente Fictício PF') {
  return {
    nome, nacionalidade: 'Brasileiro(a)', estado_civil: 'solteiro(a)', profissao: 'Dentista',
    rg: '12.345.678-9', rg_orgao: 'SSP/SP', cpf: CPF_OK, telefone: '(11) 98765-4321', email: 'pf@example.com',
    ...enderecoPF('res_'),
  };
}
function formPJ() {
  return {
    razao_social: 'Empresa Fictícia LTDA', nome_fantasia: 'Fantasia', cnpj: CNPJ_OK,
    ...enderecoPF('sede_'),
    nome: 'Representante Fictício', nacionalidade: 'Brasileiro(a)', estado_civil: 'casado(a)',
    profissao: 'Empresário', rg: '98.765.432-1', rg_orgao: 'SSP/SP', cpf: CPF_OK,
    telefone: '(11) 98765-4321', email: 'pj@example.com', ...enderecoPF('res_'),
  };
}

function prepararContrato(admin: number, vend: number, tipoPessoa: 'pf' | 'pj', nome: string) {
  const sol = contratos.criarSolicitacao(vend, nome);
  contratos.configurarContrato(admin, sol.id, {
    tipoModelo: 'prestacao_servicos', tipoPessoa,
    blocos: tipoPessoa === 'pf' ? ['funil'] : ['ia'],
    fidelidadeAtiva: false,
    valorCentavos: 424242, diaVencimento: 10, limiteLeads: tipoPessoa === 'pf' ? 50 : null,
    cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20',
  });
  const lib = contratos.liberarLink(admin, sol.id);
  return { id: sol.id, token: lib.token! };
}

try {
  const admin = users.criarUsuario({ nome: 'Manu', email: 'manu@example.com', senha: 'senha-teste-123', role: 'admin' });
  const vend = users.criarUsuario({ nome: 'Vend', email: 'vend@example.com', senha: 'senha-teste-123', role: 'vendedor' });
  empresa.salvarContratada(admin.id, {
    razao_social: 'CONTRATADA FICTÍCIA LTDA', cnpj: CNPJ_OK, endereco: 'Rua X, 1',
    representantes: [{ nome: 'Rep', cpf: CPF_OK }],
  });
  empresa.salvarTestemunhas(admin.id, [{ nome: 'T1', cpf: CPF_OK }, { nome: 'T2', cpf: CPF_OK }]);

  console.log('\n[1] Link PF válido abre o formulário certo');
  const pf = prepararContrato(admin.id, vend.id, 'pf', 'Clínica PF Fictícia');
  const abrePF = contratos.abrirFormularioPublico(pf.token);
  check('estado = ok', () => assert.equal(abrePF.estado, 'ok'));
  check('tipo de pessoa = pf', () => assert.equal((abrePF as any).form.tipoPessoa, 'pf'));
  check('tem nome da clínica', () => assert.equal((abrePF as any).form.clinicaNome, 'Clínica PF Fictícia'));
  check('campos PF incluem CPF, e-mail e endereço', () => {
    const nomes = (abrePF as any).form.campos.map((c: any) => c.name);
    for (const n of ['nome', 'cpf', 'email', 'telefone', 'res_cep']) assert.ok(nomes.includes(n), `falta ${n}`);
  });
  check('API pública NÃO expõe dados comerciais/internos', () => {
    const s = JSON.stringify(abrePF);
    for (const proibido of ['valor', '424242', 'blocos', 'fidelidade', 'limite', 'contratada', 'testemunha', 'vendedor', 'audit', 'token']) {
      assert.ok(!s.toLowerCase().includes(proibido.toLowerCase()), `vazou "${proibido}"`);
    }
  });

  console.log('\n[2] Link PJ válido abre o formulário certo');
  const pj = prepararContrato(admin.id, vend.id, 'pj', 'Clínica PJ Fictícia');
  const abrePJ = contratos.abrirFormularioPublico(pj.token);
  check('estado = ok e tipo pj', () => { assert.equal(abrePJ.estado, 'ok'); assert.equal((abrePJ as any).form.tipoPessoa, 'pj'); });
  check('campos PJ incluem razão social, nome fantasia e CNPJ', () => {
    const nomes = (abrePJ as any).form.campos.map((c: any) => c.name);
    for (const n of ['razao_social', 'nome_fantasia', 'cnpj', 'sede_cep']) assert.ok(nomes.includes(n), `falta ${n}`);
  });

  console.log('\n[3] Token inexistente');
  check('estado = nao_encontrado', () => assert.equal(contratos.abrirFormularioPublico('token-que-nao-existe').estado, 'nao_encontrado'));

  console.log('\n[4] Validação de CPF, CNPJ, telefone e e-mail');
  const ruimPF = contratos.submeterFormularioPublico(pf.token, {
    ...formPF(), cpf: '111.111.111-11', telefone: '123', email: 'sem-arroba',
  });
  check('rejeita com erros', () => assert.equal(ruimPF.estado, 'invalido'));
  check('erros de cpf/telefone/email presentes', () => {
    const e = (ruimPF as any).erros;
    assert.ok(e.cpf && e.telefone && e.email, `erros: ${JSON.stringify(e)}`);
  });
  const ruimPJ = contratos.submeterFormularioPublico(pj.token, { ...formPJ(), cnpj: '11.111.111/1111-11' });
  check('CNPJ inválido rejeitado', () => assert.ok((ruimPJ as any).erros?.cnpj));

  console.log('\n[5] Salvamento correto + status preenchido');
  const envio = contratos.submeterFormularioPublico(pf.token, formPF('João Fictício'));
  check('envio ok', () => assert.equal(envio.estado, 'ok'));
  check('status virou preenchido', () => assert.equal(contratos.getContratoRow(pf.id)!.status, 'preenchido'));
  check('dados salvos corretamente', () => {
    const d = contratos.getDadosCliente(pf.id)!;
    assert.equal(d.valores.nome, 'João Fictício');
    assert.equal(d.valores.cpf, CPF_OK);
    assert.equal(d.tipo_pessoa, 'pf');
  });

  console.log('\n[6] Formulário já preenchido não aceita novo envio livre');
  check('reenvio → ja_preenchido', () => assert.equal(contratos.submeterFormularioPublico(pf.token, formPF()).estado, 'ja_preenchido'));
  check('abrir de novo → ja_preenchido', () => assert.equal(contratos.abrirFormularioPublico(pf.token).estado, 'ja_preenchido'));

  console.log('\n[7] Vendedor vê só que foi preenchido (sem dados do cliente)');
  const vView = contratos.listarParaVendedor(vend.id).find((c) => c.id === pf.id)!;
  check('status preenchido visível', () => assert.equal(vView.status, 'preenchido'));
  check('não vaza CPF nem nome do cliente', () => {
    const s = JSON.stringify(vView);
    assert.ok(!s.includes('João') && !s.includes(CPF_OK) && !s.includes('424242'), 'vazou dado do cliente/comercial');
  });

  console.log('\n[8] Manu revê os dados recebidos');
  check('admin acessa os dados do cliente', () => {
    const d = contratos.getDadosCliente(pf.id)!;
    assert.ok(d && d.valores.email === 'pf@example.com');
  });

  console.log('\n[9] Editar contrato liberado invalida o token antigo e gera outro');
  const alvo = prepararContrato(admin.id, vend.id, 'pf', 'Clínica Rotação de Token');
  const tokenAntigo = alvo.token;
  check('token antigo abre antes da edição', () => assert.equal(contratos.abrirFormularioPublico(tokenAntigo).estado, 'ok'));
  esperaCodePub('editar com link sem confirmar → bloqueia', 'confirmar_alteracao_com_link', () => contratos.configurarContrato(admin.id, alvo.id, {
    tipoModelo: 'prestacao_servicos', tipoPessoa: 'pf', blocos: ['funil'],
    fidelidadeAtiva: false, valorCentavos: 999999, diaVencimento: 15, limiteLeads: 80,
    cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20',
  }));
  contratos.configurarContrato(admin.id, alvo.id, {
    tipoModelo: 'prestacao_servicos', tipoPessoa: 'pf', blocos: ['funil'],
    fidelidadeAtiva: false, valorCentavos: 999999, diaVencimento: 15, limiteLeads: 80,
    cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20',
    confirmarAlteracaoComLink: true,
  });
  check('token antigo INVALIDADO após edição', () => assert.equal(contratos.abrirFormularioPublico(tokenAntigo).estado, 'nao_encontrado'));
  const reLib = contratos.liberarLink(admin.id, alvo.id);
  check('novo token é diferente do antigo', () => assert.notEqual(reLib.token, tokenAntigo));
  check('novo token abre normalmente', () => assert.equal(contratos.abrirFormularioPublico(reLib.token!).estado, 'ok'));

  console.log('\n[10] Reabertura pela Manu permite corrigir pelo mesmo link');
  const reaberto = contratos.reabrirFormulario(admin.id, pf.id);
  check('status volta a link_liberado', () => assert.equal(reaberto.status, 'link_liberado'));
  check('mesmo token volta a abrir', () => assert.equal(contratos.abrirFormularioPublico(pf.token).estado, 'ok'));

  console.log('\n[11] Envio PJ válido');
  check('PJ enviado com sucesso', () => assert.equal(contratos.submeterFormularioPublico(pj.token, formPJ()).estado, 'ok'));
  check('PJ vira preenchido', () => assert.equal(contratos.getContratoRow(pj.id)!.status, 'preenchido'));

  console.log(`\n================ RESULTADO: ${ok} ok, ${fail} falhas ================\n`);
} finally {
  try { rmSync(tmpDb, { force: true }); rmSync(tmpDb + '-wal', { force: true }); rmSync(tmpDb + '-shm', { force: true }); } catch {}
}

process.exit(fail === 0 ? 0 : 1);
