import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api, type PreviewContrato, type PdfResumo } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, Spinner } from '@/components/ui/misc';
import {
  ArrowLeft, FileCheck, FileText, Pencil, Download, AlertTriangle, ShieldCheck, History,
} from 'lucide-react';

function kb(n: number) { return `${(n / 1024).toFixed(1)} KB`; }

export default function AdminContratoPreviewPage() {
  const nav = useNavigate();
  const { id } = useParams();
  const contratoId = Number(id);

  const [carregando, setCarregando] = useState(true);
  const [preview, setPreview] = useState<PreviewContrato | null>(null);
  const [pdfs, setPdfs] = useState<PdfResumo[]>([]);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const carregar = useCallback(async () => {
    const [p, l] = await Promise.all([api.getPreview(contratoId), api.getPdfs(contratoId).catch(() => ({ pdfs: [] }))]);
    setPreview(p.preview);
    setPdfs(l.pdfs);
  }, [contratoId]);

  useEffect(() => {
    (async () => {
      try {
        const { user } = await api.adminMe();
        if (user.must_change_password) { nav('/trocar-senha', { replace: true }); return; }
        if (user.role !== 'admin') { nav('/vendedor', { replace: true }); return; }
        await carregar();
      } catch {
        nav('/admin', { replace: true });
      } finally {
        setCarregando(false);
      }
    })();
  }, [nav, carregar]);

  async function gerar() {
    if (!preview?.pronto) return;
    if (!window.confirm(
      'Aprovar e gerar o PDF deste contrato?\n\n' +
      'Confira a prévia acima. Ao confirmar, o documento é gerado e arquivado. ' +
      'Se já existir um PDF, ele será marcado como substituído (o histórico é mantido).',
    )) return;
    setErro(''); setOk(''); setGerando(true);
    try {
      const r = await api.gerarPdf(contratoId, true);
      await carregar();
      setOk(`PDF gerado (versão ${r.pdf.versaoPdf}).`);
    } catch (err: any) {
      const pend = err?.data?.pendencias as string[] | undefined;
      setErro(pend?.length ? `Pendências: ${pend.join(' ')}` : (err?.message || 'Erro ao gerar o PDF.'));
      await carregar();
    } finally {
      setGerando(false);
    }
  }

  if (carregando) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-6 w-6 text-brand-700" /></div>;
  }
  if (!preview) return null;

  const substituidos = pdfs.filter((p) => p.status === 'substituido');

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-2">
            <Link to={`/admin/contratos/${contratoId}`}><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> Voltar</Button></Link>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Prévia e geração do PDF</h1>
              <p className="text-xs text-slate-500">
                Versão de conteúdo: {preview.versao || 'base (modelo)'}{preview.origem ? ` · ${preview.origem}` : ''}
              </p>
            </div>
          </div>
          {preview.personalizado && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Contrato personalizado</span>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[1fr_320px]">
        {/* Prévia integral — exatamente como fica no PDF */}
        <div className="space-y-4">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500">
              <FileCheck className="h-4 w-4" /> Prévia integral (idêntica ao PDF)
            </div>
            <iframe
              title="Prévia do contrato"
              srcDoc={preview.html}
              sandbox=""
              className="h-[72vh] w-full bg-white"
            />
          </Card>
        </div>

        {/* Ações + status */}
        <div className="space-y-4">
          {preview.pronto ? (
            <Card className="border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                <ShieldCheck className="h-4 w-4" /> Pronto para gerar o PDF
              </p>
              <p className="mt-1 text-xs text-emerald-700">Revise a prévia e aprove para gerar o documento.</p>
            </Card>
          ) : (
            <Card className="border-amber-200 bg-amber-50 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
                <AlertTriangle className="h-4 w-4" /> Pendências antes de gerar
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">
                {preview.pendencias.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </Card>
          )}

          <Card className="space-y-2 p-4">
            <Button onClick={gerar} disabled={!preview.pronto || gerando} className="w-full">
              {gerando ? <Spinner /> : <><FileCheck className="h-4 w-4" /> Aprovar e gerar PDF</>}
            </Button>
            <div className="flex gap-2">
              <Link to={`/admin/contratos/${contratoId}`} className="flex-1">
                <Button variant="outline" className="w-full"><Pencil className="h-4 w-4" /> Editar dados</Button>
              </Link>
              <Link to={`/admin/contratos/${contratoId}/editar`} className="flex-1">
                <Button variant="outline" className="w-full"><FileText className="h-4 w-4" /> Editar cláusulas</Button>
              </Link>
            </div>
            {erro && <p className="text-sm text-red-600">{erro}</p>}
            {ok && <p className="text-sm text-emerald-700">{ok}</p>}
          </Card>

          {preview.pdf && (
            <Card className="space-y-2 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <FileCheck className="h-4 w-4" /> PDF ativo — versão {preview.pdf.versaoPdf}
              </h2>
              <dl className="space-y-1 text-xs text-slate-600">
                <div className="flex justify-between"><dt>Tamanho</dt><dd>{kb(preview.pdf.tamanho)}</dd></div>
                <div className="flex justify-between"><dt>Gerado em</dt><dd>{new Date(preview.pdf.createdAt).toLocaleString('pt-BR')}</dd></div>
              </dl>
              <div className="rounded-md bg-slate-50 p-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Hash de integridade (conteúdo)</p>
                <p className="break-all font-mono text-[11px] text-slate-600">{preview.pdf.hashConteudo}</p>
              </div>
              <a href={api.pdfUrl(contratoId)} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full"><Download className="h-4 w-4" /> Abrir / baixar PDF</Button>
              </a>
            </Card>
          )}

          {substituidos.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900"><History className="h-4 w-4" /> Versões substituídas</h2>
              <div className="space-y-1.5">
                {substituidos.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-md border border-slate-200 p-2 text-xs">
                    <span className="text-slate-600">v{p.versaoPdf} · {kb(p.tamanho)}</span>
                    <a href={api.pdfUrl(contratoId, p.id)} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
                      abrir
                    </a>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
