import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-sm font-medium text-slate-700', className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', className)} {...props} />
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin', className)} />;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pendente: { label: 'Pendente', cls: 'bg-amber-100 text-amber-800' },
    solicitado: { label: 'Solicitado', cls: 'bg-amber-100 text-amber-800' },
    configurado: { label: 'Configurado', cls: 'bg-sky-100 text-sky-800' },
    link_liberado: { label: 'Link liberado', cls: 'bg-cyan-100 text-cyan-800' },
    preenchido: { label: 'Preenchido — revisar', cls: 'bg-blue-100 text-blue-800' },
    aprovado: { label: 'Aprovado', cls: 'bg-violet-100 text-violet-800' },
    aguardando_assinatura: { label: 'Aguardando assinatura', cls: 'bg-indigo-100 text-indigo-800' },
    visualizado: { label: 'Visualizado', cls: 'bg-indigo-100 text-indigo-800' },
    parcialmente_assinado: { label: 'Parcialmente assinado', cls: 'bg-indigo-100 text-indigo-800' },
    assinado: { label: 'Assinado', cls: 'bg-emerald-100 text-emerald-800' },
    recusado: { label: 'Recusado', cls: 'bg-red-100 text-red-800' },
    expirado: { label: 'Expirado', cls: 'bg-slate-200 text-slate-600' },
    cancelado: { label: 'Cancelado', cls: 'bg-slate-200 text-slate-600' },
    erro: { label: 'Erro', cls: 'bg-red-100 text-red-800' },
  };
  const s = map[status] || { label: status, cls: 'bg-slate-100 text-slate-700' };
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', s.cls)}>
      {s.label}
    </span>
  );
}
