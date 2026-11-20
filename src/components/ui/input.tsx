import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full border border-gridBorder bg-white px-3 py-1 text-sm text-ink placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink disabled:cursor-not-allowed disabled:bg-subtle disabled:text-slateInk',
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = 'Input';
