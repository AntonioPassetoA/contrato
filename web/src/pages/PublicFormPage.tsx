import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type CampoDef, type FormularioPublico } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Card, Label, Spinner } from '@/components/ui/misc';
import { applyMask, validarCampo } from '@/lib/masks';
import { buscarCep } from '@/lib/viacep';
import { CheckCircle2, PenLine, ShieldCheck, AlertCircle } from 'lucide-react';

function Centro({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center px-4">{children}</div>;
}

function Aviso({ titulo, texto, cor = 'info' }: { titulo: string; texto: string; cor?: 'erro' | 'info' | 'ok' }) {
  const paleta = {
    erro: 'bg-red-100 text-red-600',
    info: 'bg-amber-100 text-amber-600',
    ok: 'bg-emerald-100 text-emerald-600',
  }[cor];
  const Icone = cor === 'ok' ? CheckCircle2 : AlertCircle;
  return (
    <Centro>
      <Card className="w-full max-w-md p-8 text-center">
        <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${paleta}`}>
          <Icone className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">{titulo}</h1>
        <p className="mt-2 text-sm text-slate-500">{texto}</p>
      </Card>
    </Centro>
  );
}

function CampoInput({ campo, value, erro, onChange, onBlur }: {
  campo: CampoDef; value: string; erro?: string; onChange: (v: string) => void; onBlur: () => void;
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

function AvisoPrivacidade({ url }: { url: string }) {
  return (
    <p className="rounded-lg bg-slate-50 px-4 py-3 text-center text-xs text-slate-500 ring-1 ring-slate-200">
      Seus dados serão utilizados para elaboração, validação e assinatura do contrato.
      {url && <> Veja a <a href={url} target="_blank" rel="noreferrer" className="text-brand-700 underline">política de privacidade</a>.</>}
    </p>
  );
}

function Formulario({ token, campos, privacidadeUrl, onSucesso }: {
  token: string; campos: CampoDef[]; privacidadeUrl: string; onSucesso: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [erroGeral, setErroGeral] = useState('');

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
    const prefixo = campo.name.replace(/cep$/, '');
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
      await api.enviarFormularioPublico(token, values);
      onSucesso();
    } catch (err: any) {
      if (err?.data?.erros) {
        setErros(err.data.erros);
        setErroGeral('Confira os campos destacados.');
      } else if (err?.data?.error === 'ja_preenchido') {
        setErroGeral('Este formulário já foi enviado.');
      } else {
        setErroGeral(err?.message || 'Não foi possível enviar. Tente novamente.');
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

      {erroGeral && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{erroGeral}</p>}

      <AvisoPrivacidade url={privacidadeUrl} />

      <Button type="submit" size="lg" className="w-full" disabled={enviando}>
        {enviando ? <><Spinner /> Enviando...</> : <><PenLine className="h-5 w-5" /> Enviar dados</>}
      </Button>
      <p className="pb-4 text-center text-xs text-slate-400">
        <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
        Seus dados são usados apenas para preparar seu contrato.
      </p>
    </form>
  );
}

export default function PublicFormPage() {
  const { token = '' } = useParams();
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro' | 'ja_preenchido' | 'sucesso'>('carregando');
  const [erroMsg, setErroMsg] = useState<{ titulo: string; texto: string } | null>(null);
  const [dados, setDados] = useState<FormularioPublico | null>(null);

  useEffect(() => {
    api.abrirFormularioPublico(token)
      .then((r) => {
        if ('jaPreenchido' in r) { setEstado('ja_preenchido'); return; }
        setDados(r);
        setEstado('ok');
      })
      .catch((err) => {
        const code = err?.data?.error;
        const mapa: Record<string, { titulo: string; texto: string }> = {
          not_found: { titulo: 'Link não encontrado', texto: 'Confira se o link está correto ou peça um novo ao seu contato.' },
          indisponivel: { titulo: 'Link indisponível', texto: 'Este link não está mais ativo. Solicite um novo ao seu contato.' },
        };
        setErroMsg(mapa[code] || { titulo: 'Não foi possível abrir', texto: 'Tente novamente mais tarde.' });
        setEstado('erro');
      });
  }, [token]);

  if (estado === 'carregando') return <Centro><Spinner className="h-6 w-6 text-brand-700" /></Centro>;
  if (estado === 'erro' && erroMsg) return <Aviso titulo={erroMsg.titulo} texto={erroMsg.texto} cor="info" />;
  if (estado === 'ja_preenchido') {
    return <Aviso cor="ok" titulo="Formulário já enviado" texto="Recebemos seus dados. Se precisar corrigir algo, fale com o seu contato para reabrirmos o formulário." />;
  }
  if (estado === 'sucesso') {
    return <Aviso cor="ok" titulo="Dados enviados!" texto="Recebemos suas informações. Em breve entraremos em contato com os próximos passos do contrato." />;
  }
  if (!dados) return null;

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-6 sm:py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900">{dados.clinicaNome}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Preencha seus dados{dados.tipoPessoa === 'pj' ? ' (Pessoa Jurídica)' : ' (Pessoa Física)'} para prepararmos seu contrato.
        </p>
      </div>
      <Formulario token={token} campos={dados.campos} privacidadeUrl={dados.privacidadeUrl} onSucesso={() => setEstado('sucesso')} />
    </div>
  );
}
