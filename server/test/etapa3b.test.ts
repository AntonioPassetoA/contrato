// Testes das DECISÕES da Etapa 3 (parte 2), isolados em banco/PDF temporários e chave
// de criptografia FICTÍCIA. Cobrem: controle em dois níveis (fonte conferida vs. validação
// jurídica), limite de leads do CRC, separação google_ads/site, Social Mídia como
// modificador do Funil, fidelidade (2.2/8.4/8.5) e sua ausência, garantia como opt-in
// separado com confirmação, bloqueios de PDF por fonte e por jurídico, impossibilidade de
// burlar a validação pelo editor, prévia mesmo com geração bloqueada, e a neutralização
// dos e-mails (falha segura de ADMIN_EMAIL em produção). Render de PDF FAKE (sem Puppeteer).
// Rode: npx tsx --test server/test/etapa3b.test.ts
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { rmSync } from 'node:fs';
import assert from 'node:assert/strict';

const tmpDb = resolve(tmpdir(), `contratos-3b-${process.pid}.sqlite`);
const tmpPdfDir = resolve(tmpdir(), `contratos-3b-pdfs-${process.pid}`);
process.env.CONTRATOS_DB_PATH = tmpDb;
process.env.CONTRATOS_PDF_DIR = tmpPdfDir;
process.env.AUTENTIQUE_TOKEN ??= 'test-token';
process.env.ADMIN_PASSWORD ??= 'test-admin-pass';
process.env.SESSION_SECRET ??= 'test-session-secret';
process.env.DATA_ENCRYPTION_KEY = 'chave-ficticia-isolada-para-testes-3b';

let ok = 0, fail = 0;
function check(nome: string, fn: () => void) {
  try { fn(); ok++; console.log(`  ✓ ${nome}`); }
  catch (e: any) { fail++; console.log(`  ✗ ${nome}\n      ${e?.message ?? e}`); }
}
function esperaErro(nome: string, re: RegExp, fn: () => unknown) {
  try { fn(); fail++; console.log(`  ✗ ${nome} (não lançou)`); }
  catch (e: any) { if (re.test(String(e?.message ?? e))) { ok++; console.log(`  ✓ ${nome}`); } else { fail++; console.log(`  ✗ ${nome}: msg '${e?.message}'`); } }
}
function esperaCode(nome: string, code: string, fn: () => unknown) {
  try { fn(); fail++; console.log(`  ✗ ${nome} (esperava code '${code}')`); }
  catch (e: any) { if (e?.code === code) { ok++; console.log(`  ✓ ${nome}`); } else { fail++; console.log(`  ✗ ${nome}: veio '${e?.code}' (${e?.message})`); } }
}
async function esperaCodeAsync(nome: string, code: string, fn: () => Promise<unknown>) {
  try { await fn(); fail++; console.log(`  ✗ ${nome} (esperava '${code}', passou)`); }
  catch (e: any) { if (e?.code === code) { ok++; console.log(`  ✓ ${nome}`); } else { fail++; console.log(`  ✗ ${nome}: veio '${e?.code}' (${e?.message})`); } }
}

const { db } = await import('../src/db.ts');
const users = await import('../src/users.ts');
const contratos = await import('../src/contratos.ts');
const empresa = await import('../src/configEmpresa.ts');
const audit = await import('../src/audit.ts');
const composicao = await import('../src/composicaoContrato.ts');
const modelos = await import('../src/modelos.ts');
const cfg = await import('../src/config.ts');

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
function baseInput(over: Partial<any> = {}) {
  return {
    tipoModelo: MODELO, tipoPessoa: 'pf', blocos: ['funil'], fidelidadeAtiva: false,
    valorCentavos: 220000, diaVencimento: 10, limiteLeads: null,
    cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20', ...over,
  };
}

try {
  const admin = users.criarUsuario({ nome: 'Manu', email: 'manu@example.com', senha: 'senha-teste-123', role: 'admin' });
  const vend = users.criarUsuario({ nome: 'Vend', email: 'vend@example.com', senha: 'senha-teste-123', role: 'vendedor' });
  empresa.salvarContratada(admin.id, {
    razao_social: 'AGÊNCIA FICTÍCIA LTDA', cnpj: '11.444.777/0001-61', endereco: 'Rua Exemplo, nº 259, Centro, Bandeirantes/PR',
    email: 'contato@ficticia.com', representantes: [{ nome: 'Rep Um Fictício', cpf: CPF2, endereco: 'Rua A, 1' }],
  });
  empresa.salvarTestemunhas(admin.id, [{ nome: 'Testemunha Um', cpf: CPF }, { nome: 'Testemunha Dois', cpf: CPF2 }]);

  function novo(nome: string) { return contratos.criarSolicitacao(vend.id, nome).id; }
  function comp(id: number) { return composicao.comporContrato(contratos.getContratoRow(id)!); }
  function objetoTexto(id: number) { return comp(id).clausulas.find((c) => c.id === 'objeto')!.texto; }

  console.log('\n[1] CRC — limite mensal de leads obrigatório, sem default, sem zero/negativo');
  const c1 = novo('Clínica CRC');
  esperaErro('CRC sem limite → bloqueia', /limite mensal de leads/i, () =>
    contratos.configurarContrato(admin.id, c1, baseInput({ blocos: ['funil', 'crc'], limiteLeads: null })));
  esperaErro('CRC com zero → bloqueia', /limite mensal de leads/i, () =>
    contratos.configurarContrato(admin.id, c1, baseInput({ blocos: ['funil', 'crc'], limiteLeads: 0 })));
  esperaErro('CRC com negativo → bloqueia', /limite mensal de leads/i, () =>
    contratos.configurarContrato(admin.id, c1, baseInput({ blocos: ['funil', 'crc'], limiteLeads: -5 })));
  contratos.configurarContrato(admin.id, c1, baseInput({ blocos: ['funil', 'crc'], limiteLeads: 80 }));
  check('valor do limite entra nos DOIS pontos da cláusula do CRC', () => {
    const t = objetoTexto(c1);
    assert.ok(t.includes('de até 80 leads novos por mês'), 'esperava "de até 80"');
    assert.ok(t.includes('limitado a 80 leads novos por mês'), 'esperava "limitado a 80"');
  });
  check('alteração do limite de leads é auditada', () => {
    contratos.configurarContrato(admin.id, c1, baseInput({ blocos: ['funil', 'crc'], limiteLeads: 120, confirmarAlteracaoBlocos: true }));
    const logs = audit.getAuditDoContrato(c1) as any[];
    assert.ok(logs.some((l) => l.acao === 'contrato_config_alterada' && l.campo === 'limite_leads' && String(l.valor_depois) === '120'));
  });

  console.log('\n[2] Google Ads e Site — selecionáveis de forma independente');
  const cGA = novo('Só Google Ads'); const cSite = novo('Só Site'); const cAmbos = novo('Google + Site');
  check('somente Google Ads configura', () => {
    const v = contratos.configurarContrato(admin.id, cGA, baseInput({ blocos: ['google_ads'] }));
    assert.equal(v.configurado, true);
    assert.ok(objetoTexto(cGA).includes('veiculação no Google'));
  });
  check('somente Site configura', () => {
    const v = contratos.configurarContrato(admin.id, cSite, baseInput({ blocos: ['site'] }));
    assert.equal(v.configurado, true);
    assert.ok(objetoTexto(cSite).includes('Criação de Site Profissional'));
  });
  check('Google Ads + Site juntos configuram', () => {
    const v = contratos.configurarContrato(admin.id, cAmbos, baseInput({ blocos: ['google_ads', 'site'] }));
    assert.equal(v.configurado, true);
    const t = objetoTexto(cAmbos);
    assert.ok(t.includes('veiculação no Google') && t.includes('Criação de Site Profissional'));
  });

  console.log('\n[3] Social Mídia — modificador do Funil (não é bloco autônomo)');
  const cSM = novo('Social Mídia');
  esperaErro('Social Mídia sem Funil → bloqueia', /Funil/i, () =>
    contratos.configurarContrato(admin.id, cSM, baseInput({ blocos: ['ia'], socialMidia: true })));
  contratos.configurarContrato(admin.id, cSM, baseInput({ blocos: ['funil'], socialMidia: true }));
  check('com Funil: adiciona "vídeos" e o item de conteúdos educacionais (verbatim da fonte)', () => {
    const t = objetoTexto(cSM);
    assert.ok(t.includes('imagens, vídeos ou textos'), 'esperava "imagens, vídeos ou textos"');
    assert.ok(t.includes('Criação de conteúdos educacionais e postagem nas mídias sociais'), 'esperava item de conteúdos educacionais');
  });
  check('sem Social Mídia: NÃO inclui vídeos nem conteúdos educacionais', () => {
    const cN = novo('Funil puro');
    contratos.configurarContrato(admin.id, cN, baseInput({ blocos: ['funil'] }));
    const t = objetoTexto(cN);
    assert.ok(!t.includes('imagens, vídeos ou textos'));
    assert.ok(!t.includes('Criação de conteúdos educacionais'));
  });

  console.log('\n[4] Fidelidade — insere 2.2, 8.4 e 8.5 juntas; ausente quando desativada');
  const cFid = novo('Com Fidelidade');
  contratos.configurarContrato(admin.id, cFid, baseInput({ fidelidadeAtiva: true, fidelidadeMeses: 6 }));
  check('cláusula de fidelidade contém 2.2, 8.4 e 8.5', () => {
    const cl = comp(cFid).clausulas.find((c) => c.id === 'fidelidade');
    assert.ok(cl, 'esperava cláusula de fidelidade');
    assert.ok(cl!.texto.includes('2.2)') && cl!.texto.includes('8.4)') && cl!.texto.includes('8.5)'));
    assert.ok(cl!.texto.includes('período mínimo de 6 (seis) meses'), 'esperava meses por extenso');
  });
  esperaErro('fidelidade com zero meses → bloqueia', /meses de fidelidade/i, () =>
    contratos.configurarContrato(admin.id, cFid, baseInput({ fidelidadeAtiva: true, fidelidadeMeses: 0, confirmarAlteracaoComLink: true })));
  check('sem fidelidade: NENHUMA das três cláusulas é incluída', () => {
    const cN = novo('Sem Fidelidade');
    contratos.configurarContrato(admin.id, cN, baseInput({ fidelidadeAtiva: false }));
    assert.ok(!comp(cN).clausulas.some((c) => c.id === 'fidelidade'));
  });

  console.log('\n[5] Garantia — opt-in separado, nunca padrão, com confirmação e variáveis');
  const cG = novo('Com Garantia');
  check('contrato novo: garantia DESMARCADA por padrão', () => {
    contratos.configurarContrato(admin.id, cG, baseInput({}));
    assert.equal(contratos.getConfigParaAdmin(cG)!.garantia.ativo, false);
    assert.ok(!comp(cG).clausulas.some((c) => c.id === 'garantia'));
  });
  esperaCode('ativar garantia sem confirmação → confirmar_garantia', 'confirmar_garantia', () =>
    contratos.configurarContrato(admin.id, cG, baseInput({ garantiaAtiva: true, garantiaInvestimentoCentavos: 100000, garantiaPeriodoMeses: 6, confirmarAlteracaoComLink: true })));
  esperaErro('garantia sem investimento → bloqueia', /investimento mínimo/i, () =>
    contratos.configurarContrato(admin.id, cG, baseInput({ garantiaAtiva: true, garantiaInvestimentoCentavos: 0, garantiaPeriodoMeses: 6, confirmarGarantia: true, confirmarAlteracaoComLink: true })));
  contratos.configurarContrato(admin.id, cG, baseInput({ garantiaAtiva: true, garantiaInvestimentoCentavos: 100000, garantiaPeriodoMeses: 6, confirmarGarantia: true, confirmarAlteracaoComLink: true }));
  check('garantia ativada insere a cláusula "DA GARANTIA" com variáveis e é auditada', () => {
    const cl = comp(cG).clausulas.find((c) => c.id === 'garantia');
    assert.ok(cl, 'esperava cláusula de garantia');
    assert.ok(cl!.texto.includes('garantia de resultados'));
    assert.ok(cl!.texto.includes('R$ 1.000,00') || cl!.texto.includes('R$ 1.000,00'), 'esperava investimento formatado');
    assert.ok(cl!.texto.includes('período inicial de 6 (seis) meses'), 'esperava período por extenso');
    const logs = audit.getAuditDoContrato(cG) as any[];
    assert.ok(logs.some((l) => l.acao === 'garantia_ativada'));
  });

  console.log('\n[6] Bloqueio de PDF — fonte incompleta vs. validação jurídica pendente');
  function prepararGerando(id: number) {
    const lib = contratos.liberarLink(admin.id, id);
    contratos.submeterFormularioPublico(lib.token!, formPF());
  }
  // (a) IA VALIDADA (aprovação jurídica 2026-09-01) → NÃO bloqueia mais por jurídica.
  const cJur = novo('IA Validada');
  contratos.configurarContrato(admin.id, cJur, baseInput({ blocos: ['ia'] }));
  prepararGerando(cJur);
  check('IA validada: pronto=true e SEM pendência de validação jurídica', () => {
    const prev = contratos.getPreview(cJur)!;
    assert.equal(prev.pronto, true);
    assert.ok(!prev.pendencias.some((p) => /validação jurídica/i.test(p)), 'IA validada não deve bloquear');
  });

  // (b) fonte incompleta: simula um bloco com fonteConferida=false (mutação do registro).
  const bIA = modelos.getBloco(MODELO, 'ia')!;
  const backup = { ...bIA.validacao };
  bIA.validacao.fonteConferida = false;
  check('fonte não conferida: pendência cita "não conferida integralmente"', () => {
    const c = contratos.getContratoRow(cJur)!;
    const p = composicao.pendenciasParaGeracao(c, contratos.pendenciasContrato);
    assert.ok(p.some((x) => /não conferida integralmente/i.test(x)), 'esperava pendência de fonte');
  });
  bIA.validacao.fonteConferida = backup.fonteConferida; // restaura

  console.log('\n[7] Prévia continua disponível mesmo com a geração BLOQUEADA');
  // Coloca IA temporariamente pendente só para produzir um estado bloqueado e conferir
  // que a prévia (HTML) continua saindo. Restaura em seguida.
  {
    const vIA = modelos.getBloco(MODELO, 'ia')!.validacao;
    const bak = vIA.validacaoJuridica; vIA.validacaoJuridica = 'pendente';
    try {
      check('preview retorna HTML integral mesmo com pendências', () => {
        const prev = contratos.getPreview(cJur)!;
        assert.equal(prev.pronto, false);
        assert.ok(prev.pendencias.length > 0);
        assert.ok(prev.html.includes('Contrato de Prestação de Serviços') && prev.html.length > 500, 'prévia deve conter o HTML');
      });
    } finally { vIA.validacaoJuridica = bak; }
  }

  console.log('\n[8] Editor NÃO pode validar/contornar o bloqueio de um bloco');
  const cEd = novo('Editor Burla');
  contratos.configurarContrato(admin.id, cEd, baseInput({ blocos: ['funil', 'crc'], limiteLeads: 50 }));
  prepararGerando(cEd);
  const atual = contratos.getConteudoAtual(cEd) as any;
  // Tenta "resolver" reescrevendo todo o texto das cláusulas manualmente.
  const mexido = atual.conteudo.clausulas.map((cl: any) => ({ ...cl, texto: 'Texto inserido manualmente pela administração.' }));
  contratos.editarConteudo(admin.id, cEd, mexido, true);
  // CRC temporariamente pendente para provar que a edição no editor não contorna o gate.
  {
    const vCrc = modelos.getBloco(MODELO, 'crc')!.validacao;
    const bak = vCrc.validacaoJuridica; vCrc.validacaoJuridica = 'pendente';
    try {
      check('mesmo reescrevendo o texto, o BLOCO CRC pendente continua bloqueando (registro é a fonte)', () => {
        const c = contratos.getContratoRow(cEd)!;
        const p = composicao.pendenciasParaGeracao(c, contratos.pendenciasContrato);
        assert.ok(p.some((x) => /validação jurídica/i.test(x) && /CRC/i.test(x)));
      });
      await esperaCodeAsync('gerar-pdf continua bloqueado após burla no editor', 'pendencias_geracao', () => contratos.aprovarEGerarPdf(admin.id, cEd, true, fakeRender));
    } finally { vCrc.validacaoJuridica = bak; }
  }

  console.log('\n[9] E-mails neutralizados e FALHA SEGURA de ADMIN_EMAIL em produção');
  // O default REALISTA foi removido do código: o fallback do código é sempre example.com
  // (o valor efetivo em runtime pode vir do .env do ambiente, que é gitignored e não é código).
  check('código não tem default realista — fallback é example.com (dev/test, sem ADMIN_EMAIL)', () => {
    assert.equal(cfg.resolveAdminEmail('development', undefined), 'admin@example.com');
    assert.equal(cfg.resolveAdminEmail('test', ''), 'admin@example.com');
  });
  esperaErro('produção: ADMIN_EMAIL ausente → falha segura (mensagem genérica)', /Configuração administrativa inválida/i, () =>
    cfg.resolveAdminEmail('production', undefined));
  esperaErro('produção: ADMIN_EMAIL inválido → falha segura', /Configuração administrativa inválida/i, () =>
    cfg.resolveAdminEmail('production', 'nao-e-email'));
  check('produção: ADMIN_EMAIL válido é aceito', () => {
    assert.equal(cfg.resolveAdminEmail('production', 'Admin@Empresa.com'), 'admin@empresa.com');
  });
  check('mensagem de falha NÃO revela o nome da variável ADMIN_EMAIL', () => {
    try { cfg.resolveAdminEmail('production', ''); assert.fail('deveria lançar'); }
    catch (e: any) { assert.ok(!/ADMIN_EMAIL/.test(String(e?.message))); }
  });

  console.log('\n[10] Contrato base (Funil validado) continua GERANDO normalmente');
  const cBase = novo('Base Funil');
  contratos.configurarContrato(admin.id, cBase, baseInput({ blocos: ['funil'] }));
  prepararGerando(cBase);
  check('Funil (fonte + jurídico) → sem pendências e PDF gera', () => {
    assert.equal(contratos.getPreview(cBase)!.pronto, true);
  });
  const pdfBase = await contratos.aprovarEGerarPdf(admin.id, cBase, true, fakeRender);
  check('PDF gerado do contrato base', () => assert.equal(pdfBase.versaoPdf, 1));

  console.log(`\n================ RESULTADO: ${ok} ok, ${fail} falhas ================\n`);
} finally {
  try {
    rmSync(tmpDb, { force: true }); rmSync(tmpDb + '-wal', { force: true }); rmSync(tmpDb + '-shm', { force: true });
    rmSync(tmpPdfDir, { recursive: true, force: true });
  } catch {}
}

process.exit(fail === 0 ? 0 : 1);
