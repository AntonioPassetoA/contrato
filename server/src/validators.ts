// Validações e normalizações de dados brasileiros.

export function onlyDigits(v: string): string {
  return (v || '').replace(/\D/g, '');
}

export function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(cpf[i], 10) * (len + 1 - i);
    const d = (sum * 10) % 11;
    return d === 10 ? 0 : d;
  };
  return calc(9) === parseInt(cpf[9], 10) && calc(10) === parseInt(cpf[10], 10);
}

export function isValidCNPJ(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len: number) => {
    const nums = cnpj.substring(0, len);
    let pos = len - 7;
    let sum = 0;
    for (let i = len; i >= 1; i--) {
      sum += parseInt(nums[len - i], 10) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return (
    calc(12) === parseInt(cnpj[12], 10) && calc(13) === parseInt(cnpj[13], 10)
  );
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());
}

export function isValidPhoneBR(value: string): boolean {
  const d = onlyDigits(value);
  // 10 dígitos (fixo com DDD) ou 11 (celular com DDD)
  return d.length === 10 || d.length === 11;
}

export function isValidCEP(value: string): boolean {
  return onlyDigits(value).length === 8;
}

// ----- Formatações -----

export function formatCPF(value: string): string {
  const d = onlyDigits(value).padStart(11, '0').slice(0, 11);
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export function formatCNPJ(value: string): string {
  const d = onlyDigits(value).padStart(14, '0').slice(0, 14);
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

export function formatCEP(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  return d.replace(/(\d{5})(\d{3})/, '$1-$2');
}

export function formatPhoneBR(value: string): string {
  const d = onlyDigits(value);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return value;
}
