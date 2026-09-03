// Testes da Etapa 3 (composição + PDF), isolados em banco temporário, diretório de
// PDF temporário e CHAVE DE CRIPTOGRAFIA FICTÍCIA. Usa um render de PDF FAKE (injetado)
// para validar composição, bloqueios, aprovação obrigatória, hash, versionamento e
// ausência de PII nos logs — sem depender do Puppeteer. A verificação VISUAL dos PDFs
// reais fica no script server/test/etapa3-amostra.ts.
// Rode: npx tsx server/test/etapa3.test.ts
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { rmSync, existsSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const tmpDb = resolve(tmpdir(), `contratos-3-${process.pid}.sqlite`);
const tmpPdfDir = resolve(tmpdir(), `contratos-3-pdfs-${process.pid}`);
process.env.CONTRATOS_DB_PATH = tmpDb;
process.env.CONTRATOS_PDF_DIR = tmpPdfDir;
process.env.AUTENTIQUE_TOKEN ??= 'test-token';
process.env.ADMIN_PASSWORD ??= 'test-admin-pass';
process.env.SESSION_SECRET ??= 'test-session-secret';
process.env.DATA_ENCRYPTION_KEY = 'chave-ficticia-isolada-para-testes-3'; // fictícia e isolada

let ok = 0, fail = 0;
function check(nome: string, fn: () => void | Promise<void>) {
  try { const r = fn() as any; if (r?.then) return r.then(() => { ok++; console.log(`  ✓ ${nome}`); }, (e: any) => { fail++; console.log(`  ✗ ${nome}\n      ${e?.message ?? e}`); }); ok++; console.log(`  ✓ ${nome}`); }
  catch (e: any) { fail++; console.log(`  ✗ ${nome}\n      ${e?.message ?? e}`); }
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
const pdfContrato = await import('../src/pdfContrato.ts');
const modelos = await import('../src/modelos.ts');

// Ajuste temporário do registro (validado ⇄ pendente) para exercitar o GATE jurídico
// mesmo com todos os blocos aprovados por padrão. Restaura sempre no finally.
async function comBlocoJuridicoPendente(blocoId: string, fn: () => Promise<void> | void) {
  const v = modelos.getBloco('prestacao_servicos', blocoId)!.validacao;
  const bak = v.validacaoJuridica; v.validacaoJuridica = 'pendente';
  try { await fn(); } finally { v.validacaoJuridica = bak; }
}

// Render FAKE: não usa Puppeteer. Buffer determinístico a partir do tamanho do HTML.
const fakeRender = async (html: string, footer: string): Promise<Buffer> =>
  Buffer.from(`%PDF-1.4 fake render html=${html.length} footer=${footer.length}\n%%EOF`);

const CPF = '390.533.447-05';
const CPF2 = '111.444.777-35';
function endereco(p: string) {
  return { [`${p}cep`]: '86360-000', [`${p}logradouro`]: 'Rua das Flores', [`${p}numero`]: '123', [`${p}bairro`]: 'Centro', [`${p}municipio`]: 'Bandeirantes', [`${p}estado`]: 'Paraná' } as Record<string, string>;
}
function formPF(nome = 'João Cliente Fictício') {
  return { nome, nacionalidade: 'Brasileiro(a)', estado_civil: 'solteiro(a)', profissao: 'Dentista', rg: '12.345.678-9', rg_orgao: 'SSP/PR', cpf: CPF, telefone: '(43) 99999-0000', email: 'joao@example.com', ...endereco('res_') };
}
function formPJ(razao = 'Clínica Sorriso LTDA') {
  return {
    razao_social: razao, nome_fantasia: 'Sorriso Odonto', cnpj: '11.222.333/0001-81', ...endereco('sede_'),
    nome: 'Maria Representante', nacionalidade: 'Brasileira', estado_civil: 'casado(a)', profissao: 'Empresária',
    rg: '98.765.432-1', rg_orgao: 'SSP/PR', cpf: CPF2, telefone: '(43) 98888-1111', email: 'maria@sorriso.com', ...endereco('res_'),
  };
}
function configurarPF(admin: number, id: number, blocos: string[] = ['funil']) {
  contratos.configurarContrato(admin, id, {
    tipoModelo: 'prestacao_servicos', tipoPessoa: 'pf', blocos, fidelidadeAtiva: false,
    valorCentavos: 250000, diaVencimento: 10, limiteLeads: 50, cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20',
  });
}

try {
  const admin = users.criarUsuario({ nome: 'Manu', email: 'manu@example.com', senha: 'senha-teste-123', role: 'admin' });
  const vend = users.criarUsuario({ nome: 'Vend', email: 'vend@example.com', senha: 'senha-teste-123', role: 'vendedor' });

  console.log('\n[1] Bloqueio por CONFIGURAÇÃO ADMINISTRATIVA incompleta (empresa vazia)');
  const s0 = contratos.criarSolicitacao(vend.id, 'Clínica Sem Empresa');
  configurarPF(admin.id, s0.id);
  check('pendências incluem CONTRATADA quando empresa não configurada', () => {
    const c = contratos.getContratoRow(s0.id)!;
    const pend = composicao.pendenciasParaGeracao(c, contratos.pendenciasContrato);
    assert.ok(pend.some((p) => /CONTRATADA/i.test(p)), 'esperava pendência de CONTRATADA');
    assert.ok(pend.some((p) => /testemunhas/i.test(p)), 'esperava pendência de testemunhas');
  });

  // Configura a empresa (dados FICTÍCIOS) para os próximos casos.
  empresa.salvarContratada(admin.id, {
    razao_social: 'AGÊNCIA FICTÍCIA LTDA', cnpj: '11.444.777/0001-61', endereco: 'Rua Exemplo, nº 259, Centro, Bandeirantes/PR',
    email: 'contato@ficticia.com', representantes: [{ nome: 'Rep Um Fictício', nacionalidade: 'Brasileiro', estado_civil: 'casado', profissao: 'Empresário', rg: '10.000.000-0', cpf: CPF2, endereco: 'Rua A, 1' }],
  });
  empresa.salvarTestemunhas(admin.id, [{ nome: 'Testemunha Um', cpf: CPF }, { nome: 'Testemunha Dois', cpf: CPF2 }]);

  function prepararPF(nome: string, blocos: string[] = ['funil'], preencher = true) {
    const s = contratos.criarSolicitacao(vend.id, nome);
    configurarPF(admin.id, s.id, blocos);
    const lib = contratos.liberarLink(admin.id, s.id);
    if (preencher) contratos.submeterFormularioPublico(lib.token!, formPF());
    return { id: s.id, token: lib.token! };
  }

  console.log('\n[2] Composição PF — cabeçalho + cláusulas verbatim (funil), sem placeholder');
  const pf = prepararPF('Clínica PF');
  const compPF = composicao.comporContrato(contratos.getContratoRow(pf.id)!);
  check('CONTRATANTE traz qualificação do cliente (nome + CPF)', () => {
    assert.ok(compPF.contratante.includes('João Cliente Fictício'));
    assert.ok(compPF.contratante.includes(CPF));
    assert.ok(compPF.contratante.includes('portador da Cédula de Identidade RG'));
  });
  check('CONTRATADA traz dados da configEmpresa (fictícios)', () => {
    assert.ok(compPF.contratada.includes('AGÊNCIA FICTÍCIA LTDA'));
    assert.ok(compPF.contratada.includes('11.444.777/0001-61'));
  });
  check('cláusulas incluem o Funil verbatim e valor por extenso', () => {
    const objeto = compPF.clausulas.find((c) => c.id === 'objeto')!;
    assert.ok(objeto.texto.includes('Funil de Captação de Leads'));
    const pgto = compPF.clausulas.find((c) => c.id === 'pagamento')!;
    assert.ok(pgto.texto.includes('R$') && /quinhentos/i.test(pgto.texto), 'esperava valor formatado + por extenso');
  });
  check('sem marcador de pendência e PRONTO para gerar', () => {
    const c = contratos.getContratoRow(pf.id)!;
    assert.ok(!composicao.comporContrato(c).clausulas.some((cl) => cl.texto.includes(pdfContratoMark())));
    assert.equal(composicao.pendenciasParaGeracao(c, contratos.pendenciasContrato).length, 0);
  });

  console.log('\n[3] Composição PJ — cabeçalho da empresa + representante');
  const s = contratos.criarSolicitacao(vend.id, 'Clínica PJ');
  contratos.configurarContrato(admin.id, s.id, {
    tipoModelo: 'prestacao_servicos', tipoPessoa: 'pj', blocos: ['funil', 'clinica_top1'], fidelidadeAtiva: false,
    valorCentavos: 300000, diaVencimento: 5, limiteLeads: 30, cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20',
  });
  const libPj = contratos.liberarLink(admin.id, s.id);
  contratos.submeterFormularioPublico(libPj.token!, formPJ());
  const compPJ = composicao.comporContrato(contratos.getContratoRow(s.id)!);
  check('CONTRATANTE PJ: razão social + nome fantasia + representante', () => {
    assert.ok(compPJ.contratante.includes('Clínica Sorriso LTDA'));
    assert.ok(compPJ.contratante.includes('nome fantasia Sorriso Odonto'));
    assert.ok(compPJ.contratante.includes('representada por Maria Representante'));
    assert.ok(compPJ.contratante.includes('11.222.333/0001-81'));
  });
  check('cláusulas PJ incluem funil e clinica_top1', () => {
    const objeto = compPJ.clausulas.find((c) => c.id === 'objeto')!;
    assert.ok(objeto.texto.includes('Funil de Captação de Leads'));
    assert.ok(objeto.texto.includes('Clínica Top 1'));
  });

  console.log('\n[4] CRC VALIDADO (aprovação jurídica 2026-09-01) NÃO bloqueia a geração');
  const pend = prepararPF('Clínica CRC Validado', ['funil', 'crc']);
  check('preview.pronto=true e SEM pendência de validação jurídica (CRC)', () => {
    const prev = contratos.getPreview(pend.id)!;
    assert.equal(prev.pronto, true);
    assert.ok(!prev.pendencias.some((p) => /validação jurídica/i.test(p)), 'CRC validado não deve gerar pendência jurídica');
  });

  console.log('\n[5] Fidelidade VALIDADA permite a geração quando selecionada');
  const sf = contratos.criarSolicitacao(vend.id, 'Clínica Fidelidade');
  contratos.configurarContrato(admin.id, sf.id, {
    tipoModelo: 'prestacao_servicos', tipoPessoa: 'pf', blocos: ['funil'], fidelidadeAtiva: true, fidelidadeMeses: 12,
    valorCentavos: 200000, diaVencimento: 10, limiteLeads: 20, cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20',
  });
  const libf = contratos.liberarLink(admin.id, sf.id);
  contratos.submeterFormularioPublico(libf.token!, formPF());
  check('fidelidade validada: pronto=true, sem pendência jurídica de fidelidade', () => {
    const prev = contratos.getPreview(sf.id)!;
    assert.equal(prev.pronto, true);
    assert.ok(!prev.pendencias.some((p) => /fidelidade/i.test(p)), 'fidelidade validada não deve bloquear');
  });

  console.log('\n[6] Bloqueio: dados do cliente ausentes (formulário não preenchido)');
  const semDados = prepararPF('Clínica Sem Dados', ['funil'], false);
  check('pendência de dados do cliente', () => {
    const c = contratos.getContratoRow(semDados.id)!;
    const p = composicao.pendenciasParaGeracao(c, contratos.pendenciasContrato);
    assert.ok(p.some((x) => /Dados do cliente|Dados obrigatórios/i.test(x)));
  });

  console.log('\n[7] Aprovação OBRIGATÓRIA e geração do PDF');
  await esperaCodeAsync('sem confirmar → bloqueia', 'confirmar_geracao', () => contratos.aprovarEGerarPdf(admin.id, pf.id, false, fakeRender));
  const pdf1 = await contratos.aprovarEGerarPdf(admin.id, pf.id, true, fakeRender);
  check('PDF gerado: hash conteúdo (64 hex) + hash arquivo + versaoPdf=1', () => {
    assert.match(pdf1.hashConteudo, /^[a-f0-9]{64}$/);
    assert.match(pdf1.hashArquivo, /^[a-f0-9]{64}$/);
    assert.equal(pdf1.versaoPdf, 1);
    assert.equal(pdf1.status, 'ativo');
  });
  check('contrato passou para aprovado e registrou pdf_path', () => {
    const c = contratos.getContratoRow(pf.id)!;
    assert.equal(c.status, 'aprovado');
    assert.ok(c.pdf_path && existsSync(c.pdf_path), 'arquivo do PDF deve existir em disco');
  });
  check('arquivo fica no diretório NÃO público isolado', () => {
    const c = contratos.getContratoRow(pf.id)!;
    assert.ok(c.pdf_path!.startsWith(tmpPdfDir), 'PDF fora do diretório configurado');
  });
  check('download do PDF (admin) retorna buffer', () => {
    const arq = contratos.lerPdf(pf.id)!;
    assert.ok(arq && arq.buffer.length > 0);
    assert.ok(arq.buffer.toString().startsWith('%PDF'));
  });

  console.log('\n[8] Hash de integridade determinístico');
  check('hashConteudo estável para o mesmo conteúdo', () => {
    const c = contratos.getContratoRow(pf.id)!;
    const h1 = pdfContrato.hashConteudo(composicao.comporContrato(c));
    const h2 = pdfContrato.hashConteudo(composicao.comporContrato(c));
    assert.equal(h1, h2);
  });

  console.log('\n[9] Versionamento após alteração — NÃO sobrescreve o PDF anterior');
  contratos.editarDadosCliente(admin.id, pf.id, { ...formPF('Novo Nome Fictício') }, true);
  check('PDF anterior marcado como substituído e aprovação revogada', () => {
    const lista = contratos.listarPdfs(pf.id);
    assert.ok(lista.find((p) => p.versaoPdf === 1)?.status === 'substituido');
    assert.equal(contratos.getContratoRow(pf.id)!.status, 'preenchido');
  });
  const pdf2 = await contratos.aprovarEGerarPdf(admin.id, pf.id, true, fakeRender);
  check('nova geração cria versão 2 (ativa) preservando a 1 (substituída)', () => {
    assert.equal(pdf2.versaoPdf, 2);
    const lista = contratos.listarPdfs(pf.id);
    assert.equal(lista.filter((p) => p.status === 'ativo').length, 1);
    assert.equal(lista.filter((p) => p.status === 'substituido').length, 1);
  });
  check('dois arquivos DISTINTOS em disco (histórico preservado)', () => {
    const arquivos = readdirSync(tmpPdfDir).filter((f) => f.startsWith(`contrato-${pf.id}-`));
    assert.ok(arquivos.length >= 2, `esperava >=2 arquivos, veio ${arquivos.length}`);
  });
  check('hash de conteúdo mudou entre v1 e v2 (dados alterados)', () => {
    assert.notEqual(pdf1.hashConteudo, pdf2.hashConteudo);
  });

  console.log('\n[10] Auditoria e resumos SEM dados pessoais');
  check('auditoria de PDF não contém PII do cliente', () => {
    const logs = audit.getAuditDoContrato(pf.id) as any[];
    const s = JSON.stringify(logs.filter((l) => String(l.acao).startsWith('pdf') || l.acao === 'contrato_aprovado'));
    assert.ok(!s.includes('João') && !s.includes('Novo Nome') && !s.includes(CPF), 'PII vazou na auditoria de PDF');
    assert.ok(logs.some((l) => l.acao === 'pdf_gerado'));
    assert.ok(logs.some((l) => l.acao === 'pdf_substituido'));
  });
  check('resumo do PDF não expõe caminho nem PII', () => {
    const s = JSON.stringify(contratos.listarPdfs(pf.id));
    assert.ok(!s.includes(tmpPdfDir) && !s.includes('caminho') && !s.includes(CPF));
  });

  console.log('\n[11] HTML do documento contém identificação e cláusulas');
  check('renderContratoHtml traz título, partes e assinaturas', () => {
    const html = pdfContrato.renderContratoHtml(compPF);
    assert.ok(html.includes('Contrato de Prestação de Serviços'));
    assert.ok(html.includes('CONTRATANTE'));
    assert.ok(html.includes('CONTRATADA'));
    assert.ok(html.includes('Testemunhas'));
    assert.ok(html.includes('break-inside: avoid'), 'esperava CSS anti-quebra do bloco de assinaturas');
  });

  console.log('\n[12] Edição de cláusulas/config também substitui o PDF');
  const c3 = prepararPF('Clínica Recompor', ['funil']);
  await contratos.aprovarEGerarPdf(admin.id, c3.id, true, fakeRender);
  contratos.configurarContrato(admin.id, c3.id, {
    tipoModelo: 'prestacao_servicos', tipoPessoa: 'pf', blocos: ['funil'], fidelidadeAtiva: false,
    valorCentavos: 999999, diaVencimento: 15, limiteLeads: 50, cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20',
    confirmarAlteracaoComLink: true,
  });
  check('mudança de valor substitui o PDF e revoga aprovação', () => {
    assert.ok(contratos.listarPdfs(c3.id).some((p) => p.status === 'substituido'));
    assert.notEqual(contratos.getContratoRow(c3.id)!.status, 'aprovado');
  });

  console.log('\n[13] Anti-bypass: editor NÃO valida um bloco pendente (registro é a fonte)');
  // Exercita o GATE colocando o CRC TEMPORARIAMENTE como pendente (restaura no finally).
  // Prova que reescrever o texto no editor não contorna o registro do servidor.
  await comBlocoJuridicoPendente('crc', async () => {
    const atualPend = contratos.getConteudoAtual(pend.id) as any;
    const mexido = atualPend.conteudo.clausulas.map((cl: any) => ({
      ...cl, texto: 'Texto inserido manualmente pela administração.',
    }));
    contratos.editarConteudo(admin.id, pend.id, mexido, true); // burla: reescreve tudo
    check('bloco CRC pendente continua BLOQUEANDO após edição no editor', () => {
      const c = contratos.getContratoRow(pend.id)!;
      const p = composicao.pendenciasParaGeracao(c, contratos.pendenciasContrato);
      assert.ok(p.some((x) => /validação jurídica/i.test(x) && /CRC/i.test(x)), 'CRC deveria continuar bloqueando');
    });
    await esperaCodeAsync('gerar-pdf bloqueado com CRC pendente (burla não contorna)', 'pendencias_geracao', () => contratos.aprovarEGerarPdf(admin.id, pend.id, true, fakeRender));
  });

  console.log(`\n================ RESULTADO: ${ok} ok, ${fail} falhas ================\n`);
} finally {
  try {
    rmSync(tmpDb, { force: true }); rmSync(tmpDb + '-wal', { force: true }); rmSync(tmpDb + '-shm', { force: true });
    rmSync(tmpPdfDir, { recursive: true, force: true });
  } catch {}
}

function pdfContratoMark(): string { return '[Redação oficial'; }

process.exit(fail === 0 ? 0 : 1);
