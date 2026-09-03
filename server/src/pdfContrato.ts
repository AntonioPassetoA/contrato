// Renderização do CONTRATO em HTML profissional (A4) e geração/armazenamento do PDF.
//
// Apresentação: fonte serifada, texto justificado, títulos que não ficam órfãos no fim
// da página (break-after: avoid) e bloco de assinaturas que não se parte entre páginas
// (break-inside: avoid). Paginação e identificador interno + hash de integridade no rodapé.
//
// Armazenamento: arquivo em server/data/pdfs (NÃO público, ignorado no git), acessível
// só pelo admin. Guarda hash do conteúdo (embutido no PDF) e hash do arquivo.

import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { escapeHtml } from './format';
import { renderHtmlToPdf } from './pdf';
import type { ContratoComposto } from './composicaoContrato';

/** Diretório NÃO público dos PDFs. Isolável nos testes via CONTRATOS_PDF_DIR. */
export function pdfDir(): string {
  const dir = process.env.CONTRATOS_PDF_DIR
    ? resolve(process.env.CONTRATOS_PDF_DIR)
    : resolve(import.meta.dirname, '../data/pdfs');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** String canônica e determinística do conteúdo — base do hash de integridade. */
function conteudoCanonico(c: ContratoComposto): string {
  return JSON.stringify({
    titulo: c.titulo, tipoPessoa: c.tipoPessoa,
    contratante: c.contratante, contratada: c.contratada,
    clausulas: c.clausulas, localData: c.localData,
    encerramento: c.encerramento, signatarios: c.signatarios,
    versao: c.versao,
  });
}

/** SHA-256 (hex) do conteúdo canônico do contrato. Igual conteúdo → igual hash. */
export function hashConteudo(c: ContratoComposto): string {
  return crypto.createHash('sha256').update(conteudoCanonico(c), 'utf8').digest('hex');
}

function paragrafos(texto: string): string {
  return texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p>${escapeHtml(l)}</p>`)
    .join('');
}

/** HTML COMPLETO do contrato (idêntico ao que vira PDF; usado também na prévia). */
export function renderContratoHtml(c: ContratoComposto): string {
  const clausulasHtml = c.clausulas
    .map((cl) => `<section class="clausula"><h2>${escapeHtml(cl.titulo)}</h2>${paragrafos(cl.texto)}</section>`)
    .join('\n');

  const contratadaSigs = c.signatarios.contratada.length
    ? c.signatarios.contratada.map((n) => `<div class="sig-col"><div class="sig-line"></div>${escapeHtml(n)}</div>`).join('')
    : '<div class="sig-col"><div class="sig-line"></div>Representante da CONTRATADA</div>';

  const testemunhasSigs = c.signatarios.testemunhas.length
    ? c.signatarios.testemunhas.map((t, i) =>
        `<div class="sig-col"><div class="sig-line"></div>${escapeHtml(t.nome)}<br><small>CPF: ${escapeHtml(t.cpf)}<br>(Testemunha 0${i + 1})</small></div>`).join('')
    : '';

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Georgia, serif; font-size: 11.5pt; line-height: 1.5; color: #111; text-align: justify; margin: 0; }
  h1 { font-size: 15pt; text-align: center; margin: 0 0 20px; text-transform: uppercase; }
  h2 { font-size: 11.5pt; margin: 14px 0 4px; text-transform: uppercase; break-after: avoid; }
  p { margin: 0 0 8px; orphans: 2; widows: 2; }
  .clausula { break-inside: auto; }
  .clausula h2 + p { break-before: avoid; }
  .parte-titulo { font-weight: bold; margin: 12px 0 4px; }
  .partes { break-inside: avoid; }
  .encerramento { margin-top: 16px; }
  .assinaturas { margin-top: 40px; break-inside: avoid; }
  .linha-assinatura { margin-top: 36px; text-align: center; }
  .sig-row { display: flex; justify-content: space-between; gap: 40px; margin-top: 36px; text-align: center; }
  .sig-col { flex: 1; }
  .sig-line { border-top: 1px solid #111; margin: 0 auto 4px; width: 90%; padding-top: 26px; }
  small { font-size: 9.5pt; }
</style></head><body>

<h1>${escapeHtml(c.titulo)}</h1>

<div class="partes">
  <p class="parte-titulo">CONTRATANTE:</p>
  <p>${escapeHtml(c.contratante)}</p>
  <p class="parte-titulo">CONTRATADA:</p>
  <p>${escapeHtml(c.contratada)}</p>
</div>

${clausulasHtml}

<p class="encerramento">${escapeHtml(c.encerramento)}</p>

<div class="assinaturas">
  <p>${escapeHtml(c.localData)}</p>

  <p class="parte-titulo" style="margin-top:24px">Representante da CONTRATANTE:</p>
  <div class="linha-assinatura">
    <div class="sig-line" style="width:60%"></div>
    <div><strong>${escapeHtml(c.signatarios.contratante || 'CONTRATANTE')}</strong></div>
  </div>

  <p class="parte-titulo" style="margin-top:24px">Representantes da CONTRATADA:</p>
  <div class="sig-row">${contratadaSigs}</div>

  ${testemunhasSigs ? `<p class="parte-titulo" style="margin-top:24px">Testemunhas:</p><div class="sig-row">${testemunhasSigs}</div>` : ''}
</div>

</body></html>`;
}

/** Rodapé do PDF: identificador interno + hash de integridade + paginação. */
function footerTemplate(contratoId: number, versaoPdf: number, hashCurto: string): string {
  return `<div style="font-family: Arial, sans-serif; font-size: 7pt; color: #555; width: 100%; padding: 0 14mm; display: flex; justify-content: space-between;">
    <span>Doc. interno #${contratoId} · versão PDF ${versaoPdf} · integridade ${hashCurto}</span>
    <span>Página <span class="pageNumber"></span>/<span class="totalPages"></span></span>
  </div>`;
}

export interface ArquivoPdf {
  caminho: string;
  hashConteudo: string;
  hashArquivo: string;
  tamanho: number;
}

/** Função de render injetável (testes passam uma fake; produção usa o Puppeteer). */
export type RenderPdf = (html: string, footer: string) => Promise<Buffer>;

const renderPadrao: RenderPdf = (html, footer) => renderHtmlToPdf(html, { footerTemplate: footer });

/**
 * Gera o PDF do contrato composto e grava no diretório não público.
 * Nome do arquivo: contrato-<id>-v<versaoPdf>-<hash8>.pdf.
 */
export async function gerarPdfArquivo(
  composto: ContratoComposto, versaoPdf: number, render: RenderPdf = renderPadrao,
): Promise<ArquivoPdf> {
  const hConteudo = hashConteudo(composto);
  const html = renderContratoHtml(composto);
  const footer = footerTemplate(composto.contratoId, versaoPdf, hConteudo.slice(0, 16));

  const buffer = await render(html, footer);
  const hArquivo = crypto.createHash('sha256').update(buffer).digest('hex');

  const nome = `contrato-${composto.contratoId}-v${versaoPdf}-${hConteudo.slice(0, 8)}.pdf`;
  const caminho = resolve(pdfDir(), nome);
  writeFileSync(caminho, buffer);

  return { caminho, hashConteudo: hConteudo, hashArquivo: hArquivo, tamanho: buffer.length };
}
