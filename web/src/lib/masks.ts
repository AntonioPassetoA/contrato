// Máscaras e validações no cliente (espelham as regras do backend).

export function onlyDigits(v: string): string {
  return (v || '').replace(/\D/g, '');
}

export function maskCPF(v: string): string {
  return onlyDigits(v)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function maskCNPJ(v: string): string {
  return onlyDigits(v)
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export function maskCEP(v: string): string {
  return onlyDigits(v).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
}

export function maskPhone(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

export function maskCurrency(v: string): string {
  const d = onlyDigits(v);
  if (!d) return '';
  const n = Number(d) / 100;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function applyMask(type: string, value: string): string {
  switch (type) {
    case 'cpf': return maskCPF(value);
    case 'cnpj': return maskCNPJ(value);
    case 'cep': return maskCEP(value);
    case 'phone': return maskPhone(value);
    default: return value;
  }
}

// ----- Validações -----

export function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(cpf[i], 10) * (len + 1 - i);
    const d = (sum * 10) % 11;
    return d === 10 ? 0 : d;
  };
  return calc(9) === +cpf[9] && calc(10) === +cpf[10];
}

export function isValidCNPJ(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len: number) => {
    const nums = cnpj.substring(0, len);
    let pos = len - 7;
    let sum = 0;
    for (let i = len; i >= 1; i--) {
      sum += +nums[len - i] * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === +cnpj[12] && calc(13) === +cnpj[13];
}

export function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim());
}

export function isValidPhone(v: string) {
  const d = onlyDigits(v);
  return d.length === 10 || d.length === 11;
}

export function isValidCEP(v: string) {
  return onlyDigits(v).length === 8;
}

/** Retorna mensagem de erro para um campo, ou '' se válido. */
export function validarCampo(type: string, required: boolean, value: string): string {
  const v = (value || '').trim();
  if (!v) return required ? 'Campo obrigatório' : '';
  switch (type) {
    case 'cpf': return isValidCPF(v) ? '' : 'CPF inválido';
    case 'cnpj': return isValidCNPJ(v) ? '' : 'CNPJ inválido';
    case 'phone': return isValidPhone(v) ? '' : 'Telefone inválido';
    case 'cep': return isValidCEP(v) ? '' : 'CEP inválido';
    case 'email': return isValidEmail(v) ? '' : 'E-mail inválido';
    default: return '';
  }
}
