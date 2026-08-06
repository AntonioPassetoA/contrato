import type { TemplateDef, CampoDef, TipoPessoa, RenderInput } from './types';
import {
  escapeHtml,
  formatBRL,
  valorPorExtenso,
  dataPorExtenso,
  montarEndereco,
} from '../format';

const ESTADO_CIVIL_OPCOES = [
  { value: 'solteiro(a)', label: 'Solteiro(a)' },
  { value: 'casado(a)', label: 'Casado(a)' },
  { value: 'divorciado(a)', label: 'Divorciado(a)' },
  { value: 'viúvo(a)', label: 'Viúvo(a)' },
  { value: 'união estável', label: 'União estável' },
  { value: 'separado(a)', label: 'Separado(a)' },
];

/** Campos de endereço reutilizáveis, com prefixo (sede_ ou res_). */
function camposEndereco(prefixo: string, grupo: string): CampoDef[] {
  return [
    { name: `${prefixo}cep`, label: 'CEP', type: 'cep', required: true, group: grupo, colSpan: 1 },
    { name: `${prefixo}logradouro`, label: 'Logradouro', type: 'text', required: true, group: grupo, colSpan: 2, placeholder: 'Rua, Avenida...' },
    { name: `${prefixo}numero`, label: 'Número', type: 'text', required: true, group: grupo, colSpan: 1, placeholder: 'nº ou S/N' },
    { name: `${prefixo}complemento`, label: 'Complemento', type: 'text', required: false, group: grupo, colSpan: 1, placeholder: 'Sala, quadra, lote... (opcional)' },
    { name: `${prefixo}bairro`, label: 'Bairro', type: 'text', required: true, group: grupo, colSpan: 1 },
    { name: `${prefixo}municipio`, label: 'Município', type: 'text', required: true, group: grupo, colSpan: 1 },
    { name: `${prefixo}estado`, label: 'Estado', type: 'text', required: true, group: grupo, colSpan: 2, placeholder: 'Ex.: Paraná' },
  ];
}

function camposPessoa(labelNome: string, grupo: string): CampoDef[] {
  return [
    { name: 'nome', label: labelNome, type: 'text', required: true, group: grupo, colSpan: 2 },
    { name: 'nacionalidade', label: 'Nacionalidade', type: 'text', required: true, group: grupo, colSpan: 1, placeholder: 'Brasileiro(a)' },
    { name: 'estado_civil', label: 'Estado civil', type: 'select', required: true, group: grupo, colSpan: 1, options: ESTADO_CIVIL_OPCOES },
    { name: 'profissao', label: 'Profissão', type: 'text', required: true, group: grupo, colSpan: 1 },
    { name: 'rg', label: 'RG', type: 'text', required: true, group: grupo, colSpan: 1 },
    { name: 'rg_orgao', label: 'Órgão expedidor', type: 'text', required: true, group: grupo, colSpan: 1, placeholder: 'Ex.: SSP/PR' },
    { name: 'cpf', label: 'CPF', type: 'cpf', required: true, group: grupo, colSpan: 1 },
    { name: 'telefone', label: 'Telefone / WhatsApp', type: 'phone', required: true, group: grupo, colSpan: 2 },
  ];
}

function campos(tipo: TipoPessoa): CampoDef[] {
  if (tipo === 'pj') {
    return [
      { name: 'razao_social', label: 'Razão social', type: 'text', required: true, group: 'Dados da empresa (CONTRATANTE)', colSpan: 2 },
      { name: 'cnpj', label: 'CNPJ', type: 'cnpj', required: true, group: 'Dados da empresa (CONTRATANTE)', colSpan: 2 },
      ...camposEndereco('sede_', 'Endereço da sede'),
      ...camposPessoa('Nome do representante legal', 'Dados do representante legal'),
      ...camposEndereco('res_', 'Endereço do representante'),
    ];
  }
  return [
    ...camposPessoa('Nome completo', 'Seus dados'),
    ...camposEndereco('res_', 'Seu endereço'),
  ];
}

function render(input: RenderInput): string {
  const f = input.form;
  const g = (k: string) => escapeHtml(f[k] ?? '');

  const contratante =
    input.tipoPessoa === 'pj'
      ? `<strong>${g('razao_social')}</strong>, inscrita no CNPJ n° ${g('cnpj')}, com sede na ${escapeHtml(
          montarEndereco({
            logradouro: f.sede_logradouro, numero: f.sede_numero, complemento: f.sede_complemento,
            bairro: f.sede_bairro, municipio: f.sede_municipio, estado: f.sede_estado, cep: f.sede_cep,
          })
        )}, representada por <strong>${g('nome')}</strong>, ${g('nacionalidade')}, ${g('estado_civil')}, ${g('profissao')}, residente e domiciliado na ${escapeHtml(
          montarEndereco({
            logradouro: f.res_logradouro, numero: f.res_numero, complemento: f.res_complemento,
            bairro: f.res_bairro, municipio: f.res_municipio, estado: f.res_estado, cep: f.res_cep,
          })
        )}, portador da Cédula de Identidade RG n° ${g('rg')}, expedida pela ${g('rg_orgao')}, e inscrito no CPF n° ${g('cpf')} e telefone ${g('telefone')}.`
      : `<strong>${g('nome')}</strong>, ${g('nacionalidade')}, ${g('estado_civil')}, ${g('profissao')}, portador da Cédula de Identidade RG n° ${g('rg')}, expedida pela ${g('rg_orgao')}, inscrito no CPF n° ${g('cpf')}, residente e domiciliado na ${escapeHtml(
          montarEndereco({
            logradouro: f.res_logradouro, numero: f.res_numero, complemento: f.res_complemento,
            bairro: f.res_bairro, municipio: f.res_municipio, estado: f.res_estado, cep: f.res_cep,
          })
        )}, e telefone ${g('telefone')}.`;

  const centavos = input.admin.valorCentavos ?? 0;
  const dia = input.admin.diaVencimento ?? 1;
  const valorFmt = centavos ? formatBRL(centavos) : 'R$ __________';
  const ext = centavos ? valorPorExtenso(centavos) : '';
  const valorTexto = ext ? `${valorFmt} (${ext})` : valorFmt;
  const nomeSignatario = g('nome');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Georgia, serif; font-size: 11.5pt; line-height: 1.5; color: #111; text-align: justify; }
  h1 { font-size: 14pt; text-align: center; margin: 0 0 18px; text-transform: uppercase; }
  h2 { font-size: 11.5pt; margin: 16px 0 2px; text-transform: uppercase; }
  .clausula { font-weight: bold; margin: 0 0 4px; }
  p { margin: 0 0 8px; }
  .parte-titulo { font-weight: bold; margin: 12px 0 4px; }
  .assinaturas { margin-top: 42px; }
  .linha-assinatura { margin-top: 40px; text-align: center; }
  .sig-row { display: flex; justify-content: space-between; gap: 40px; margin-top: 40px; text-align: center; }
  .sig-col { flex: 1; }
  .sig-line { border-top: 1px solid #111; margin: 0 auto 4px; width: 90%; padding-top: 4px; }
  small { font-size: 9.5pt; }
</style></head><body>

<h1>Contrato de Prestação de Serviços</h1>

<p class="parte-titulo">CONTRATANTE:</p>
<p>${contratante}</p>

<p class="parte-titulo">CONTRATADA:</p>
<p><strong>PRIME RESULTS LTDA</strong>, empresa de direito privado, inscrita no CNPJ nº 44.336.151/0001-90, com sede na Rua João Francisco Ferreira, nº 259, Centro, na cidade de Bandeirantes/PR, endereço eletrônico faleconosco@masterresults.com.br, tendo como representantes <strong>VINÍCIUS RAGAZZI MORAES</strong>, brasileiro, união estável, empresário, portador do RG nº 10.318.481-9, inscrito no CPF nº 083.489.569-21, residente na Rua Benedito Bernardes de Oliveira, nº 50, Centro, na cidade de Bandeirantes/PR e <strong>ALEX VINÍCIUS GIMENES GURRÃO</strong>, brasileiro, casado, empresário, portador do RG nº 12.525.419-5 SSP/PR, inscrito no CPF nº 057.262.009-85, residente na Rua Dino Veiga, nº 601, Centro, na cidade de Bandeirantes/PR.</p>

<h2>Do Objeto do Contrato</h2>
<p class="clausula">CLÁUSULA PRIMEIRA</p>
<p>1.1) Constitui objeto do presente contrato a Prestação de Serviço de Marketing Digital nas mídias sociais Facebook e Instagram, pela CONTRATADA à CONTRATANTE.</p>
<p>1.2) Os serviços, acertados neste instrumento, consistirão em:</p>
<p>1.2.1 – Implementação da metodologia Funil de Captação de Leads, conforme descrito abaixo:</p>
<p>1.2.1.1 – Elaboração de anúncios com uso de imagens e textos para serem divulgados nas mídias sociais, preferencialmente no Instagram, buscando educar possíveis clientes e captar leads.</p>
<p>1.2.1.2 – Impulsionamento do material produzido através do Gerenciador de Negócios do Facebook e Instagram conforme o objetivo da metodologia.</p>
<p>1.2.1.3 – Coleta de dados e compartilhamento por meio de uma ferramenta de gestão de clientes online com informações em tempo real.</p>
<p>1.2.1.4 – Relatório periódico dos resultados obtidos.</p>
<p>1.2.2 – Implementação da metodologia Clínica Top 1, conforme descrito abaixo:</p>
<p>1.2.2.1 – Análise dos concorrentes no site Google Maps.</p>
<p>1.2.2.2 – Planejamento de palavras-chaves a serem posicionadas no Google Maps.</p>
<p>1.2.2.3 – Otimização de perfil no Google Maps para as palavras-chaves planejadas.</p>
<p>1.2.2.4 – Repostagem no Google Maps dos conteúdos postados no Instagram no formato Feed, quando compatível.</p>
<p>1.2.2.5 – Relatório periódico dos resultados obtidos.</p>

<h2>Do Prazo do Contrato</h2>
<p class="clausula">CLÁUSULA SEGUNDA</p>
<p>2.1) A validade do presente contrato é de 3 (três) meses. Após o término desse prazo, o contrato irá se renovar automaticamente, por prazo indeterminado, desde que não haja objeção pela CONTRATANTE e CONTRATADA.</p>

<h2>Das Obrigações da Contratante</h2>
<p class="clausula">CLÁUSULA TERCEIRA</p>
<p>3.1) A CONTRATANTE deverá fornecer à CONTRATADA todas as informações necessárias à realização dos serviços, devendo especificar os detalhes necessários à perfeita consecução dos mesmos.</p>
<p>3.2) A CONTRATANTE se obriga a apresentar à CONTRATADA, quando solicitado, todos os documentos e informações necessários ao bom e fiel cumprimento do presente instrumento.</p>
<p>3.3) A CONTRATANTE deverá efetuar o devido pagamento à CONTRATADA, em conformidade com a cláusula quinta do presente instrumento.</p>

<h2>Das Obrigações da Contratada</h2>
<p class="clausula">CLÁUSULA QUARTA</p>
<p>4.1) A CONTRATADA se obriga a realizar todos os atos relacionados aos serviços na cláusula primeira do presente instrumento.</p>
<p>4.2) A CONTRATADA se obriga a utilizar técnicas condizentes com os serviços a serem prestados, efetuando todos os esforços para a sua consecução.</p>
<p>4.3) A CONTRATADA empregará parte do seu corpo técnico para a realização de pesquisa e desenvolvimento na área assessorada, bem como para a solução e prevenção de eventuais problemas, nomeando um responsável para a administração das atividades e se compromete a cumprir suas obrigações no prazo de 15 dias úteis.</p>

<h2>Do Pagamento</h2>
<p class="clausula">CLÁUSULA QUINTA</p>
<p>5.1) Pela prestação dos serviços a CONTRATANTE pagará antecipadamente à CONTRATADA a quantia de ${valorTexto}, em parcela única, no ato da assinatura do presente instrumento e mensalmente todo dia ${escapeHtml(String(dia))} de cada mês até o término do contrato.</p>
<p>5.2) Os honorários convencionados no presente contrato não se confundem com eventuais serviços prestados em outras áreas, e em caso de serviços adicionais a serem realizados no curso destes acordados, o adicional aos honorários ora estipulados serão fixados de acordo com Aditivo de Contrato.</p>
<p>5.3) Os pagamentos deverão ser realizados mensalmente via Boleto Bancário, Pix ou Cartão de Crédito com cobrança recorrente.</p>

<h2>Do Prazo de Vencimento</h2>
<p class="clausula">CLÁUSULA SEXTA</p>
<p>6.1) A data de vencimento da mensalidade da CONTRATANTE será no ato da assinatura do presente instrumento e mensalmente todo dia ${escapeHtml(String(dia))} de cada mês até o término do contrato.</p>

<h2>Dos Juros por Atraso</h2>
<p class="clausula">CLÁUSULA SÉTIMA</p>
<p>7.1) Eventual atraso no pagamento dos honorários pactuados implicará na cobrança de multa moratória de 2% (dois por cento) e juros de mora à razão de 1% (um por cento) ao mês pro rata.</p>

<h2>Da Rescisão</h2>
<p class="clausula">CLÁUSULA OITAVA</p>
<p>8.1) A rescisão do presente instrumento não extinguirá os direitos e obrigações, decorrentes da celebração deste contrato e adquiridos durante sua vigência, que as partes tenham entre si e para com terceiros.</p>
<p>8.2) A continuidade da prestação de serviços está condicionada aos pagamentos em dia (adimplência), mensal e consecutiva, sendo os serviços ora firmados interrompidos, seja momentânea ou de forma definitiva, até que haja a adimplência dos pagamentos por parte da CONTRATANTE.</p>
<p>8.3) Em caso de interesse mútuo, o presente contrato poderá ser distratado sem qualquer ônus para quaisquer das partes.</p>

<h2>Da Propriedade Intelectual</h2>
<p class="clausula">CLÁUSULA NONA</p>
<p>9.1) Toda propriedade intelectual desenvolvida pela CONTRATADA em decorrência da execução do presente Contrato será de sua titularidade exclusiva.</p>
<p>9.2) É vedado à CONTRATANTE promover o registro de qualquer propriedade intelectual de titularidade da CONTRATADA.</p>
<p>9.3) É vedado à CONTRATANTE reproduzir a metodologia de trabalho utilizada e desenvolvida pela CONTRATADA em quaisquer contratos de prestação de serviços com outras empresas.</p>

<h2>Das Condições Gerais</h2>
<p class="clausula">CLÁUSULA DÉCIMA</p>
<p>10.1) Qualquer serviço adicional aos expostos neste instrumento, desde que acordados entre as partes, serão objeto de Aditivo de Contrato.</p>

<h2>Do Foro</h2>
<p class="clausula">CLÁUSULA DÉCIMA PRIMEIRA</p>
<p>11.1) Para dirimir quaisquer controvérsias oriundas do presente CONTRATO, as partes elegem o foro da Comarca de Bandeirantes, Estado do Paraná.</p>

<p style="margin-top:16px">Por estarem justos e contratados, firmam o presente instrumento, em duas vias de igual teor e forma, juntamente com a assinatura de 02 (duas) testemunhas.</p>

<div class="assinaturas">
  <p>Bandeirantes/PR, ${escapeHtml(dataPorExtenso(input.dataAssinatura))}</p>

  <p class="parte-titulo" style="margin-top:28px">Representante da CONTRATANTE:</p>
  <div class="linha-assinatura">
    <div class="sig-line" style="width:60%"></div>
    <div><strong>${nomeSignatario}</strong></div>
  </div>

  <p class="parte-titulo" style="margin-top:28px">Representantes da CONTRATADA:</p>
  <div class="sig-row">
    <div class="sig-col"><div class="sig-line"></div>ALEX VINÍCIUS GIMENES GURRÃO</div>
    <div class="sig-col"><div class="sig-line"></div>VINÍCIUS RAGAZZI DE MORAES</div>
  </div>
  <div class="sig-row">
    <div class="sig-col"><div class="sig-line"></div>EMANUELLE DE OLIVEIRA<br><small>CPF: 093.968.789-52<br>(Testemunha 01)</small></div>
    <div class="sig-col"><div class="sig-line"></div>GUSTAVO ARAUJO RAGAZZI<br><small>CPF: 145.156.569-02<br>(Testemunha 02)</small></div>
  </div>
</div>

</body></html>`;
}

export const planoPrata: TemplateDef = {
  id: 'plano-prata',
  nome: 'Plano Prata',
  descricao: 'Contrato de prestação de serviços de marketing digital — Plano Prata.',
  suportaPF: true,
  suportaPJ: true,
  camposAdmin: [
    { name: 'valor', label: 'Valor mensal (R$)', type: 'valor', required: true, help: 'Valor cobrado por mês neste contrato.' },
    { name: 'dia_vencimento', label: 'Dia do vencimento', type: 'dia', required: true, help: 'Dia do mês em que a mensalidade vence (1 a 31).' },
  ],
  campos,
  documentName: (input) => {
    const nome = input.form.razao_social || input.form.nome || 'Cliente';
    return `Plano Prata - ${nome}`;
  },
  signatariosFixos: [
    { name: 'Alex Vinícius Gimenes Gurrão', email: 'alex@masterresults.com.br', action: 'SIGN' },
    { name: 'Vinícius Ragazzi de Moraes', email: 'vinicius.pokevi@gmail.com', action: 'SIGN' },
    { name: 'Emanuelle de Oliveira', email: 'emanuelleo703@gmail.com', action: 'SIGN_AS_A_WITNESS' },
    { name: 'Gustavo Araujo Ragazzi', email: 'gragazzi.gr@gmail.com', action: 'SIGN_AS_A_WITNESS' },
  ],
  render,
};
