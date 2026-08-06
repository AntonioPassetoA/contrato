import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type TemplateResumo, type Contrato } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Card, Label, Spinner, StatusBadge } from '@/components/ui/misc';
import { maskCurrency } from '@/lib/masks';
import {
  Plus, Copy, Check, RefreshCw, FileText, ExternalLink, LogOut, Link2, MessageCircle,
} from 'lucide-react';

function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
      }}
    >
      {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      {copiado ? 'Copiado' : label}
    </Button>
  );
}

function GerarLink({ templates, onCriado }: { templates: TemplateResumo[]; onCriado: () => void }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [clienteLabel, setClienteLabel] = useState('');
  const [valor, setValor] = useState('');
  const [dia, setDia] = useState('');
  const [expira, setExpira] = useState('7');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<{ url: string } | null>(null);

  const template = templates.find((t) => t.id === templateId);
  const precisaValor = template?.camposAdmin.some((c) => c.type === 'valor');
  const precisaDia = template?.camposAdmin.some((c) => c.type === 'dia');

  async function gerar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setLoading(true);
    setResultado(null);
    try {
      const r = await api.criarLink({
        templateId,
        clienteLabel: clienteLabel || undefined,
        valorReais: precisaValor ? valor : undefined,
        diaVencimento: precisaDia ? Number(dia) : undefined,
        expiraEmDias: Number(expira) || undefined,
      });
      setResultado({ url: r.url });
      setClienteLabel(''); setValor(''); setDia('');
      onCriado();
    } catch (err: any) {
      setErro(err?.message || 'Erro ao gerar link.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
        <Plus className="h-5 w-5 text-brand-700" /> Gerar link para cliente
      </h2>
      <form onSubmit={gerar} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Modelo de contrato</Label>
          <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>Identificação do cliente <span className="text-slate-400">(opcional, só pra você)</span></Label>
          <Input value={clienteLabel} onChange={(e) => setClienteLabel(e.target.value)} placeholder="Ex.: Clínica Sorriso — Dr. João" />
        </div>
        {precisaValor && (
          <div>
            <Label>Valor mensal (R$)</Label>
            <Input inputMode="numeric" value={valor} onChange={(e) => setValor(maskCurrency(e.target.value))} placeholder="0,00" />
          </div>
        )}
        {precisaDia && (
          <div>
            <Label>Dia do vencimento</Label>
            <Input inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Ex.: 10" />
          </div>
        )}
        <div>
          <Label>Expira em (dias)</Label>
          <Input inputMode="numeric" value={expira} onChange={(e) => setExpira(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        </div>
        <div className="flex items-end sm:col-span-2">
          <Button type="submit" disabled={loading}>
            {loading ? <Spinner /> : <><Link2 className="h-4 w-4" /> Gerar link</>}
          </Button>
        </div>
      </form>

      {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}

      {resultado && (
        <div className="mt-5 rounded-lg border border-brand-200 bg-brand-50 p-4">
          <p className="mb-2 text-sm font-medium text-brand-800">Link gerado! Envie para o cliente:</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 break-all rounded-md bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-brand-200">
              {resultado.url}
            </code>
            <div className="flex gap-2">
              <CopyButton text={resultado.url} />
              <a
                href={`https://wa.me/?text=${encodeURIComponent('Olá! Segue o link para preencher seus dados do contrato: ' + resultado.url)}`}
                target="_blank" rel="noreferrer"
              >
                <Button type="button" variant="outline" size="sm">
                  <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp
                </Button>
              </a>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function formatBRL(centavos: number | null) {
  if (centavos == null) return '—';
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function LinhaContrato({ c, onRefresh }: { c: Contrato; onRefresh: () => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const formUrl = `${window.location.origin}/c/${c.token}`;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-slate-900">{c.cliente_label || c.template_nome}</p>
            {c.sandbox ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">TESTE</span> : null}
          </div>
          <p className="text-xs text-slate-500">
            {c.template_nome}
            {c.tipo_pessoa ? ` · ${c.tipo_pessoa.toUpperCase()}` : ''} · {formatBRL(c.valor_centavos)}
            {c.dia_vencimento ? ` · venc. dia ${c.dia_vencimento}` : ''}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Criado em {new Date(c.created_at).toLocaleString('pt-BR')}
          </p>
        </div>
        <StatusBadge status={c.status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {c.status === 'pendente' && <CopyButton text={formUrl} label="Copiar link do formulário" />}
        {c.short_link && (
          <a href={c.short_link} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm"><ExternalLink className="h-4 w-4" /> Link de assinatura</Button>
          </a>
        )}
        {c.autentique_document_id && (
          <a href={api.pdfUrl(c.id)} target="_blank" rel="noreferrer">
            <Button variant="ghost" size="sm"><FileText className="h-4 w-4" /> PDF</Button>
          </a>
        )}
        {(c.status === 'aguardando_assinatura') && (
          <Button
            variant="ghost" size="sm" disabled={refreshing}
            onClick={async () => { setRefreshing(true); try { await api.refreshContrato(c.id); onRefresh(); } finally { setRefreshing(false); } }}
          >
            {refreshing ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />} Atualizar status
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const nav = useNavigate();
  const [templates, setTemplates] = useState<TemplateResumo[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregarContratos = useCallback(() => {
    api.getContratos().then((r) => setContratos(r.contracts)).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await api.adminMe();
      } catch {
        nav('/admin/login', { replace: true });
        return;
      }
      try {
        const [t, c] = await Promise.all([api.getTemplates(), api.getContratos()]);
        setTemplates(t.templates);
        setContratos(c.contracts);
      } finally {
        setCarregando(false);
      }
    })();
  }, [nav]);

  async function sair() {
    await api.adminLogout().catch(() => {});
    nav('/admin/login', { replace: true });
  }

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-brand-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-bold text-slate-900">Contratos</h1>
          <Button variant="ghost" size="sm" onClick={sair}><LogOut className="h-4 w-4" /> Sair</Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <GerarLink templates={templates} onCriado={carregarContratos} />

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Contratos ({contratos.length})</h2>
            <Button variant="ghost" size="sm" onClick={carregarContratos}><RefreshCw className="h-4 w-4" /> Recarregar</Button>
          </div>
          {contratos.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">
              Nenhum contrato ainda. Gere um link acima para começar.
            </Card>
          ) : (
            <div className="space-y-3">
              {contratos.map((c) => <LinhaContrato key={c.id} c={c} onRefresh={carregarContratos} />)}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
