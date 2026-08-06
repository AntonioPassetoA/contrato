import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-12 w-full rounded-lg border bg-white px-3.5 text-base text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600/40 focus:border-brand-600 disabled:cursor-not-allowed disabled:bg-slate-100',
        invalid ? 'border-red-400 focus:ring-red-500/30 focus:border-red-500' : 'border-slate-300',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-12 w-full rounded-lg border bg-white px-3 text-base text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-600/40 focus:border-brand-600',
      invalid ? 'border-red-400' : 'border-slate-300',
      className
    )}
    {...props}
  />
));
Select.displayName = 'Select';
