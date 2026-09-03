// Mascaramento de dados pessoais para a AUDITORIA.
// A auditoria registra QUAIS campos mudaram, mas NUNCA guarda o valor pessoal completo
// (CPF, RG, endereço, telefone, e-mail etc.). Guarda apenas uma versão mascarada.

const PONTO = '•';

/** Campos identificáveis que devem ser mascarados na auditoria. */
const CAMPOS_SENSIVEIS = new Set([
  'nome', 'razao_social', 'nome_fantasia', 'cpf', 'cnpj', 'rg', 'telefone', 'email',
  'res_cep', 'res_logradouro', 'res_numero', 'res_complemento', 'res_bairro', 'res_municipio', 'res_estado',
  'sede_cep', 'sede_logradouro', 'sede_numero', 'sede_complemento', 'sede_bairro', 'sede_municipio', 'sede_estado',
]);

function mascararDigitos(v: string): string {
  const d = v.replace(/\D/g, '');
  if (!d) return PONTO.repeat(4);
  const visiveis = d.slice(-2);
  return PONTO.repeat(Math.max(2, d.length - 2)) + visiveis;
}

function mascararEmail(v: string): string {
  const [user, dominio] = v.split('@');
  if (!dominio) return PONTO.repeat(4);
  const ini = user ? user[0] : '';
  return `${ini}${PONTO.repeat(3)}@${dominio}`;
}

function mascararTexto(v: string): string {
  const t = v.trim();
  if (!t) return '';
  if (t.length <= 2) return PONTO.repeat(t.length);
  return t[0] + PONTO.repeat(Math.min(6, t.length - 1));
}

/** Mascara um valor conforme o nome do campo. Fora da lista sensível, retorna o valor. */
export function mascararCampo(campo: string, valor: string | null | undefined): string {
  const v = String(valor ?? '');
  if (!v) return '';
  if (!CAMPOS_SENSIVEIS.has(campo)) return v; // profissão, estado civil, nacionalidade, órgão etc.
  if (campo === 'email') return mascararEmail(v);
  if (['cpf', 'cnpj', 'rg', 'telefone', 'res_cep', 'sede_cep', 'res_numero', 'sede_numero'].includes(campo)) {
    return mascararDigitos(v);
  }
  return mascararTexto(v);
}

export function ehCampoSensivel(campo: string): boolean {
  return CAMPOS_SENSIVEIS.has(campo);
}
