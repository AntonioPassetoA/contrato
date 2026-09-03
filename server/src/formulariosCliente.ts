// Definição dos campos do FORMULÁRIO DO CLIENTE (público) e validação server-side.
//
// Fonte única dos campos que o cliente preenche. A API pública devolve SÓ isto
// (mais o nome da clínica) — nunca valores, blocos, fidelidade, CONTRATADA,
// testemunhas, vendedor ou qualquer dado interno.

import type { CampoDef, TipoPessoa } from './templates/types';
import { isValidCPF, isValidCNPJ, isValidEmail, isValidPhoneBR, isValidCEP } from './validators';

const ESTADO_CIVIL = [
  { value: 'solteiro(a)', label: 'Solteiro(a)' },
  { value: 'casado(a)', label: 'Casado(a)' },
  { value: 'divorciado(a)', label: 'Divorciado(a)' },
  { value: 'viúvo(a)', label: 'Viúvo(a)' },
  { value: 'união estável', label: 'União estável' },
  { value: 'separado(a)', label: 'Separado(a)' },
];

function endereco(prefixo: string, grupo: string): CampoDef[] {
  return [
    { name: `${prefixo}cep`, label: 'CEP', type: 'cep', required: true, group: grupo, colSpan: 1 },
    { name: `${prefixo}logradouro`, label: 'Logradouro', type: 'text', required: true, group: grupo, colSpan: 2, placeholder: 'Rua, Avenida...' },
    { name: `${prefixo}numero`, label: 'Número', type: 'text', required: true, group: grupo, colSpan: 1, placeholder: 'nº ou S/N' },
    { name: `${prefixo}complemento`, label: 'Complemento', type: 'text', required: false, group: grupo, colSpan: 1, placeholder: 'Opcional' },
    { name: `${prefixo}bairro`, label: 'Bairro', type: 'text', required: true, group: grupo, colSpan: 1 },
    { name: `${prefixo}municipio`, label: 'Município', type: 'text', required: true, group: grupo, colSpan: 1 },
    { name: `${prefixo}estado`, label: 'Estado', type: 'text', required: true, group: grupo, colSpan: 2, placeholder: 'Ex.: Paraná' },
  ];
}

function pessoa(labelNome: string, grupo: string): CampoDef[] {
  return [
    { name: 'nome', label: labelNome, type: 'text', required: true, group: grupo, colSpan: 2 },
    { name: 'nacionalidade', label: 'Nacionalidade', type: 'text', required: true, group: grupo, colSpan: 1, placeholder: 'Brasileiro(a)' },
    { name: 'estado_civil', label: 'Estado civil', type: 'select', required: true, group: grupo, colSpan: 1, options: ESTADO_CIVIL },
    { name: 'profissao', label: 'Profissão', type: 'text', required: true, group: grupo, colSpan: 1 },
    { name: 'rg', label: 'RG', type: 'text', required: true, group: grupo, colSpan: 1 },
    { name: 'rg_orgao', label: 'Órgão expedidor', type: 'text', required: true, group: grupo, colSpan: 1, placeholder: 'Ex.: SSP/PR' },
    { name: 'cpf', label: 'CPF', type: 'cpf', required: true, group: grupo, colSpan: 1 },
    { name: 'telefone', label: 'Telefone / WhatsApp', type: 'phone', required: true, group: grupo, colSpan: 1 },
    { name: 'email', label: 'E-mail', type: 'email', required: true, group: grupo, colSpan: 1, placeholder: 'voce@email.com' },
  ];
}

/** Campos do formulário do cliente para o tipo de pessoa definido pela Manu. */
export function camposCliente(tipo: TipoPessoa): CampoDef[] {
  if (tipo === 'pj') {
    return [
      { name: 'razao_social', label: 'Razão social', type: 'text', required: true, group: 'Dados da empresa', colSpan: 2 },
      { name: 'nome_fantasia', label: 'Nome fantasia', type: 'text', required: true, group: 'Dados da empresa', colSpan: 2 },
      { name: 'cnpj', label: 'CNPJ', type: 'cnpj', required: true, group: 'Dados da empresa', colSpan: 2 },
      ...endereco('sede_', 'Endereço da empresa'),
      ...pessoa('Nome completo do representante legal', 'Representante legal'),
      ...endereco('res_', 'Endereço do representante'),
    ];
  }
  return [
    ...pessoa('Nome completo', 'Seus dados'),
    ...endereco('res_', 'Seu endereço'),
  ];
}

/** Valida o formulário no servidor. Retorna mapa de erros (vazio = ok). */
export function validarFormularioCliente(tipo: TipoPessoa, form: Record<string, unknown>): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const campo of camposCliente(tipo)) {
    const v = String(form?.[campo.name] ?? '').trim();
    if (!v) {
      if (campo.required) erros[campo.name] = 'Campo obrigatório';
      continue;
    }
    switch (campo.type) {
      case 'cpf': if (!isValidCPF(v)) erros[campo.name] = 'CPF inválido'; break;
      case 'cnpj': if (!isValidCNPJ(v)) erros[campo.name] = 'CNPJ inválido'; break;
      case 'phone': if (!isValidPhoneBR(v)) erros[campo.name] = 'Telefone inválido'; break;
      case 'email': if (!isValidEmail(v)) erros[campo.name] = 'E-mail inválido'; break;
      case 'cep': if (!isValidCEP(v)) erros[campo.name] = 'CEP inválido'; break;
    }
  }
  return erros;
}

/** Mantém no form_data apenas as chaves conhecidas dos campos (descarta lixo enviado). */
export function sanitizarFormulario(tipo: TipoPessoa, form: Record<string, unknown>): Record<string, string> {
  const limpo: Record<string, string> = {};
  for (const campo of camposCliente(tipo)) {
    limpo[campo.name] = String(form?.[campo.name] ?? '').trim();
  }
  return limpo;
}
