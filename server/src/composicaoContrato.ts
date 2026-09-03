// Composição AUTOMÁTICA do contrato para PRÉVIA e PDF.
//
// Junta, sob demanda e só no back-end (admin):
//   - Cabeçalho da CONTRATANTE (dados do cliente, descriptografados) — PF ou PJ;
//   - Cabeçalho da CONTRATADA + testemunhas (configEmpresa — dados da Manu);
//   - Cláusulas resolvidas: a VERSÃO personalizada tem prioridade sobre o modelo-base
//     (sem alterar o modelo dos demais contratos);
//   - Local/data e bloco de assinaturas.
//
// PRIVACIDADE: a identificação das partes (com PII) é montada aqui só para o preview
// admin e o PDF. NUNCA é versionada, logada ou exposta ao vendedor/cliente.

import { db, type ContratoRow } from './db';
import {
  getModelo, blocosPendentesGeracao, fidelidadeLiberada, garantiaLiberada,
  propriedadeB1Liberada, propriedadeB2Liberada,
} from './modelos';
import { getConfigEmpresa, pendenciasEmpresa, type Contratada, type Testemunha } from './configEmpresa';
import { camposCliente } from './formulariosCliente';
import { decryptJSON } from './seguranca/pii';
import { montarEndereco } from './format';
import {
  montarConteudoBase, type Clausula, type ConteudoContrato,
  conteudoTemPendencia, localData, variantesPropriedade,
} from './conteudoContrato';

export interface SignatariosComposto {
  contratante: string;              // nome do representante da CONTRATANTE
  contratada: string[];             // nomes dos representantes da CONTRATADA
  testemunhas: { nome: string; cpf: string }[];
}

export interface ContratoComposto {
  contratoId: number;
  titulo: string;
  tipoPessoa: 'pf' | 'pj';
  contratante: string;              // parágrafo verbatim de qualificação (com PII)
  contratada: string;              // parágrafo verbatim da CONTRATADA (config)
  clausulas: Clausula[];
  localData: string;
  encerramento: string;
  signatarios: SignatariosComposto;
  versao: number;                   // 0 = base (não persistida)
  origem: string;                   // 'base' | 'personalizado' | 'restaurado'
  personalizado: boolean;
}

const ENCERRAMENTO =
  'Por estarem justos e contratados, firmam o presente instrumento, em duas vias de igual ' +
  'teor e forma, juntamente com a assinatura de 02 (duas) testemunhas.';

// ---------- Resolução do conteúdo (versão personalizada > base) ----------

interface VersaoRow { versao: number; origem: string; personalizado: number; conteudo: string }

/** Conteúdo resolvido do contrato: última versão salva ou o modelo-base gerado. */
function resolverConteudo(c: ContratoRow): { conteudo: ConteudoContrato; versao: number; origem: string; personalizado: boolean } {
  const ult = db.prepare(
    `SELECT versao, origem, personalizado, conteudo FROM contrato_versoes WHERE contrato_id = ? ORDER BY versao DESC LIMIT 1`,
  ).get(c.id) as VersaoRow | undefined;
  if (ult) {
    let conteudo: ConteudoContrato;
    try { conteudo = JSON.parse(ult.conteudo) as ConteudoContrato; }
    catch { conteudo = montarConteudoBase(c); }
    return { conteudo, versao: ult.versao, origem: ult.origem, personalizado: ult.personalizado === 1 };
  }
  return { conteudo: montarConteudoBase(c), versao: 0, origem: 'base', personalizado: false };
}

// ---------- Qualificação das partes (verbatim, preenchida com dados) ----------

function enderecoDe(f: Record<string, string>, prefixo: string): string {
  return montarEndereco({
    logradouro: f[`${prefixo}logradouro`], numero: f[`${prefixo}numero`], complemento: f[`${prefixo}complemento`],
    bairro: f[`${prefixo}bairro`], municipio: f[`${prefixo}municipio`], estado: f[`${prefixo}estado`], cep: f[`${prefixo}cep`],
  });
}

/** Parágrafo de qualificação da CONTRATANTE (redação verbatim + dados do cliente). */
function qualificarContratante(tipo: 'pf' | 'pj', f: Record<string, string>): string {
  const g = (k: string) => (f[k] ?? '').trim();
  if (tipo === 'pj') {
    const fantasia = g('nome_fantasia') ? `, nome fantasia ${g('nome_fantasia')}` : '';
    return `${g('razao_social')}${fantasia}, inscrita no CNPJ n° ${g('cnpj')}, com sede na ${enderecoDe(f, 'sede_')}, ` +
      `representada por ${g('nome')}, ${g('nacionalidade')}, ${g('estado_civil')}, ${g('profissao')}, ` +
      `residente e domiciliado na ${enderecoDe(f, 'res_')}, portador da Cédula de Identidade RG n° ${g('rg')}, ` +
      `expedida pela ${g('rg_orgao')}, e inscrito no CPF n° ${g('cpf')} e telefone ${g('telefone')}.`;
  }
  return `${g('nome')}, ${g('nacionalidade')}, ${g('estado_civil')}, ${g('profissao')}, ` +
    `portador da Cédula de Identidade RG n° ${g('rg')}, expedida pela ${g('rg_orgao')}, inscrito no CPF n° ${g('cpf')}, ` +
    `residente e domiciliado na ${enderecoDe(f, 'res_')}, e telefone ${g('telefone')}.`;
}

/** Parágrafo de qualificação da CONTRATADA (redação verbatim + dados de configEmpresa).
 *  Exportado para reuso pelo modelo legado (que também usa a config centralizada). */
export function qualificarContratada(cont: Contratada): string {
  const reps = (cont.representantes ?? []).filter((r) => r.nome?.trim() && r.cpf?.trim()).map((r) => {
    const partes = [r.nome.trim()];
    if (r.nacionalidade?.trim()) partes.push(r.nacionalidade.trim());
    if (r.estado_civil?.trim()) partes.push(r.estado_civil.trim());
    if (r.profissao?.trim()) partes.push(r.profissao.trim());
    if (r.rg?.trim()) partes.push(`portador do RG nº ${r.rg.trim()}`);
    partes.push(`inscrito no CPF nº ${r.cpf.trim()}`);
    if (r.endereco?.trim()) partes.push(`residente na ${r.endereco.trim()}`);
    return partes.join(', ');
  });
  const email = cont.email?.trim() ? `, endereço eletrônico ${cont.email.trim()}` : '';
  const rep = reps.length ? `, tendo como ${reps.length > 1 ? 'representantes' : 'representante'} ${reps.join(' e ')}` : '';
  return `${cont.razao_social}, empresa de direito privado, inscrita no CNPJ nº ${cont.cnpj}, ` +
    `com sede na ${cont.endereco}${email}${rep}.`;
}

// ---------- Pendências que BLOQUEIAM a geração do PDF ----------

/** Campos obrigatórios do cliente ausentes (usa os valores já salvos/descriptografados). */
function pendenciasDadosCliente(tipo: 'pf' | 'pj', valores: Record<string, string> | null): string[] {
  if (!valores) return ['Dados do cliente (formulário ainda não preenchido).'];
  const faltando = camposCliente(tipo).filter((campo) => campo.required && !String(valores[campo.name] ?? '').trim());
  return faltando.length ? [`Dados obrigatórios do cliente: ${faltando.map((c) => c.label).join(', ')}.`] : [];
}

/**
 * Lista TODAS as pendências que impedem a geração do PDF (dados do cliente, CONTRATADA,
 * representante, testemunhas, valor/vencimento, cidade/data, texto jurídico pendente).
 * NÃO inclui a "confirmação da Manu" — essa é exigida no ato de aprovar/gerar.
 */
export function pendenciasParaGeracao(c: ContratoRow, pendenciasContratoFn: (c: ContratoRow) => string[]): string[] {
  const pend: string[] = [];
  const modelo = c.tipo_modelo ? getModelo(c.tipo_modelo) : undefined;
  if (!modelo) return ['Modelo de contrato não definido.'];
  if (c.tipo_pessoa !== 'pf' && c.tipo_pessoa !== 'pj') return ['Tipo de pessoa (PF ou PJ) não definido.'];

  // Comercial (valor, vencimento, blocos, limite de leads, cidade, data, meses de fidelidade).
  pend.push(...pendenciasContratoFn(c));

  // Empresa (CONTRATADA, representante, testemunhas).
  pend.push(...pendenciasEmpresa());

  // Dados do cliente.
  let valores: Record<string, string> | null = null;
  if (c.form_data) { try { valores = decryptJSON<Record<string, string>>(c.form_data); } catch { valores = null; } }
  pend.push(...pendenciasDadosCliente(c.tipo_pessoa, valores));

  const blocos = (() => { try { return JSON.parse(c.blocos ?? '[]') as string[]; } catch { return []; } })();

  // BLOQUEIO POR BLOCO em DOIS níveis — fonte da verdade (NÃO burlável pelo editor).
  // Mesmo que a admin apague o marcador manualmente, um bloco cuja FONTE não foi
  // conferida OU cuja VALIDAÇÃO JURÍDICA está pendente continua bloqueando o PDF.
  const pendBlocos = blocosPendentesGeracao(modelo.id, blocos);
  const fontePend = pendBlocos.filter((b) => b.motivo === 'fonte').map((b) => b.label);
  const juridicaPend = pendBlocos.filter((b) => b.motivo === 'juridica').map((b) => b.label);
  if (fontePend.length) {
    pend.push(`Redação oficial ainda não conferida integralmente da fonte (transcrição incompleta): ${fontePend.join(', ')}. A geração fica bloqueada até a conferência documental.`);
  }
  if (juridicaPend.length) {
    pend.push(`Texto jurídico oficial pendente de validação jurídica: ${juridicaPend.join(', ')}. A geração do PDF só é liberada após a validação jurídica destes blocos.`);
  }

  // Cláusula 9 (Propriedade Intelectual) dirigida por SERVIÇO: B1 (google_ads) e/ou
  // B2 (facebook_meta). Fonte da verdade do bloqueio (independe do editor). Após a
  // validação jurídica de 2026-09-01, B1 e B2 estão liberados e NÃO bloqueiam mais;
  // o gate permanece para segurança caso um dia a validação seja revertida.
  const vprop = variantesPropriedade(blocos);
  if (vprop.google && !propriedadeB1Liberada()) {
    pend.push('Cláusula 9 de Propriedade Intelectual (Google Ads — B1) pendente de validação jurídica. A geração do PDF só é liberada após a validação jurídica.');
  }
  if (vprop.facebook && !propriedadeB2Liberada()) {
    pend.push('Cláusula 9 de Propriedade Intelectual (Facebook/Meta — B2) pendente de validação jurídica. A geração do PDF só é liberada após a validação jurídica.');
  }

  // Cláusula de fidelidade opcional — só libera com fonte conferida E validação jurídica.
  const fid = (() => { try { return JSON.parse(c.fidelidade ?? '{}') as { ativo?: boolean }; } catch { return {}; } })();
  if (fid.ativo && !fidelidadeLiberada()) {
    pend.push('Cláusula de fidelidade pendente de validação jurídica.');
  }

  // Garantia opcional (opt-in separado) — só libera com fonte conferida E validação jurídica.
  const gar = (() => { try { return JSON.parse(c.garantia ?? '{}') as { ativo?: boolean }; } catch { return {}; } })();
  if (gar.ativo && !garantiaLiberada()) {
    pend.push('Cláusula de garantia pendente de validação jurídica.');
  }

  // Defesa secundária: marcador de redação pendente no conteúdo resolvido.
  const { conteudo } = resolverConteudo(c);
  if (conteudoTemPendencia(conteudo)) {
    pend.push('Há cláusula(s) com marcador de redação pendente no conteúdo do contrato.');
  }
  return pend;
}

// ---------- Composição completa (para preview e PDF) ----------

/**
 * Compõe o contrato completo. Tolerante a pendências (mostra a qualificação
 * disponível e mantém os marcadores no texto) — a decisão de gerar o PDF é do
 * chamador, que valida `pendenciasParaGeracao` antes.
 */
export function comporContrato(c: ContratoRow): ContratoComposto {
  const tipo: 'pf' | 'pj' = c.tipo_pessoa === 'pj' ? 'pj' : 'pf';

  let valores: Record<string, string> | null = null;
  if (c.form_data) { try { valores = decryptJSON<Record<string, string>>(c.form_data); } catch { valores = null; } }
  const contratante = valores ? qualificarContratante(tipo, valores) : '[Dados do cliente pendentes de preenchimento.]';

  const cfg = getConfigEmpresa();
  const contratada = cfg.contratada ? qualificarContratada(cfg.contratada) : '[CONTRATADA não configurada.]';

  const { conteudo, versao, origem, personalizado } = resolverConteudo(c);

  const testemunhas: Testemunha[] = (cfg.testemunhas ?? []).filter((t) => t.nome?.trim() && t.cpf?.trim());
  const repsContratada = (cfg.contratada?.representantes ?? []).filter((r) => r.nome?.trim()).map((r) => r.nome.trim());
  const nomeContratante = valores?.nome?.trim() || (tipo === 'pj' ? valores?.razao_social?.trim() : '') || '';

  return {
    contratoId: c.id,
    titulo: conteudo.titulo || 'Contrato de Prestação de Serviços',
    tipoPessoa: tipo,
    contratante,
    contratada,
    clausulas: conteudo.clausulas,
    localData: localData(c),
    encerramento: ENCERRAMENTO,
    signatarios: { contratante: nomeContratante, contratada: repsContratada, testemunhas: testemunhas.map((t) => ({ nome: t.nome.trim(), cpf: t.cpf.trim() })) },
    versao, origem, personalizado,
  };
}
