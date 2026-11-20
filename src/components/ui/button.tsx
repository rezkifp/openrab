import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'border border-ink bg-ink text-white hover:bg-slate-800',
        secondary:
          'border border-gridBorder bg-subtle text-ink hover:bg-stone-200',
        outline:
          'border border-gridBorder bg-white text-ink hover:bg-subtle',
        destructive:
          'border border-red-700 bg-red-700 text-white hover:bg-red-800',
        ghost: 'text-ink hover:bg-subtle',
        draft:
          'border border-amber-700 bg-amber-700 text-white hover:bg-amber-800',
        locked:
          'border border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        icon: 'h-8 w-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
);
Button.displayName = 'Button';
