import type { TemplateDef, TipoPessoa } from './types';
import { planoPrata } from './plano-prata';

// Registro de modelos disponíveis no sistema.
// Para adicionar um novo modelo, crie o arquivo dele e inclua aqui.
const TEMPLATES: TemplateDef[] = [planoPrata];

export function listTemplates() {
  return TEMPLATES.map((t) => ({
    id: t.id,
    nome: t.nome,
    descricao: t.descricao,
    suportaPF: t.suportaPF,
    suportaPJ: t.suportaPJ,
    camposAdmin: t.camposAdmin,
  }));
}

export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Retorna a definição de campos do formulário do cliente para um modelo + tipo de pessoa. */
export function getCampos(id: string, tipo: TipoPessoa) {
  const t = getTemplate(id);
  if (!t) return null;
  if (tipo === 'pf' && !t.suportaPF) return null;
  if (tipo === 'pj' && !t.suportaPJ) return null;
  return t.campos(tipo);
}
