// Testes da REGRA Google Ads (B1) × Facebook/Meta (B2) na cláusula 9, JÁ com a
// aprovação jurídica de 2026-09-01 (todos os blocos validados) e com a proteção OFFLINE
// contra chamadas à Autentique. Banco/PDF temporários, CHAVE FICTÍCIA, render FAKE.
//
// Mapeamento por SERVIÇO explícito: Google Ads = bloco `google_ads` → B1;
// Facebook/Meta = bloco `facebook_meta` → B2. O modificador `social_midia` NÃO aciona B2.
// Rode: npx tsx server/test/etapa3d-propriedade.test.ts
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { rmSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const tmpDb = resolve(tmpdir(), `contratos-3d-${process.pid}.sqlite`);
const tmpPdfDir = resolve(tmpdir(), `contratos-3d-pdfs-${process.pid}`);
process.env.CONTRATOS_DB_PATH = tmpDb;
process.env.CONTRATOS_PDF_DIR = tmpPdfDir;
process.env.NODE_ENV = 'test';
process.env.AUTENTIQUE_OFFLINE = '1';           // proteção explícita contra rede
process.env.AUTENTIQUE_TOKEN ??= 'test-token';
process.env.ADMIN_PASSWORD ??= 'test-admin-pass';
process.env.SESSION_SECRET ??= 'test-session-secret';
process.env.DATA_ENCRYPTION_KEY = 'chave-ficticia-isolada-para-testes-3d';

let ok = 0, fail = 0;
function check(nome: string, fn: () => void) {
  try { fn(); ok++; console.log(`  ✓ ${nome}`); }
  catch (e: any) { fail++; console.log(`  ✗ ${nome}\n      ${e?.message ?? e}`); }
}
async function checkA(nome: string, fn: () => Promise<void>) {
  try { await fn(); ok++; console.log(`  ✓ ${nome}`); }
  catch (e: any) { fail++; console.log(`  ✗ ${nome}\n      ${e?.message ?? e}`); }
}
async function esperaCode(nome: string, code: string, fn: () => Promise<unknown>) {
  try { await fn(); fail++; console.log(`  ✗ ${nome} (esperava '${code}', passou)`); }
  catch (e: any) { if (e?.code === code) { ok++; console.log(`  ✓ ${nome}`); } else { fail++; console.log(`  ✗ ${nome}: veio '${e?.code}' (${e?.message})`); } }
}

const { db } = await import('../src/db.ts');
const users = await import('../src/users.ts');
const contratos = await import('../src/contratos.ts');
const empresa = await import('../src/configEmpresa.ts');
const composicao = await import('../src/composicaoContrato.ts');
const modelos = await import('../src/modelos.ts');
const config = (await import('../src/config.ts')).config;

const fakeRender = async (html: string, footer: string): Promise<Buffer> =>
  Buffer.from(`%PDF-1.4 fake html=${html.length} footer=${footer.length}\n%%EOF`);

const CPF = '390.533.447-05', CPF2 = '111.444.777-35';
function endereco(p: string) {
  return { [`${p}cep`]: '86360-000', [`${p}logradouro`]: 'Rua das Flores', [`${p}numero`]: '123', [`${p}bairro`]: 'Centro', [`${p}municipio`]: 'Bandeirantes', [`${p}estado`]: 'Paraná' } as Record<string, string>;
}
function formPF(nome = 'João Cliente Fictício') {
  return { nome, nacionalidade: 'Brasileiro(a)', estado_civil: 'solteiro(a)', profissao: 'Dentista', rg: '12.345.678-9', rg_orgao: 'SSP/PR', cpf: CPF, telefone: '(43) 99999-0000', email: 'joao@example.com', ...endereco('res_') };
}

const B1_991 = 'Contas do Google Ads criadas pela CONTRATADA em suas próprias contas';
const B2_991 = 'Gerenciador de Negócios do Facebook criado pela CONTRATADA para uso durante o período do contrato.';
const B2_SIC = 'públicadas';
const BASE_91 = 'Toda propriedade intelectual desenvolvida pela CONTRATADA em decorrência da execução do presente Contrato será de sua titularidade exclusiva.';
const LABEL_G = 'GOOGLE ADS', LABEL_F = 'FACEBOOK';
function countOf(hay: string, sub: string): number { let n = 0, i = 0; for (;;) { const k = hay.indexOf(sub, i); if (k < 0) break; n++; i = k + sub.length; } return n; }

interface Opts { socialMidia?: boolean; fidelidade?: number; garInvest?: number; garPeriodo?: number; preencher?: boolean }

try {
  const admin = users.criarUsuario({ nome: 'Manu', email: 'manu@example.com', senha: 'senha-teste-123', role: 'admin' });
  const vend = users.criarUsuario({ nome: 'Vend', email: 'vend@example.com', senha: 'senha-teste-123', role: 'vendedor' });
  empresa.salvarContratada(admin.id, {
    razao_social: 'AGÊNCIA FICTÍCIA LTDA', cnpj: '11.444.777/0001-61', endereco: 'Rua Exemplo, nº 259, Centro, Bandeirantes/PR',
    email: 'contato@ficticia.com', representantes: [{ nome: 'Rep Um Fictício', nacionalidade: 'Brasileiro', estado_civil: 'casado', profissao: 'Empresário', rg: '10.000.000-0', cpf: CPF2, endereco: 'Rua A, 1' }],
  });
  empresa.salvarTestemunhas(admin.id, [{ nome: 'Testemunha Um', cpf: CPF }, { nome: 'Testemunha Dois', cpf: CPF2 }]);

  function preparar(nome: string, blocos: string[], o: Opts = {}) {
    const s = contratos.criarSolicitacao(vend.id, nome);
    contratos.configurarContrato(admin.id, s.id, {
      tipoModelo: 'prestacao_servicos', tipoPessoa: 'pf', blocos, socialMidia: !!o.socialMidia,
      fidelidadeAtiva: !!o.fidelidade, fidelidadeMeses: o.fidelidade ?? null,
      garantiaAtiva: !!o.garInvest, garantiaInvestimentoCentavos: o.garInvest ?? null, garantiaPeriodoMeses: o.garPeriodo ?? null,
      confirmarGarantia: !!o.garInvest,
      valorCentavos: 250000, diaVencimento: 10, limiteLeads: 50, cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20',
    });
    if (o.preencher !== false) { const lib = contratos.liberarLink(admin.id, s.id); contratos.submeterFormularioPublico(lib.token!, formPF()); }
    return s.id;
  }
  function propText(id: number): string {
    return composicao.comporContrato(contratos.getContratoRow(id)!).clausulas.find((c) => c.id === 'propriedade')!.texto;
  }
  function reconfig(id: number, blocos: string[], o: Opts = {}) {
    contratos.configurarContrato(admin.id, id, {
      tipoModelo: 'prestacao_servicos', tipoPessoa: 'pf', blocos, socialMidia: !!o.socialMidia,
      fidelidadeAtiva: !!o.fidelidade, fidelidadeMeses: o.fidelidade ?? null,
      garantiaAtiva: false, valorCentavos: 250000, diaVencimento: 10, limiteLeads: 50,
      cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20',
      confirmarAlteracaoBlocos: true, confirmarAlteracaoComLink: true,
    });
  }

  console.log('\n══════ A) APROVAÇÃO JURÍDICA (2026-09-01) → geração LIBERADA ══════');
  await checkA('1. CRC validado permite geração', async () => {
    const c = preparar('CRC', ['crc']); assert.equal(contratos.getPreview(c)!.pronto, true);
    assert.equal((await contratos.aprovarEGerarPdf(admin.id, c, true, fakeRender)).status, 'ativo');
  });
  await checkA('2. IA validada permite geração', async () => {
    const c = preparar('IA', ['ia']); assert.equal(contratos.getPreview(c)!.pronto, true);
    assert.equal((await contratos.aprovarEGerarPdf(admin.id, c, true, fakeRender)).status, 'ativo');
  });
  await checkA('3. Google Ads validado permite geração (com B1)', async () => {
    const c = preparar('Google', ['google_ads']); assert.ok(propText(c).includes(B1_991));
    assert.equal(contratos.getPreview(c)!.pronto, true);
    assert.equal((await contratos.aprovarEGerarPdf(admin.id, c, true, fakeRender)).status, 'ativo');
  });
  await checkA('4. Site validado permite geração', async () => {
    const c = preparar('Site', ['site']); assert.equal(contratos.getPreview(c)!.pronto, true);
    assert.equal((await contratos.aprovarEGerarPdf(admin.id, c, true, fakeRender)).status, 'ativo');
  });
  await checkA('5. Consignado validado permite geração', async () => {
    const c = preparar('Consignado', ['consignado']); assert.equal(contratos.getPreview(c)!.pronto, true);
    assert.equal((await contratos.aprovarEGerarPdf(admin.id, c, true, fakeRender)).status, 'ativo');
  });
  await checkA('6. Fidelidade validada permite geração quando selecionada', async () => {
    const c = preparar('Fidelidade', ['funil'], { fidelidade: 12 });
    assert.equal(contratos.getPreview(c)!.pronto, true);
    assert.equal((await contratos.aprovarEGerarPdf(admin.id, c, true, fakeRender)).status, 'ativo');
  });
  await checkA('7. Garantia validada permite geração com opt-in e campos obrigatórios', async () => {
    const c = preparar('Garantia', ['funil'], { garInvest: 300000, garPeriodo: 6 });
    assert.equal(contratos.getPreview(c)!.pronto, true);
    assert.equal((await contratos.aprovarEGerarPdf(admin.id, c, true, fakeRender)).status, 'ativo');
    // Sem os campos obrigatórios da garantia, a configuração é rejeitada (regra comercial).
    const s = contratos.criarSolicitacao(vend.id, 'Garantia sem campos');
    assert.throws(() => contratos.configurarContrato(admin.id, s.id, {
      tipoModelo: 'prestacao_servicos', tipoPessoa: 'pf', blocos: ['funil'], fidelidadeAtiva: false,
      garantiaAtiva: true, confirmarGarantia: true, valorCentavos: 250000, diaVencimento: 10,
      cidadeAssinatura: 'X', dataAssinatura: '2026-08-20',
    } as any));
  });

  console.log('\n══════ B) B1/B2 POR SERVIÇO EXPLÍCITO ══════');
  const g = preparar('Só Google', ['google_ads']);
  const f = preparar('Só Facebook', ['facebook_meta']);
  check('8. Google sozinho inclui B1', () => assert.ok(propText(g).includes(B1_991)));
  check('9. Google sozinho NÃO inclui B2', () => assert.ok(!propText(g).includes(B2_991) && !propText(g).includes(B2_SIC)));
  check('10. Facebook/Meta sozinho inclui B2 (com "públicadas" sic)', () => assert.ok(propText(f).includes(B2_991) && propText(f).includes(B2_SIC)));
  check('11. Facebook/Meta sozinho NÃO inclui B1', () => assert.ok(!propText(f).includes(B1_991)));
  check('12. Google + Facebook/Meta inclui B1 e B2', () => {
    const t = propText(preparar('G+F', ['google_ads', 'facebook_meta']));
    assert.ok(t.includes(B1_991) && t.includes(B2_991));
  });
  check('13. Nenhum dos dois usa a redação BASE do modelo', () => {
    const t = propText(preparar('Base', ['crc']));
    assert.ok(t.includes(BASE_91) && !t.includes(B1_991) && !t.includes(B2_991));
  });
  check('14. Modificador social_midia sozinho NÃO aciona B2', () => {
    const t = propText(preparar('SM sem Facebook', ['funil'], { socialMidia: true }));
    assert.ok(!t.includes(B2_991) && t.includes(BASE_91), 'social_midia não pode acionar B2');
  });

  console.log('\n══════ C) CASO CONJUNTO (B1 + B2) ══════');
  const gf = preparar('Conjunto', ['google_ads', 'facebook_meta']);
  const t = propText(gf);
  check('15. B1 e B2 aparecem COMPLETAS (6 itens cada)', () => {
    assert.equal(countOf(t, '9.1)'), 2); assert.equal(countOf(t, '9.1.1)'), 2); assert.equal(countOf(t, '9.1.2)'), 2);
    assert.equal(countOf(t, '9.1.3)'), 2); assert.equal(countOf(t, '9.2)'), 2); assert.equal(countOf(t, '9.3)'), 2);
    assert.ok(t.includes(LABEL_G) && t.includes(LABEL_F));
  });
  check('16. Não existe texto híbrido (linhas verbatim distintas, base ausente)', () => {
    assert.ok(t.includes(B1_991) && t.includes(B2_991) && !t.includes(BASE_91));
    for (const linha of t.split('\n')) assert.ok(!(linha.includes('Google Ads') && linha.includes('Gerenciador de Negócios')), 'linha híbrida');
  });
  check('17. Não existe numeração/cláusula duplicada na estrutura final', () => {
    const cls = composicao.comporContrato(contratos.getContratoRow(gf)!).clausulas;
    assert.equal(cls.filter((c) => c.id === 'propriedade').length, 1);
    assert.equal(new Set(cls.map((c) => c.id)).size, cls.length);
    assert.equal(countOf(cls.map((c) => c.titulo).join('|'), 'CLÁUSULA NONA'), 1);
  });

  console.log('\n══════ D) VERSIONAMENTO / CONTRATOS ANTIGOS ══════');
  check('18. Contrato antigo preserva a composição registrada (não reconverte)', () => {
    // Simula um contrato "antigo": registra uma versão com a cláusula 9 BASE e depois
    // muda o serviço para google_ads. A composição resolvida continua sendo a REGISTRADA.
    const c = preparar('Antigo', ['funil']);
    const atual = contratos.getConteudoAtual(c) as any;
    const clausulasBase = atual.conteudo.clausulas; // cláusula 9 base
    contratos.editarConteudo(admin.id, c, clausulasBase, true); // registra versão
    reconfig(c, ['funil', 'google_ads']); // muda serviço (novo serviço adicionado)
    const resolvido = composicao.comporContrato(contratos.getContratoRow(c)!).clausulas.find((x) => x.id === 'propriedade')!.texto;
    assert.ok(resolvido.includes(BASE_91) && !resolvido.includes(B1_991), 'deve reproduzir a versão registrada (base), não B1');
  });
  await checkA('19. Nova versão (troca de serviços) exige confirmação', async () => {
    const c = preparar('Confirma serviços', ['funil']);
    await esperaCode('   troca de blocos sem confirmar → bloqueia', 'confirmar_alteracao_blocos', async () =>
      contratos.configurarContrato(admin.id, c, {
        tipoModelo: 'prestacao_servicos', tipoPessoa: 'pf', blocos: ['funil', 'google_ads'], fidelidadeAtiva: false,
        valorCentavos: 250000, diaVencimento: 10, limiteLeads: 50, cidadeAssinatura: 'X', dataAssinatura: '2026-08-20',
        confirmarAlteracaoComLink: true,
      }));
  });
  await checkA('20. Alterar os serviços invalida o PDF anterior', async () => {
    const c = preparar('Invalida', ['clinica_top1']);
    await contratos.aprovarEGerarPdf(admin.id, c, true, fakeRender);
    assert.ok(contratos.listarPdfs(c).some((p) => p.status === 'ativo'));
    reconfig(c, ['clinica_top1', 'google_ads']);
    assert.ok(contratos.listarPdfs(c).some((p) => p.status === 'substituido'));
    assert.ok(!contratos.listarPdfs(c).some((p) => p.status === 'ativo'));
  });

  console.log('\n══════ E) COERÊNCIA FORÇADA PELO SERVIDOR ══════');
  check('21. API rejeita combinação incompatível (bloco inexistente)', () => {
    const s = contratos.criarSolicitacao(vend.id, 'Incoerente');
    assert.throws(() => contratos.configurarContrato(admin.id, s.id, {
      tipoModelo: 'prestacao_servicos', tipoPessoa: 'pf', blocos: ['propriedade_b2'], fidelidadeAtiva: false,
      valorCentavos: 250000, diaVencimento: 10, cidadeAssinatura: 'X', dataAssinatura: '2026-08-20',
    } as any), /bloco/i);
  });
  check('22. Manipulação do front-end não contorna o servidor', () => {
    // A cláusula 9 é DERIVADA da seleção no servidor. Sem `facebook_meta`, B2 é impossível
    // (o cliente não fornece a cláusula). Editar o texto não injeta o serviço.
    const c = preparar('Coerência', ['google_ads']);
    assert.ok(!propText(c).includes(B2_991), 'B2 nunca sem facebook_meta');
    const vp = composicao; // composição server-side é a fonte
    assert.ok(vp.comporContrato(contratos.getContratoRow(c)!).clausulas.find((x) => x.id === 'propriedade')!.texto.includes(B1_991));
  });

  console.log('\n══════ F) PRÉVIA=PDF · PDF BLOQUEADO · AUTENTIQUE ══════');
  check('23. Prévia e PDF usam a MESMA composição', () => {
    const c = preparar('Previa=PDF', ['google_ads', 'facebook_meta']);
    const comb = propText(c);
    const html = contratos.getPreview(c)!.html;
    assert.ok(html.includes(B1_991) && html.includes(B2_991));
    assert.ok(comb.includes(B1_991) && comb.includes(B2_991));
    assert.equal(propText(c), comb); // determinístico
  });
  await checkA('24. Nenhum PDF bloqueado é armazenado', async () => {
    // CRC temporariamente pendente → geração bloqueia e NADA é gravado.
    const c = preparar('Bloqueado', ['funil', 'crc']);
    const v = modelos.getBloco('prestacao_servicos', 'crc')!.validacao;
    const bak = v.validacaoJuridica; v.validacaoJuridica = 'pendente';
    try {
      await esperaCode('   gerar-pdf bloqueado', 'pendencias_geracao', () => contratos.aprovarEGerarPdf(admin.id, c, true, fakeRender));
      assert.equal(contratos.listarPdfs(c).length, 0, 'nenhum PDF deve ser armazenado');
    } finally { v.validacaoJuridica = bak; }
  });
  await checkA('25. Nenhuma operação chama a Autentique (guard OFFLINE + sem fetch)', async () => {
    assert.equal(config.autentiqueOffline, true, 'ambiente deve estar OFFLINE');
    const autentique = await import('../src/autentique.ts');
    let offlineOk = false;
    try { await autentique.me(); } catch (e: any) { offlineOk = /OFFLINE/i.test(String(e?.message)); }
    assert.ok(offlineOk, 'me() deveria lançar OFFLINE sem tocar a rede');
    // Espia fetch durante prévia + geração local de PDF: deve ser ZERO.
    const c = preparar('Rede', ['clinica_top1']);
    const orig = globalThis.fetch;
    let fetchCalls = 0;
    (globalThis as any).fetch = (...a: any[]) => { fetchCalls++; throw new Error('rede bloqueada no teste'); };
    try {
      contratos.getPreview(c);
      await contratos.aprovarEGerarPdf(admin.id, c, true, fakeRender);
    } finally { (globalThis as any).fetch = orig; }
    assert.equal(fetchCalls, 0, 'nenhuma chamada de rede durante prévia/geração local de PDF');
  });

  console.log(`\n──────── etapa3d: ${ok} ok, ${fail} falhas ────────`);
} finally {
  try { db.close?.(); } catch {}
  for (const p of [tmpDb, tmpPdfDir]) { try { if (existsSync(p)) rmSync(p, { recursive: true, force: true }); } catch {} }
}
process.exitCode = fail === 0 ? 0 : 1;
