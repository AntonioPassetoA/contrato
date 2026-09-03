import extenso from 'extenso';

export function escapeHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(centavos: number): string {
  return brl.format(centavos / 100);
}

/** Valor por extenso em reais, ex.: "dois mil e duzentos reais". Retorna '' se falhar. */
export function valorPorExtenso(centavos: number): string {
  try {
    const reais = Math.floor(centavos / 100);
    const cents = Math.abs(centavos % 100);
    // extenso v3 espera ponto como separador decimal (ex.: "2200.00")
    const str = `${reais}.${String(cents).padStart(2, '0')}`;
    return extenso(str, { mode: 'currency' });
  } catch {
    return '';
  }
}

/** Inteiro por extenso, ex.: 6 -> "seis". Retorna '' se falhar/for inválido. */
export function numeroPorExtenso(n: number): string {
  try {
    if (!Number.isInteger(n) || n < 0) return '';
    return extenso(String(n), { mode: 'number' });
  } catch {
    return '';
  }
}

const dataFmt = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Data por extenso, ex.: "4 de agosto de 2026". */
export function dataPorExtenso(date: Date): string {
  return dataFmt.format(date);
}

/**
 * Monta um trecho de endereço juntando as partes não vazias.
 * Ex.: "Rua X, nº 10, Sala 2, Centro, no município de Curitiba, estado do PR, CEP 80000-000".
 */
export function montarEndereco(p: {
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  estado?: string;
  cep?: string;
}): string {
  const partes: string[] = [];
  if (p.logradouro) partes.push(p.logradouro);
  if (p.numero) partes.push(`nº ${p.numero}`);
  if (p.complemento) partes.push(p.complemento);
  if (p.bairro) partes.push(p.bairro);
  if (p.municipio) partes.push(`no município de ${p.municipio}`);
  if (p.estado) partes.push(`estado do ${p.estado}`);
  if (p.cep) partes.push(`CEP ${p.cep}`);
  return partes.join(', ');
}
