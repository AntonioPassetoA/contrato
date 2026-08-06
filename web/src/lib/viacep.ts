import { onlyDigits } from './masks';

const UF_NOME: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
  PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

export interface EnderecoViaCep {
  logradouro: string;
  bairro: string;
  municipio: string;
  estado: string; // nome por extenso
}

/** Busca endereço pelo CEP. Retorna null se não encontrado. */
export async function buscarCep(cep: string): Promise<EnderecoViaCep | null> {
  const d = onlyDigits(cep);
  if (d.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    const j = await res.json();
    if (j.erro) return null;
    return {
      logradouro: j.logradouro || '',
      bairro: j.bairro || '',
      municipio: j.localidade || '',
      estado: UF_NOME[j.uf] || j.uf || '',
    };
  } catch {
    return null;
  }
}
