import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider',
  {
    variants: {
      variant: {
        default: 'border-gridBorder bg-subtle text-ink',
        draft: 'border-amber-300 bg-amber-50 text-amber-800',
        finalized: 'border-emerald-300 bg-emerald-50 text-emerald-800',
        dummy: 'border-orange-300 bg-orange-50 text-orange-800',
        danger: 'border-red-300 bg-red-50 text-red-800',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
