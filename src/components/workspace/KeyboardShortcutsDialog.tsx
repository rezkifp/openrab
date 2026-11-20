'use client';

import { Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface ShortcutItem {
  keys: string[];
  label: string;
  description: string;
}

const SHORTCUT_GROUPS: { title: string; items: ShortcutItem[] }[] = [
  {
    title: 'Navigasi Workspace',
    items: [
      { keys: ['Alt', '1'], label: 'Tab Takeoff & RAB', description: 'Buka grid perhitungan volume & harga' },
      { keys: ['Alt', '2'], label: 'Tab Bill of Materials', description: 'Lihat rekap kebutuhan material & upah' },
      { keys: ['Alt', '3'], label: 'Tab Rekapitulasi & Kurva S', description: 'Atur bobot divisi & jadwal mingguan' },
      { keys: ['Alt', '4'], label: 'Tab Value Engineering', description: 'Bandingkan baseline vs addendum (VO)' },
    ],
  },
  {
    title: 'Export & Dokumen',
    items: [
      { keys: ['Ctrl', 'E'], label: 'Export Excel (.xlsx)', description: 'Unduh spreadsheet sesuai mode aktif' },
      { keys: ['Ctrl', 'P'], label: 'Export PDF (.pdf)', description: 'Cetak laporan resmi sesuai mode aktif' },
    ],
  },
  {
    title: 'Umum',
    items: [
      { keys: ['?'], label: 'Pintasan Keyboard', description: 'Buka atau tutup jendela panduan ini' },
      { keys: ['Esc'], label: 'Tutup Dialog', description: 'Tutup modal atau batalkan fokus' },
    ],
  },
];

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
  enabled,
  onToggleEnabled,
}: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          title="Pintasan Keyboard (?)"
          className="gap-1.5 border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
        >
          <Keyboard className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Pintasan</span>
          <kbd className="ml-0.5 hidden rounded border border-stone-300 bg-stone-100 px-1 py-0.5 font-mono text-[10px] text-stone-600 sm:inline">
            ?
          </kbd>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg border-stone-300 bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-lg text-stone-900">
            <Keyboard className="h-5 w-5 text-stone-700" />
            Pengaturan Pintasan Keyboard
          </DialogTitle>
          <DialogDescription className="text-xs text-stone-500">
            Gunakan pintasan berikut untuk mempercepat navigasi dan export dokumen saat menyusun RAB.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-3.5 py-2.5">
          <div>
            <p className="text-xs font-semibold text-stone-800">Aktifkan Pintasan Keyboard</p>
            <p className="text-[11px] text-stone-500">
              Otomatis nonaktif saat Anda sedang mengetik di dalam kolom input.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => onToggleEnabled(!enabled)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
              enabled ? 'bg-stone-900' : 'bg-stone-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                enabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1.5">
              <h4 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                {group.title}
              </h4>
              <div className="divide-y divide-stone-100 rounded-md border border-stone-200">
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <div>
                      <p className="font-medium text-stone-800">{item.label}</p>
                      <p className="text-[11px] text-stone-500">{item.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className="rounded border border-stone-300 bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-stone-700 shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
