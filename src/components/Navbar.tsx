'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, Database, FolderKanban } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function Navbar({ hasDummy = false }: { hasDummy?: boolean }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-gridBorder bg-white">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/projects" className="flex items-center gap-2.5 text-ink">
            <Compass className="h-5 w-5 text-ink" strokeWidth={1.75} />
            <span className="font-display text-base font-bold tracking-tight">
              OpenRAB
            </span>
            <span className="hidden font-mono text-[11px] text-slateInk sm:inline">
              QS WORKBENCH
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            <Link
              href="/projects"
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors',
                pathname?.startsWith('/projects')
                  ? 'bg-subtle text-ink'
                  : 'text-slateInk hover:bg-subtle hover:text-ink'
              )}
            >
              <FolderKanban className="h-4 w-4" />
              Proyek RAB
            </Link>
            <Link
              href="/master"
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors',
                pathname?.startsWith('/master')
                  ? 'bg-subtle text-ink'
                  : 'text-slateInk hover:bg-subtle hover:text-ink'
              )}
            >
              <Database className="h-4 w-4" />
              Master Data
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {hasDummy && (
            <Badge
              variant="dummy"
              title="Masih terdapat data seed DUMMY — ganti dengan data tervalidasi QS sebelum produksi."
            >
              DUMMY
            </Badge>
          )}
        </div>
      </div>
    </header>
  );
}
