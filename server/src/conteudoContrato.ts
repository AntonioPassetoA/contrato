// Montagem do CONTEÚDO (cláusulas) do "Contrato de Prestação de Serviços".
//
// Regras de privacidade: as VERSÕES guardam somente as cláusulas (com variáveis
// comerciais — valor, vencimento, fidelidade). NENHUM dado pessoal do cliente é
// colocado aqui — a identificação das partes é montada só no preview admin, sob
// demanda, a partir dos dados descriptografados (nunca é versionada/gravada).
//
// Os textos-base abaixo são preservados como modelo. Uma edição manual cria uma
// VERSÃO personalizada daquele contrato, sem alterar este modelo-base.

import type { ContratoRow } from './db';
import { formatBRL, valorPorExtenso, dataPorExtenso, numeroPorExtenso } from './format';

export interface Clausula {
  id: string;
  titulo: string;
  texto: string;
}
export interface ConteudoContrato {
  titulo: string;
  clausulas: Clausula[];
}

// Marcador ÚNICO de texto jurídico ainda não confirmado verbatim. É uma DEFESA
// SECUNDÁRIA: a fonte da verdade do bloqueio de PDF é o registro de validação por
// bloco em modelos.ts (não burlável pelo editor). Este marcador apenas sinaliza,
// no conteúdo gerado, cláusulas cuja redação oficial ainda não foi inserida.
export const MARCADOR_PENDENTE = '[Redação oficial';

// Texto dos blocos de serviço para a cláusula de objeto. Redação VERBATIM dos contratos
// originais (fonte conferida). A validação JURÍDICA de crc/ia/google_ads/site/consignado
// segue pendente — o que bloqueia a GERAÇÃO do PDF (não a prévia). NÃO reescrever nem
// corrigir: os textos preservam a grafia original (inclusive "métodologia", "períodico").
const BLOCO_ITENS: Record<string, { titulo: string; itens: string[] }> = {
  clinica_top1: {
    titulo: 'Implementação da metodologia Clínica Top 1, conforme descrito abaixo:',
    itens: [
      'Análise dos concorrentes no site Google Maps.',
      'Planejamento de palavras-chaves a serem posicionadas no Google Maps.',
      'Otimização de perfil no Google Maps para as palavras-chaves planejadas.',
      'Repostagem no Google Maps dos conteúdos postados no Instagram no formato Feed, quando compatível.',
      'Relatório periódico dos resultados obtidos.',
    ],
  },
  // IA — verbatim de "Contrato de IA".
  ia: {
    titulo: 'Implementação da métodologia de Agendamento por IA conforme descrito abaixo:',
    itens: [
      'Buscar entrar em contato com todos os leads captados através da captação realizada pela CONTRATADA, utilizando inteligência artificial no WhatsApp.',
      'O objetivo do contato com os leads captados é buscar agendar uma consulta com o lead.',
      'Confirmação de avaliações agendadas antes do horário agendado, utilizando automação e/ou inteligência artificial no WhatsApp.',
      'Relatório períodico dos resultados obtidos.',
    ],
  },
  // Facebook / Meta Ads — SERVIÇO próprio (aciona a cláusula 9 B2). Itens verbatim da
  // fonte de mídia social (social_midia.pdf): anúncios pagos no Facebook/Instagram via
  // Gerenciador de Negócios do Facebook. NÃO confundir com o modificador `social_midia`.
  facebook_meta: {
    titulo: 'Implementação da metodologia Funil de Captação de Leads no Facebook/Instagram (Meta Ads), conforme descrito abaixo:',
    itens: [
      'Elaboração de anúncios com uso de imagens, vídeos ou textos para serem divulgados nas mídias sociais, preferencialmente no Instagram, buscando educar possíveis clientes e captar leads.',
      'Impulsionamento do material produzido através do Gerenciador de Negócios do Facebook e Instagram conforme o objetivo da metodologia.',
      'Coleta de dados e compartilhamento por meio de uma ferramenta de gestão de clientes online com informações em tempo real.',
      'Relatório períodico dos resultados obtidos.',
    ],
  },
  // Google Ads — verbatim de "Google + Site" (variante do Funil no Google Ads).
  google_ads: {
    titulo: 'Implementação da metodologia Funil de Captação de Leads, conforme descrito abaixo:',
    itens: [
      'Elaboração de anúncios em formato de texto e/ou display para veiculação no Google, com o objetivo de capturar leads com potencial de se tornarem pacientes da clínica.',
      'Configuração, gestão e otimização das campanhas através da plataforma Google Ads, incluindo definição de palavras-chave, segmentação de público e estratégia de lances, conforme o objetivo da metodologia.',
      'Otimização do perfil da clínica no Google Maps (Google Business Profile), buscando melhorar o posicionamento nos resultados de busca local do Google e aumentar a visibilidade da clínica de forma orgânica para pessoas que pesquisam por tratamentos odontológicos na região.',
      'Coleta de dados e compartilhamento por meio de uma ferramenta de gestão de clientes online com informações em tempo real.',
      'Relatório períodico dos resultados obtidos.',
    ],
  },
  // Site — verbatim de "Google + Site" (cláusula 1.3). As referências internas "1.3.x"
  // são preservadas literalmente (fazem parte da redação original).
  site: {
    titulo: 'Criação de Site Profissional:',
    itens: [
      'Criação de site profissional para a clínica, otimizado para SEO (Search Engine Optimization), conjunto de técnicas aplicadas para melhorar o posicionamento do site nos resultados de busca do Google, aumentando a visibilidade da clínica de forma orgânica para pessoas que pesquisam por tratamentos odontológicos na região.',
      'Para a publicação do site, é necessário que o contratante forneça um domínio próprio (endereço do site, como por exemplo: www.clinicaexemplo.com.br). Caso o contratante não possua domínio, a Contratada poderá auxiliar no processo de aquisição, sendo o custo do domínio de responsabilidade do contratante.',
      'O primeiro mês de hospedagem do site está incluso no serviço.',
      'A partir do segundo mês, o contratante poderá optar pela continuidade da hospedagem e manutenção básica do site pela Contratada, no valor de R$ 100,00 (cem reais) mensais, sujeito a reajuste anual pelo índice IGP-M.',
      'Caso o contratante opte por não contratar o serviço descrito em 1.3.4, a Contratada encerrará a hospedagem ao fim do período incluso.',
      'Caso o contratante encerre o serviço de hospedagem descrito em 1.3.4, poderá solicitar formalmente o acesso ao código-fonte do site, com o objetivo de manter uma cópia do material produzido em sua posse e dar continuidade ao projeto com a equipe de sua escolha. O código será disponibilizado em repositório no GitHub pelo prazo de 60 (sessenta) dias corridos, a contar da data da solicitação, para que a cópia seja realizada. Após este prazo, a Contratada não terá mais obrigação de manter o código disponível.',
    ],
  },
  // Consignado — verbatim de "Consignado" (objeto 1.2.1–1.2.5). A cláusula própria
  // "DAS RESPONSABILIDADES" é acrescentada à parte (ver clausulaResponsabilidadesConsignado).
  consignado: {
    titulo: 'Os serviços objeto deste contrato consistem na intermediação e facilitação do acesso a crédito por parte dos pacientes da CONTRATANTE, por meio da conexão com correspondentes bancários parceiros da CONTRATADA, conforme descrito abaixo:',
    itens: [
      'A CONTRATADA disponibilizará à CONTRATANTE acesso a parceiros correspondentes bancários que possuem relacionamento com instituições financeiras, possibilitando a oferta de condições diferenciadas de crédito aos pacientes da clínica.',
      'A CONTRATADA fornecerá suporte consultivo online à CONTRATANTE, por meio de profissional capacitado, com o objetivo de orientar sobre a oferta de crédito aos pacientes, de forma prática, personalizada e integrada ao atendimento da clínica.',
      'O processo de avaliação e contratação de crédito será realizado diretamente pelo paciente, com apoio da CONTRATANTE e da CONTRATADA, podendo incluir a possibilidade de parcelamento de procedimentos odontológicos em até 96 (noventa e seis) vezes, conforme condições aprovadas pelas instituições financeiras.',
      'O crédito concedido será disponibilizado diretamente ao paciente pela instituição financeira, sendo este o responsável pelo pagamento do procedimento à CONTRATANTE.',
      'A CONTRATADA não participa das transações financeiras entre paciente e instituição financeira, nem entre paciente e CONTRATANTE, atuando exclusivamente como facilitadora do processo.',
    ],
  },
};

/** Variável do CRC no texto verbatim: limite mensal de leads. */
const CRC_LEADS_VAR = '{{crc_leads}}';

/** Funil de Captação (verbatim). Com o modificador Social Mídia ativo, usa a redação
 *  verbatim de "Plano Prata c/ social mídia" (acrescenta "vídeos" e o item de conteúdos
 *  educacionais) — exclusivamente os itens encontrados na fonte. */
function itensFunil(socialMidia: boolean): { titulo: string; itens: string[] } {
  if (socialMidia) {
    return {
      titulo: 'Implementação da metodologia Funil de Captação de Leads, conforme descrito abaixo:',
      itens: [
        'Elaboração de anúncios com uso de imagens, vídeos ou textos para serem divulgados nas mídias sociais, preferencialmente no Instagram, com objetivo de educar possíveis clientes e captar leads.',
        'Criação de conteúdos educacionais e postagem nas mídias sociais Facebook e Instagram de acordo com a necessidade para implementação da métodologia.',
        'Impulsionamento do material produzido através do Gerenciador de Negócios do Facebook e Instagram conforme o objetivo da metodologia.',
        'Coleta de dados e compartilhamento por meio de uma ferramenta de gestão de clientes online com informações em tempo real.',
        'Relatório periódico dos resultados obtidos.',
      ],
    };
  }
  return {
    titulo: 'Implementação da metodologia Funil de Captação de Leads, conforme descrito abaixo:',
    itens: [
      'Elaboração de anúncios com uso de imagens e textos para serem divulgados nas mídias sociais, preferencialmente no Instagram, buscando educar possíveis clientes e captar leads.',
      'Impulsionamento do material produzido através do Gerenciador de Negócios do Facebook e Instagram conforme o objetivo da metodologia.',
      'Coleta de dados e compartilhamento por meio de uma ferramenta de gestão de clientes online com informações em tempo real.',
      'Relatório periódico dos resultados obtidos.',
    ],
  };
}

/** CRC (verbatim), com o limite mensal de leads interpolado nos DOIS pontos da cláusula. */
function itensCrc(limiteLeads: number | null): { titulo: string; itens: string[] } {
  const n = limiteLeads && limiteLeads > 0 ? String(limiteLeads) : CRC_LEADS_VAR;
  return {
    titulo: `Implementação da métodologia de Agendamento por CRC de até ${n} leads novos por mês, conforme descrito abaixo:`,
    itens: [
      `Entrar em contato com todos os leads captados através da captação realizada pela CONTRATADA, limitado a ${n} leads novos por mês, utilizando abordagens através de ligação convencional, ligação via WhatsApp e mensagens por WhatsApp.`,
      'Follow up de todos os contatos presentes no CRM, buscando o máximo de aproveitamento possivel de cada lead e buscando interromper o contato com o cliente apenas em caso de sucesso no agendamento ou em caso de bloqueio do número de telefone.',
      'Confirmação de avaliações agendadas antes do horário agendado.',
      'Buscar reagendar todos os leads que não comparecerem na avaliação marcada.',
      'Relatório períodico dos resultados obtidos.',
    ],
  };
}

function itensBloco(
  id: string, label: string, opts: { socialMidia: boolean; limiteLeads: number | null },
): { titulo: string; itens: string[] } {
  if (id === 'funil') return itensFunil(opts.socialMidia);
  if (id === 'crc') return itensCrc(opts.limiteLeads);
  return BLOCO_ITENS[id] ?? {
    titulo: `Implementação do serviço "${label}".`,
    itens: [`${MARCADOR_PENDENTE} desta cláusula a ser inserida pela administração em "Editar contrato".]`],
  };
}

function parseData(s: string | null): Date {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [a, m, d] = s.split('-').map(Number);
    return new Date(a, m - 1, d);
  }
  return new Date();
}

const BLOCO_LABEL: Record<string, string> = {
  funil: 'Funil de Captação de Leads', clinica_top1: 'Clínica Top 1 (Google Maps)',
  crc: 'CRC — Relacionamento com o Cliente', ia: 'Inteligência Artificial (IA)',
  google_ads: 'Google Ads', facebook_meta: 'Facebook / Meta Ads',
  site: 'Site Profissional', consignado: 'Consignado',
};

// ---------- Cláusula 9 (Propriedade Intelectual) dirigida pelos SERVIÇOS ----------
//
// REGRA DEFINITIVA (Google Ads / Facebook-Meta), por SERVIÇO do contrato:
//   - Serviço Google Ads (bloco `google_ads`) → redação B1 (verbatim de google_site.pdf).
//   - Serviço Facebook/Meta (bloco `facebook_meta`) → redação B2 (verbatim de
//     consignado.pdf — onde o texto Facebook Business está fisicamente).
//   - Os dois serviços juntos → B1 E B2, cada um em bloco PRÓPRIO e rotulado, textos
//     ÍNTEGROS, SEM fusão, sem terceira redação, preservando as referências internas.
//   - Nenhum dos dois → redação BASE (curta), como nos contratos crc/ia/consignado/etc.
//
// ATENÇÃO: o modificador comercial `social_midia` (vídeos/conteúdos no Funil) NÃO
// aciona B2. B2 é acionado SOMENTE pelo serviço explícito `facebook_meta`.
//
// Reproduções VERBATIM (erros da fonte preservados — ex.: "públicadas"). A VALIDAÇÃO
// JURÍDICA de B1/B2 segue PENDENTE (ver PROPRIEDADE_B1/B2_VALIDACAO em modelos.ts):
// selecionar o serviço libera a PRÉVIA, mas BLOQUEIA a geração do PDF até o jurídico.

const PROP_BASE: string[] = [
  '9.1) Toda propriedade intelectual desenvolvida pela CONTRATADA em decorrência da execução do presente Contrato será de sua titularidade exclusiva.',
  '9.2) É vedado à CONTRATANTE promover o registro de qualquer propriedade intelectual de titularidade da CONTRATADA.',
  '9.3) É vedado à CONTRATANTE reproduzir a metodologia de trabalho utilizada e desenvolvida pela CONTRATADA em quaisquer contratos de prestação de serviços com outras empresas.',
];

// B1 — Google Ads (verbatim de _amostras/fontes/google_site.pdf, cláusula 9 ampliada).
const PROP_B1_GOOGLE: string[] = [
  '9.1) Toda propriedade intelectual desenvolvida pela CONTRATADA para uso em ferramentas digitais em decorrência da execução do presente Contrato será de sua titularidade exclusiva, nos seguintes casos:',
  '9.1.1) Contas do Google Ads criadas pela CONTRATADA em suas próprias contas, caso necessário, para uso durante o período do contrato.',
  '9.1.2) Imagens e vídeos editados pela CONTRATADA que fazem parte do seu repositório de uso comum para os seus clientes, com direito de uso concedido a CONTRATANTE, caso vir a ter.',
  '9.1.3) Ferramentas Digitais criadas em nome da CONTRATADA para uso da CONTRATANTE durante o período do contrato.',
  '9.2) É vedado à CONTRATANTE promover o registro de qualquer propriedade intelectual de titularidade da CONTRATADA.',
  '9.3) É vedado à CONTRATANTE reproduzir a metodologia de trabalho utilizada e desenvolvida pela CONTRATADA descrito na Cláusula 9.1 em quaisquer contratos de prestação de serviços com outras empresas.',
];

// B2 — Facebook Business (verbatim de _amostras/fontes/consignado.pdf). "públicadas" (sic).
const PROP_B2_FACEBOOK: string[] = [
  '9.1) Toda propriedade intelectual desenvolvida pela CONTRATADA para uso em ferramentas digitais em decorrência da execução do presente Contrato será de sua titularidade exclusiva, nos seguintes casos:',
  '9.1.1) Gerenciador de Negócios do Facebook criado pela CONTRATADA para uso durante o período do contrato.',
  '9.1.2) Imagens e vídeos editados pela CONTRATADA usados exclusivamente em anúncios no Gerenciador de Negócios do Facebook da CONTRATADA e que não foram públicadas organicamente nos perfis das redes sociais do Facebook e Instagram da CONTRATANTE.',
  '9.1.3) Ferramentas Digitais criadas em nome da CONTRATADA para uso da CONTRATANTE durante o período do contrato.',
  '9.2) É vedado à CONTRATANTE promover o registro de qualquer propriedade intelectual de titularidade da CONTRATADA.',
  '9.3) É vedado à CONTRATANTE reproduzir a metodologia de trabalho utilizada e desenvolvida pela CONTRATADA descrito na Cláusula 9.1 em quaisquer contratos de prestação de serviços com outras empresas.',
];

/** Rótulos dos sub-blocos quando as duas variantes coexistem (não fundir). */
export const PROP_LABEL_GOOGLE = '▸ PROPRIEDADE INTELECTUAL — GOOGLE ADS';
export const PROP_LABEL_FACEBOOK = '▸ PROPRIEDADE INTELECTUAL — FACEBOOK';

/**
 * Serviços de Propriedade Intelectual presentes na seleção (SERVIÇOS explícitos).
 *   - google: bloco `google_ads` selecionado → B1.
 *   - facebook: bloco `facebook_meta` selecionado (serviço Facebook/Meta) → B2.
 * O modificador `social_midia` NÃO entra aqui (não aciona B2).
 * Fonte da verdade da composição (o front NÃO fornece a cláusula; ela é derivada aqui).
 */
export function variantesPropriedade(blocos: string[]): { google: boolean; facebook: boolean } {
  return { google: blocos.includes('google_ads'), facebook: blocos.includes('facebook_meta') };
}

/** Monta a cláusula 9 conforme os serviços — base / B1 / B2 / (B1 + B2 rotulados). */
function clausulaPropriedade(blocos: string[]): Clausula {
  const { google, facebook } = variantesPropriedade(blocos);
  const titulo = 'Da Propriedade Intelectual (CLÁUSULA NONA)';
  if (google && facebook) {
    // Dois blocos íntegros, rotulados, SEM fusão e preservando o 9.x interno de cada um.
    const texto =
      `${PROP_LABEL_GOOGLE}\n${PROP_B1_GOOGLE.join('\n')}` +
      `\n\n${PROP_LABEL_FACEBOOK}\n${PROP_B2_FACEBOOK.join('\n')}`;
    return { id: 'propriedade', titulo, texto };
  }
  if (google) return { id: 'propriedade', titulo, texto: PROP_B1_GOOGLE.join('\n') };
  if (facebook) return { id: 'propriedade', titulo, texto: PROP_B2_FACEBOOK.join('\n') };
  return { id: 'propriedade', titulo, texto: PROP_BASE.join('\n') };
}

/** Garantia (opt-in): { ativo, investimentoCentavos, periodoMeses, confirmadoEm }. */
interface GarantiaConfig { ativo?: boolean; investimentoCentavos?: number | null; periodoMeses?: number | null }
function parseGarantia(raw: string | null): GarantiaConfig {
  if (!raw) return {};
  try { return JSON.parse(raw) as GarantiaConfig; } catch { return {}; }
}

/** Monta as cláusulas-base a partir da configuração comercial (sem PII). */
export function montarClausulasBase(c: ContratoRow): Clausula[] {
  const centavos = c.valor_centavos ?? 0;
  const dia = c.dia_vencimento ?? 1;
  const valorFmt = centavos ? formatBRL(centavos) : 'R$ __________';
  const ext = centavos ? valorPorExtenso(centavos) : '';
  const valorTexto = ext ? `${valorFmt} (${ext})` : valorFmt;

  let blocos: string[] = [];
  try { blocos = c.blocos ? (JSON.parse(c.blocos) as string[]) : []; } catch { blocos = []; }

  const opts = { socialMidia: c.social_midia === 1, limiteLeads: c.limite_leads };

  // Cláusula do objeto (1.1 / 1.2 + subitens por bloco selecionado).
  const objetoLinhas: string[] = [
    '1.1) Constitui objeto do presente contrato a Prestação de Serviço de Marketing Digital nas mídias sociais Facebook e Instagram, pela CONTRATADA à CONTRATANTE.',
    '1.2) Os serviços, acertados neste instrumento, consistirão em:',
  ];
  blocos.forEach((bid, i) => {
    const b = itensBloco(bid, BLOCO_LABEL[bid] ?? bid, opts);
    objetoLinhas.push(`1.2.${i + 1} – ${b.titulo}`);
    b.itens.forEach((item, j) => objetoLinhas.push(`1.2.${i + 1}.${j + 1} – ${item}`));
  });

  const clausulas: Clausula[] = [
    { id: 'objeto', titulo: 'Do Objeto do Contrato (CLÁUSULA PRIMEIRA)', texto: objetoLinhas.join('\n') },
    { id: 'prazo', titulo: 'Do Prazo do Contrato (CLÁUSULA SEGUNDA)', texto:
      '2.1) A validade do presente contrato é de 3 (três) meses. Após o término desse prazo, o contrato irá se renovar automaticamente, por prazo indeterminado, desde que não haja objeção pela CONTRATANTE e CONTRATADA.' },
    { id: 'obrig_contratante', titulo: 'Das Obrigações da Contratante (CLÁUSULA TERCEIRA)', texto:
      '3.1) A CONTRATANTE deverá fornecer à CONTRATADA todas as informações necessárias à realização dos serviços, devendo especificar os detalhes necessários à perfeita consecução dos mesmos.\n' +
      '3.2) A CONTRATANTE se obriga a apresentar à CONTRATADA, quando solicitado, todos os documentos e informações necessários ao bom e fiel cumprimento do presente instrumento.\n' +
      '3.3) A CONTRATANTE deverá efetuar o devido pagamento à CONTRATADA, em conformidade com a cláusula quinta do presente instrumento.' },
    { id: 'obrig_contratada', titulo: 'Das Obrigações da Contratada (CLÁUSULA QUARTA)', texto:
      '4.1) A CONTRATADA se obriga a realizar todos os atos relacionados aos serviços na cláusula primeira do presente instrumento.\n' +
      '4.2) A CONTRATADA se obriga a utilizar técnicas condizentes com os serviços a serem prestados, efetuando todos os esforços para a sua consecução.\n' +
      '4.3) A CONTRATADA empregará parte do seu corpo técnico para a realização de pesquisa e desenvolvimento na área assessorada, bem como para a solução e prevenção de eventuais problemas, nomeando um responsável para a administração das atividades e se compromete a cumprir suas obrigações no prazo de 15 dias úteis.' },
    { id: 'pagamento', titulo: 'Do Pagamento (CLÁUSULA QUINTA)', texto:
      `5.1) Pela prestação dos serviços a CONTRATANTE pagará antecipadamente à CONTRATADA a quantia de ${valorTexto}, em parcela única, no ato da assinatura do presente instrumento e mensalmente todo dia ${dia} de cada mês até o término do contrato.\n` +
      '5.2) Os honorários convencionados no presente contrato não se confundem com eventuais serviços prestados em outras áreas, e em caso de serviços adicionais a serem realizados no curso destes acordados, o adicional aos honorários ora estipulados serão fixados de acordo com Aditivo de Contrato.\n' +
      '5.3) Os pagamentos deverão ser realizados mensalmente via Boleto Bancário, Pix ou Cartão de Crédito com cobrança recorrente.' },
    { id: 'vencimento', titulo: 'Do Prazo de Vencimento (CLÁUSULA SEXTA)', texto:
      `6.1) A data de vencimento da mensalidade da CONTRATANTE será no ato da assinatura do presente instrumento e mensalmente todo dia ${dia} de cada mês até o término do contrato.` },
    { id: 'juros', titulo: 'Dos Juros por Atraso (CLÁUSULA SÉTIMA)', texto:
      '7.1) Eventual atraso no pagamento dos honorários pactuados implicará na cobrança de multa moratória de 2% (dois por cento) e juros de mora à razão de 1% (um por cento) ao mês pro rata.' },
    { id: 'rescisao', titulo: 'Da Rescisão (CLÁUSULA OITAVA)', texto:
      '8.1) A rescisão do presente instrumento não extinguirá os direitos e obrigações, decorrentes da celebração deste contrato e adquiridos durante sua vigência, que as partes tenham entre si e para com terceiros.\n' +
      '8.2) A continuidade da prestação de serviços está condicionada aos pagamentos em dia (adimplência), mensal e consecutiva, sendo os serviços ora firmados interrompidos, seja momentânea ou de forma definitiva, até que haja a adimplência dos pagamentos por parte da CONTRATANTE.\n' +
      '8.3) Em caso de interesse mútuo, o presente contrato poderá ser distratado sem qualquer ônus para quaisquer das partes.' },
    // Cláusula 9 (Propriedade Intelectual) dirigida pelos SERVIÇOS: base / B1 (google_ads) /
    // B2 (facebook_meta) / os dois rotulados. Derivada 100% no servidor a partir da seleção.
    clausulaPropriedade(blocos),
  ];

  // Consignado — cláusula própria "DAS RESPONSABILIDADES" (verbatim), só quando o bloco
  // consignado está selecionado. Validação jurídica pendente bloqueia a geração do PDF.
  if (blocos.includes('consignado')) {
    clausulas.push({ id: 'responsabilidades_consignado', titulo: 'Das Responsabilidades (Consignado)', texto:
      '2.1) A CONTRATADA atua exclusivamente como facilitadora na intermediação do acesso ao crédito, não sendo instituição financeira e não realizando concessão direta de crédito.\n' +
      '2.2) A análise, aprovação, concessão e gestão do crédito são de responsabilidade exclusiva dos correspondentes bancários parceiros e das instituições financeiras envolvidas.\n' +
      '2.3) A CONTRATADA não se responsabiliza por eventual recusa de crédito, indisponibilidade de margem consignável ou pelas condições comerciais ofertadas pelas instituições financeiras.\n' +
      '2.4) O pagamento dos procedimentos odontológicos realizados pela CONTRATANTE é de responsabilidade exclusiva do paciente, não cabendo à CONTRATADA qualquer responsabilidade sobre inadimplência ou descumprimento de obrigações financeiras.' });
  }

  // Fidelidade (opcional). Redação VERBATIM (cláusulas 2.2, 8.4 e 8.5 inseridas em
  // conjunto). Quando não houver fidelidade, NENHUMA das três é incluída. A validação
  // jurídica pendente bloqueia a geração do PDF (a prévia continua permitida).
  let fid: { ativo?: boolean; meses?: number | null } = {};
  try { fid = c.fidelidade ? JSON.parse(c.fidelidade) : {}; } catch { fid = {}; }
  if (fid.ativo && fid.meses) {
    const nMesesExt = numeroPorExtenso(fid.meses);
    const meses = nMesesExt ? `${fid.meses} (${nMesesExt})` : `${fid.meses}`;
    clausulas.push({ id: 'fidelidade', titulo: 'Da Fidelidade (Período Mínimo e Multa)', texto:
      `2.2) Fica estabelecido um período mínimo de ${meses} meses, durante o qual caso a CONTRATANTE queira rescindir unilateralmente o contrato ficará sujeita ao pagamento de multa contratual descrita na Cláusula Oitava.\n` +
      `8.4) Caso a CONTRATANTE opte por rescindir o contrato antes do término do período mínimo de ${meses} meses, ficará sujeita ao pagamento de multa contratual correspondente a 1 (uma) mensalidade dos serviços contratados, na quantia de ${valorTexto}, em parcela única, em conformidade com a cláusula quinta do presente instrumento.\n` +
      '8.5) Caso a CONTRATANTE opte por rescindir o presente contrato, deverá fazê-lo mediante comunicação prévia, por escrito, com antecedência mínima de 30 (trinta) dias corridos, ficando obrigada, em qualquer hipótese, ao pagamento do valor correspondente a esse período de aviso prévio, ainda que opte por não usufruir ou dispensar a execução dos serviços durante tal prazo, além do pagamento de todos os valores referentes aos serviços efetivamente prestados até a data da rescisão.' });
  }

  clausulas.push(
    { id: 'condicoes', titulo: 'Das Condições Gerais (CLÁUSULA DÉCIMA)', texto:
      '10.1) Qualquer serviço adicional aos expostos neste instrumento, desde que acordados entre as partes, serão objeto de Aditivo de Contrato.' },
    { id: 'foro', titulo: 'Do Foro (CLÁUSULA DÉCIMA PRIMEIRA)', texto:
      '11.1) Para dirimir quaisquer controvérsias oriundas do presente CONTRATO, as partes elegem o foro da Comarca de Bandeirantes, Estado do Paraná.' },
  );

  // Garantia (opt-in separado, nunca padrão). Redação VERBATIM da cláusula "DA GARANTIA".
  // Os DOIS valores da fonte (investimento mínimo de mídia paga e período) são
  // parametrizados pela admin. Validação jurídica pendente bloqueia a geração do PDF.
  const gar = parseGarantia(c.garantia);
  if (gar.ativo) {
    const invCent = gar.investimentoCentavos ?? 0;
    const invFmt = invCent ? formatBRL(invCent) : 'R$ __________';
    const invExt = invCent ? valorPorExtenso(invCent) : '';
    const investimento = invExt ? `${invFmt} (${invExt})` : invFmt;
    const per = gar.periodoMeses ?? 0;
    const perExt = numeroPorExtenso(per);
    const periodo = per ? (perExt ? `${per} (${perExt})` : `${per}`) : '__ ( )';
    clausulas.push({ id: 'garantia', titulo: 'Da Garantia (Cláusula Adicional — pendente de validação jurídica)', texto:
      '10.1) A CONTRATADA oferece garantia de resultados dentro do escopo do presente contrato, desde que o CONTRATANTE cumpra integralmente todas as condições abaixo estabelecidas. O descumprimento de qualquer delas implicará na imediata perda da garantia, sem prejuízo da continuidade da obrigação de pagamento das mensalidades contratadas:\n' +
      '10.1.1) Condições Operacionais:\n' +
      `10.1.1.1) Disponibilizar o valor mínimo de ${investimento} mensais exclusivamente para campanhas de mídia paga, sob gestão direta da CONTRATADA, em plataformas de anúncios digitais (tais como Meta Ads, Google Ads ou equivalentes), não sendo admitido o aporte em plataformas ou finalidades distintas daquelas indicadas pela CONTRATADA.\n` +
      '10.1.1.2) Efetuar os pagamentos das mensalidades e encargos nos prazos estabelecidos.\n' +
      '10.1.1.3) Conceder e manter ativos todos os acessos às contas de anúncios, páginas, perfis, sites e plataformas necessárias.\n' +
      '10.1.1.4) Manter ativos os canais de comunicação utilizados na captação e agendamento de pacientes (WhatsApp, telefone, e-mail, CRM).\n' +
      '10.1.1.5) Responder às solicitações de aprovação de campanhas, anúncios e materiais no prazo máximo de 48 (quarenta e oito) horas.\n' +
      '10.1.1.6) Não alterar, pausar ou excluir campanhas de anúncios sem autorização prévia da CONTRATADA.\n' +
      '10.1.2) Colaboração com Conteúdo e Protocolos:\n' +
      '10.1.2.1) Gravar semanalmente os roteiros de vídeos enviados pela CONTRATADA, destinados a anúncios e publicações em redes sociais, no prazo máximo de 7 (sete) dias após o recebimento.\n' +
      '10.1.2.2) Manter atualizados e disponíveis os dados de contato, agenda e informações necessárias para que a equipe da CONTRATADA realize os serviços de agendamento e confirmação de consultas dos pacientes originados pelas campanhas de marketing.\n' +
      '10.1.2.3) Garantir a disponibilidade mínima de horários na agenda da clínica para o atendimento dos pacientes originados pelas campanhas de marketing, abstendo-se de bloqueá-la de forma que inviabilize ou prejudique a execução do presente contrato.\n' +
      '10.1.2.4) Assegurar que a clínica esteja apta a receber os pacientes agendados, com estrutura, horários e equipe disponíveis para os atendimentos.\n' +
      '10.1.3) Prestação de Informações e Transparência:\n' +
      'Para validação da garantia, o CONTRATANTE deverá fornecer à CONTRATADA, de forma clara e verdadeira, os seguintes dados:\n' +
      'I – Relacionados às campanhas de marketing:\n' +
      '10.1.3.1) Número de pacientes que compareceram às consultas originadas das campanhas de marketing.\n' +
      '10.1.3.2) Número de pacientes que efetivamente fecharam tratamentos originados das campanhas de marketing.\n' +
      '10.1.3.3) Valor dos procedimentos fechados a partir das campanhas de marketing.\n' +
      'II – Relacionado à operação da clínica:\n' +
      '10.1.3.4) Faturamento mensal bruto da clínica, durante toda a vigência contratual, para fins de comprovação de resultados.\n' +
      'Parágrafo único: A recusa em fornecer os dados acima, a não entrega no prazo máximo de 7 (sete) dias úteis após solicitação da CONTRATADA, ou a apresentação de informações falsas, incompletas ou adulteradas, implicará na imediata perda da garantia.\n' +
      '10.1.4) Cordialidade e Respeito:\n' +
      '10.1.4.1) O CONTRATANTE, seus sócios, representantes e funcionários deverão manter postura respeitosa e profissional em todas as interações com a CONTRATADA e sua equipe, sendo vedada a prática de xingamentos, gritos, ameaças, difamações ou qualquer forma de intimidação.\n' +
      '10.1.4.2) O descumprimento desta obrigação acarretará a perda imediata da garantia, independentemente de aviso prévio.\n' +
      '10.1.5) Compromisso da CONTRATADA:\n' +
      `Caso, ao término do período inicial de ${periodo} meses de vigência contratual, o CONTRATANTE, cumprindo integralmente todas as obrigações acima descritas, não obtenha em vendas brutas resultado superior ao valor total das mensalidades pagas neste contrato durante o período, a CONTRATADA se compromete a realizar a devolução integral de todas as mensalidades pagas neste contrato ao longo dos ${periodo} meses.` });
  }

  return clausulas;
}

/** Conteúdo-base completo (título + cláusulas). */
export function montarConteudoBase(c: ContratoRow): ConteudoContrato {
  return { titulo: 'Contrato de Prestação de Serviços', clausulas: montarClausulasBase(c) };
}

/** Local/data de assinatura por extenso, para o preview. */
export function localData(c: ContratoRow): string {
  const cidade = c.cidade_assinatura || 'Bandeirantes/PR';
  return `${cidade}, ${dataPorExtenso(parseData(c.data_assinatura))}`;
}

/** True se alguma cláusula ainda contém o marcador de texto jurídico pendente. */
export function conteudoTemPendencia(conteudo: ConteudoContrato): boolean {
  return conteudo.clausulas.some((cl) => cl.texto.includes(MARCADOR_PENDENTE));
}
