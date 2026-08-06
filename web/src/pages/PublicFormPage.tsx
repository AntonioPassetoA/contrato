import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type PublicForm, type CampoDef } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Card, Label, Spinner } from '@/components/ui/misc';
import { applyMask, validarCampo } from '@/lib/masks';
import { buscarCep } from '@/lib/viacep';
import { Building2, User, CheckCircle2, PenLine, ShieldCheck, AlertCircle } from 'lucide-react';

type Tipo = 'pf' | 'pj';

// ---------- Telas de estado ----------

function Centro({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center px-4">{children}</div>;
}

function Aviso({ titulo, texto, tipo = 'erro' }: { titulo: string; texto: string; tipo?: 'erro' | 'info' }) {
  return (
    <Centro>
      <Card className="w-full max-w-md p-8 text-center">
        <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${tipo === 'erro' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">{titulo}</h1>
        <p className="mt-2 text-sm text-slate-500">{texto}</p>
      </Card>
    </Centro>
  );
}

// ---------- Campo individual ----------

function CampoInput({
  campo, value, erro, onChange, onBlur,
}: {
  campo: CampoDef;
  value: string;
  erro?: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const span = campo.colSpan === 2 ? 'sm:col-span-2' : '';
  return (
    <div className={span}>
      <Label htmlFor={campo.name}>
        {campo.label} {campo.required && <span className="text-red-500">*</span>}
      </Label>
      {campo.type === 'select' ? (
        <Select id={campo.name} value={value} invalid={!!erro} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}>
          <option value="">Selecione...</option>
          {campo.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      ) : (
        <Input
          id={campo.name}
          value={value}
          invalid={!!erro}
          placeholder={campo.placeholder}
          inputMode={['cpf', 'cnpj', 'cep', 'phone'].includes(campo.type) ? 'numeric' : undefined}
          onChange={(e) => onChange(applyMask(campo.type, e.target.value))}
          onBlur={onBlur}
        />
      )}
      {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
    </div>
  );
}

// ---------- Formulário ----------

function Formulario({ token, tipo, campos, onSucesso }: {
  token: string;
  tipo: Tipo;
  campos: CampoDef[];
  onSucesso: (link: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [erroGeral, setErroGeral] = useState('');

  // Agrupa os campos por "group" preservando a ordem.
  const grupos = useMemo(() => {
    const ordem: string[] = [];
    const map: Record<string, CampoDef[]> = {};
    for (const c of campos) {
      const g = c.group || 'Dados';
      if (!map[g]) { map[g] = []; ordem.push(g); }
      map[g].push(c);
    }
    return ordem.map((g) => ({ nome: g, campos: map[g] }));
  }, [campos]);

  function setValue(name: string, v: string) {
    setValues((s) => ({ ...s, [name]: v }));
  }

  async function handleCep(campo: CampoDef, v: string) {
    if (campo.type !== 'cep') return;
    const prefixo = campo.name.replace(/cep$/, ''); // sede_ ou res_
    const end = await buscarCep(v);
    if (end) {
      setValues((s) => ({
        ...s,
        [`${prefixo}logradouro`]: end.logradouro || s[`${prefixo}logradouro`] || '',
        [`${prefixo}bairro`]: end.bairro || s[`${prefixo}bairro`] || '',
        [`${prefixo}municipio`]: end.municipio || s[`${prefixo}municipio`] || '',
        [`${prefixo}estado`]: end.estado || s[`${prefixo}estado`] || '',
      }));
    }
  }

  function validarUm(campo: CampoDef) {
    const msg = validarCampo(campo.type, campo.required, values[campo.name] || '');
    setErros((e) => ({ ...e, [campo.name]: msg }));
    if (campo.type === 'cep' && (values[campo.name] || '').replace(/\D/g, '').length === 8) {
      handleCep(campo, values[campo.name]);
    }
  }

  function validarTudo(): boolean {
    const novos: Record<string, string> = {};
    for (const c of campos) {
      const msg = validarCampo(c.type, c.required, values[c.name] || '');
      if (msg) novos[c.name] = msg;
    }
    setErros(novos);
    return Object.keys(novos).length === 0;
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErroGeral('');
    if (!validarTudo()) {
      const primeiro = campos.find((c) => erros[c.name]);
      if (primeiro) document.getElementById(primeiro.name)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setEnviando(true);
    try {
      const r = await api.submit(token, tipo, values);
      onSucesso(r.shortLink);
    } catch (err: any) {
      if (err?.data?.erros) {
        setErros(err.data.erros);
        setErroGeral('Confira os campos destacados.');
      } else {
        setErroGeral(err?.message || 'Não foi possível gerar o contrato. Tente novamente.');
      }
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-6">
      {grupos.map((grupo) => (
        <Card key={grupo.nome} className="p-5 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-brand-700">{grupo.nome}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {grupo.campos.map((c) => (
              <CampoInput
                key={c.name}
                campo={c}
                value={values[c.name] || ''}
                erro={erros[c.name]}
                onChange={(v) => setValue(c.name, v)}
                onBlur={() => validarUm(c)}
              />
            ))}
          </div>
        </Card>
      ))}

      {erroGeral && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{erroGeral}</p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={enviando}>
        {enviando ? <><Spinner /> Gerando seu contrato...</> : <><PenLine className="h-5 w-5" /> Enviar e gerar contrato</>}
      </Button>
      <p className="pb-4 text-center text-xs text-slate-400">
        <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
        Seus dados são usados apenas para preencher este contrato.
      </p>
    </form>
  );
}

// ---------- Página ----------

export default function PublicFormPage() {
  const { token = '' } = useParams();
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando');
  const [erroMsg, setErroMsg] = useState<{ titulo: string; texto: string } | null>(null);
  const [dados, setDados] = useState<PublicForm | null>(null);
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [sucessoLink, setSucessoLink] = useState<string | null>(null);

  useEffect(() => {
    api.getPublicForm(token)
      .then((r) => {
        setDados(r);
        // se só um tipo suportado, já seleciona
        if (r.template.suportaPJ && !r.template.suportaPF) setTipo('pj');
        else if (r.template.suportaPF && !r.template.suportaPJ) setTipo('pf');
        setEstado('ok');
      })
      .catch((err) => {
        const code = err?.data?.error;
        const mapa: Record<string, { titulo: string; texto: string }> = {
          not_found: { titulo: 'Link não encontrado', texto: 'Confira se o link está correto ou peça um novo.' },
          expirado: { titulo: 'Link expirado', texto: 'Este link não é mais válido. Solicite um novo ao seu contato.' },
          cancelado: { titulo: 'Link cancelado', texto: 'Este link foi cancelado. Solicite um novo ao seu contato.' },
          ja_preenchido: { titulo: 'Formulário já preenchido', texto: 'Este contrato já foi gerado. Se precisar assinar, use o link enviado a você.' },
        };
        setErroMsg(mapa[code] || { titulo: 'Não foi possível abrir', texto: 'Tente novamente mais tarde.' });
        if (code === 'ja_preenchido' && err?.data?.shortLink) setSucessoLink(err.data.shortLink);
        setEstado('erro');
      });
  }, [token]);

  if (estado === 'carregando') return <Centro><Spinner className="h-6 w-6 text-brand-700" /></Centro>;

  if (sucessoLink) {
    return (
      <Centro>
        <Card className="w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Contrato pronto!</h1>
          <p className="mt-2 text-sm text-slate-500">Falta só a sua assinatura. Toque no botão abaixo para assinar com segurança pelo Autentique.</p>
          <a href={sucessoLink} target="_blank" rel="noreferrer" className="mt-6 block">
            <Button size="lg" className="w-full"><PenLine className="h-5 w-5" /> Assinar contrato</Button>
          </a>
          <p className="mt-3 break-all text-xs text-slate-400">{sucessoLink}</p>
        </Card>
      </Centro>
    );
  }

  if (estado === 'erro' && erroMsg) return <Aviso titulo={erroMsg.titulo} texto={erroMsg.texto} tipo="info" />;

  if (!dados) return null;

  const { template } = dados;
  const ambos = template.suportaPF && template.suportaPJ;

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-6 sm:py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900">{template.nome}</h1>
        <p className="mt-1 text-sm text-slate-500">Preencha seus dados para gerarmos o contrato para assinatura.</p>
      </div>

      {ambos && !tipo && (
        <Card className="p-6">
          <p className="mb-4 text-center text-sm font-medium text-slate-700">Você vai assinar como:</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button onClick={() => setTipo('pf')} className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-6 text-slate-700 transition hover:border-brand-500 hover:bg-brand-50">
              <User className="h-8 w-8 text-brand-700" />
              <span className="font-semibold">Pessoa Física</span>
              <span className="text-xs text-slate-400">CPF</span>
            </button>
            <button onClick={() => setTipo('pj')} className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-6 text-slate-700 transition hover:border-brand-500 hover:bg-brand-50">
              <Building2 className="h-8 w-8 text-brand-700" />
              <span className="font-semibold">Pessoa Jurídica</span>
              <span className="text-xs text-slate-400">Empresa / CNPJ</span>
            </button>
          </div>
        </Card>
      )}

      {tipo && (
        <>
          {ambos && (
            <button onClick={() => setTipo(null)} className="mb-4 text-sm text-brand-700 hover:underline">
              ← Trocar tipo ({tipo === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'})
            </button>
          )}
          <Formulario token={token} tipo={tipo} campos={dados.campos[tipo]!} onSucesso={setSucessoLink} />
        </>
      )}
    </div>
  );
}
