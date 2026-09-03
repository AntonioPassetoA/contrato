// Gera PDFs de AMOSTRA (dados FICTÍCIOS) com o render REAL (Puppeteer) para conferência
// visual da apresentação/paginação. Saída em _amostras/pdf (ignorada no git).
// Rode: npx tsx server/test/etapa3-amostra.ts
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';

const tmpDb = resolve(tmpdir(), `contratos-amostra-${process.pid}.sqlite`);
const outDir = resolve(import.meta.dirname, '../../_amostras/pdf');
mkdirSync(outDir, { recursive: true });
process.env.CONTRATOS_DB_PATH = tmpDb;
process.env.CONTRATOS_PDF_DIR = outDir;
process.env.AUTENTIQUE_TOKEN ??= 'test-token';
process.env.ADMIN_PASSWORD ??= 'test-admin-pass';
process.env.SESSION_SECRET ??= 'test-session-secret';
process.env.DATA_ENCRYPTION_KEY = 'chave-ficticia-amostra';

const users = await import('../src/users.ts');
const contratos = await import('../src/contratos.ts');
const empresa = await import('../src/configEmpresa.ts');
const { closeBrowser } = await import('../src/pdf.ts');

function endereco(p: string) {
  return { [`${p}cep`]: '86360-000', [`${p}logradouro`]: 'Rua das Flores', [`${p}numero`]: '123', [`${p}bairro`]: 'Centro', [`${p}municipio`]: 'Bandeirantes', [`${p}estado`]: 'Paraná' } as Record<string, string>;
}
const formPF = { nome: 'João Cliente Fictício', nacionalidade: 'Brasileiro(a)', estado_civil: 'solteiro(a)', profissao: 'Dentista', rg: '12.345.678-9', rg_orgao: 'SSP/PR', cpf: '390.533.447-05', telefone: '(43) 99999-0000', email: 'joao@example.com', ...endereco('res_') };
const formPJ = { razao_social: 'Clínica Sorriso LTDA', nome_fantasia: 'Sorriso Odonto', cnpj: '11.222.333/0001-81', ...endereco('sede_'), nome: 'Maria Representante', nacionalidade: 'Brasileira', estado_civil: 'casado(a)', profissao: 'Empresária', rg: '98.765.432-1', rg_orgao: 'SSP/PR', cpf: '111.444.777-35', telefone: '(43) 98888-1111', email: 'maria@sorriso.com', ...endereco('res_') };

try {
  const admin = users.criarUsuario({ nome: 'Manu', email: 'manu@ex.com', senha: 'senha-teste-123', role: 'admin' });
  const vend = users.criarUsuario({ nome: 'Vend', email: 'vend@ex.com', senha: 'senha-teste-123', role: 'vendedor' });
  empresa.salvarContratada(admin.id, {
    razao_social: 'AGÊNCIA FICTÍCIA LTDA', cnpj: '11.444.777/0001-61', endereco: 'Rua Exemplo, nº 259, Centro, na cidade de Bandeirantes/PR',
    email: 'contato@ficticia.com',
    representantes: [
      { nome: 'Primeiro Representante Fictício', nacionalidade: 'brasileiro', estado_civil: 'casado', profissao: 'empresário', rg: '10.000.000-0', cpf: '390.533.447-05', endereco: 'Rua A, nº 1, Centro, Bandeirantes/PR' },
      { nome: 'Segundo Representante Fictício', nacionalidade: 'brasileiro', estado_civil: 'solteiro', profissao: 'empresário', rg: '20.000.000-0', cpf: '111.444.777-35', endereco: 'Rua B, nº 2, Centro, Bandeirantes/PR' },
    ],
  });
  empresa.salvarTestemunhas(admin.id, [{ nome: 'Testemunha Um Fictícia', cpf: '390.533.447-05' }, { nome: 'Testemunha Dois Fictícia', cpf: '111.444.777-35' }]);

  async function gerar(nome: string, tipo: 'pf' | 'pj', blocos: string[], form: Record<string, string>) {
    const s = contratos.criarSolicitacao(vend.id, nome);
    contratos.configurarContrato(admin.id, s.id, {
      tipoModelo: 'prestacao_servicos', tipoPessoa: tipo, blocos, fidelidadeAtiva: false,
      valorCentavos: 250000, diaVencimento: 10, limiteLeads: 50, cidadeAssinatura: 'Bandeirantes/PR', dataAssinatura: '2026-08-20',
    });
    const lib = contratos.liberarLink(admin.id, s.id);
    contratos.submeterFormularioPublico(lib.token!, form);
    const pdf = await contratos.aprovarEGerarPdf(admin.id, s.id, true); // render REAL
    const c = contratos.getContratoRow(s.id)!;
    console.log(`  ✓ ${nome}: ${c.pdf_path}\n      ${(pdf.tamanho / 1024).toFixed(1)} KB · integridade ${pdf.hashConteudo.slice(0, 16)}…`);
    return c.pdf_path!;
  }

  console.log('\nGerando PDFs de amostra (render real):');
  await gerar('Amostra PF (funil)', 'pf', ['funil'], formPF);
  await gerar('Amostra PJ (funil + clinica_top1)', 'pj', ['funil', 'clinica_top1'], formPJ);

  console.log(`\nArquivos em: ${outDir}\n`);
} finally {
  await closeBrowser().catch(() => {});
  try { rmSync(tmpDb, { force: true }); rmSync(tmpDb + '-wal', { force: true }); rmSync(tmpDb + '-shm', { force: true }); } catch {}
}
process.exit(0);
