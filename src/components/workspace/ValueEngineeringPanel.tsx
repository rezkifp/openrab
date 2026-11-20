'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  FileText,
  GitCompare,
  RefreshCw,
  Scale,
} from 'lucide-react';
import {
  getProjectComparisonData,
  type PeerProjectSummary,
} from '@/app/actions/project';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ProjectComparisonResult, VariationStatus } from '@/lib/rab/calc';
import { formatIdDecimal, formatRupiah } from '@/lib/rab/format';
import type { WorkspaceProject } from '@/lib/rab/workspace-calc';

type ComparisonFilter = 'ALL' | 'CHANGES' | 'ADDED' | 'REMOVED' | 'MODIFIED';

const STATUS_BADGE: Record<
  VariationStatus,
  { label: string; className: string }
> = {
  ADDED: {
    label: 'TAMBAH',
    className: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  },
  REMOVED: {
    label: 'KURANG / HAPUS',
    className: 'border-red-300 bg-red-50 text-red-800',
  },
  MODIFIED_VOLUME: {
    label: 'UBAH VOL',
    className: 'border-amber-300 bg-amber-50 text-amber-800',
  },
  MODIFIED_SPEC: {
    label: 'UBAH SPEK',
    className: 'border-amber-300 bg-amber-50 text-amber-800',
  },
  MODIFIED_BOTH: {
    label: 'UBAH VOL + SPEK',
    className: 'border-amber-400 bg-amber-100 text-amber-900',
  },
  UNCHANGED: {
    label: 'TETAP',
    className: 'border-gridBorder bg-subtle text-slateInk',
  },
};

export function ValueEngineeringPanel({
  project,
  peerProjects,
  isPending,
  onCreateBranch,
}: {
  project: WorkspaceProject;
  peerProjects: PeerProjectSummary[];
  isPending: boolean;
  onCreateBranch: (suffix: string) => void;
}) {
  const defaultBaseId = useMemo(() => {
    if (
      project.sourceProjectId &&
      peerProjects.some((p) => p.id === project.sourceProjectId)
    ) {
      return project.sourceProjectId;
    }
    return peerProjects[0]?.id ?? '';
  }, [project.sourceProjectId, peerProjects]);

  const [selectedBaseId, setSelectedBaseId] = useState(defaultBaseId);
  const [filter, setFilter] = useState<ComparisonFilter>('ALL');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [comparison, setComparison] = useState<
    | (ProjectComparisonResult & {
        baseProject: WorkspaceProject;
        revisedProject: WorkspaceProject;
      })
    | null
  >(null);

  useEffect(() => {
    if (!selectedBaseId && defaultBaseId) {
      setSelectedBaseId(defaultBaseId);
    }
  }, [defaultBaseId, selectedBaseId]);

  const runComparison = useCallback(
    async (baseId: string) => {
      if (!baseId) {
        setComparison(null);
        return;
      }
      setLoading(true);
      setErrorMsg(null);
      const res = await getProjectComparisonData(baseId, project.id);
      if (!res.ok) {
        setErrorMsg(res.error);
        setComparison(null);
      } else {
        setComparison(res.data);
      }
      setLoading(false);
    },
    [project.id]
  );

  useEffect(() => {
    if (selectedBaseId) {
      void runComparison(selectedBaseId);
    }
  }, [selectedBaseId, runComparison]);

  const filteredItems = useMemo(() => {
    if (!comparison) return [];
    if (filter === 'ALL') return comparison.items;
    if (filter === 'CHANGES')
      return comparison.items.filter((i) => i.status !== 'UNCHANGED');
    if (filter === 'ADDED')
      return comparison.items.filter((i) => i.status === 'ADDED');
    if (filter === 'REMOVED')
      return comparison.items.filter((i) => i.status === 'REMOVED');
    return comparison.items.filter((i) => i.status.startsWith('MODIFIED'));
  }, [comparison, filter]);

  const netGrandNum = comparison ? Number(comparison.netDeltaGrandTotal) : 0;

  return (
    <div className="space-y-6">
      {/* Control Header */}
      <div className="border border-gridBorder bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gridBorder pb-4">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <Scale className="h-5 w-5 text-amber-700" />
              Value Engineering &amp; Addendum (Pekerjaan Tambah / Kurang)
            </h2>
            <p className="text-xs text-slateInk">
              Bandingkan proyek ini (sebagai Opsi B / Addendum) terhadap proyek
              Kontrak Awal / Opsi A untuk audit penghematan biaya atau terbitan
              Berita Acara Pekerjaan Tambah Kurang (BAPTK).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => onCreateBranch('(Opsi VE)')}
            >
              <GitCompare className="h-3.5 w-3.5" />
              Buat Opsi Value Engineering
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => onCreateBranch('(Addendum VO)')}
            >
              <GitCompare className="h-3.5 w-3.5 text-amber-700" />
              Buat Addendum (VO)
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[280px] flex-1 max-w-xl">
            <label className="mb-1 block text-xs font-medium text-slateInk">
              Bandingkan Dengan Proyek Baseline (Kontrak Awal / Opsi A)
            </label>
            <div className="flex gap-2">
              <select
                value={selectedBaseId}
                onChange={(e) => setSelectedBaseId(e.target.value)}
                disabled={peerProjects.length === 0 || loading}
                className="h-9 flex-1 border border-gridBorder bg-white px-2.5 text-sm text-ink"
              >
                {peerProjects.length === 0 ? (
                  <option value="">
                    Belum ada proyek lain — buat Opsi VE atau Addendum terlebih
                    dahulu
                  </option>
                ) : (
                  peerProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} [{p.status}]
                      {p.grandTotal
                        ? ` — ${formatRupiah(p.grandTotal, 2)}`
                        : ''}
                    </option>
                  ))
                )}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                disabled={!selectedBaseId || loading}
                onClick={() => void runComparison(selectedBaseId)}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                />
                Hitung Ulang
              </Button>
            </div>
          </div>

          {comparison && selectedBaseId && (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`/api/projects/${project.id}/export/excel?mode=baptk&baseId=${selectedBaseId}`}
                className="inline-flex h-9 items-center gap-1.5 border border-gridBorder bg-white px-3 text-xs font-medium text-ink hover:bg-subtle"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
                Export Excel BAPTK
              </a>
              <a
                href={`/api/projects/${project.id}/export/pdf?mode=baptk&baseId=${selectedBaseId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 border border-gridBorder bg-white px-3 text-xs font-medium text-ink hover:bg-subtle"
              >
                <FileText className="h-3.5 w-3.5 text-red-700" />
                Export PDF BAPTK
              </a>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
            {errorMsg}
          </div>
        )}
      </div>

      {/* 5-Card Executive Comparison Summary */}
      {comparison && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="border border-gridBorder bg-white p-4">
              <p className="font-mono text-[11px] uppercase text-slateInk">
                Kontrak Awal (Opsi A)
              </p>
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-ink">
                {formatRupiah(comparison.baseGrandTotal, 2)}
              </p>
              <p className="mt-1 truncate text-[11px] text-slateInk">
                {comparison.baseProject.name}
              </p>
            </div>

            <div className="border border-gridBorder bg-white p-4">
              <p className="font-mono text-[11px] uppercase text-emerald-800">
                Pekerjaan Tambah (+)
              </p>
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-emerald-700">
                +{formatRupiah(comparison.totalAddition, 2)}
              </p>
              <p className="mt-1 text-[11px] text-slateInk">Base Cost Tambah</p>
            </div>

            <div className="border border-gridBorder bg-white p-4">
              <p className="font-mono text-[11px] uppercase text-red-800">
                Pekerjaan Kurang (-)
              </p>
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-red-700">
                -{formatRupiah(comparison.totalDeduction, 2)}
              </p>
              <p className="mt-1 text-[11px] text-slateInk">Base Cost Kurang</p>
            </div>

            <div className="border border-gridBorder bg-white p-4">
              <p className="font-mono text-[11px] uppercase text-slateInk">
                Selisih Netto (Grand Total)
              </p>
              <p
                className={`mt-1 font-mono text-sm font-bold tabular-nums ${
                  netGrandNum > 0
                    ? 'text-emerald-700'
                    : netGrandNum < 0
                    ? 'text-red-700'
                    : 'text-ink'
                }`}
              >
                {netGrandNum > 0 ? '+' : ''}
                {formatRupiah(comparison.netDeltaGrandTotal, 2)}
              </p>
              <p className="mt-1 font-mono text-[11px] text-slateInk">
                Variansi: {Number(comparison.deltaPercent) > 0 ? '+' : ''}
                {formatIdDecimal(comparison.deltaPercent, 2)}%
              </p>
            </div>

            <div className="border border-ink bg-white p-4">
              <p className="font-mono text-[11px] font-semibold uppercase text-ink">
                Nilai Akhir / Opsi B
              </p>
              <p className="mt-1 font-mono text-base font-bold tabular-nums text-ink">
                {formatRupiah(comparison.revisedGrandTotal, 2)}
              </p>
              <p className="mt-1 truncate text-[11px] text-slateInk">
                {comparison.revisedProject.name}
              </p>
            </div>
          </div>

          {/* Item-by-Item Comparison Table */}
          <div className="border border-gridBorder bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gridBorder bg-subtle px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ['ALL', 'Semua'],
                    ['CHANGES', 'Hanya Perubahan'],
                    ['ADDED', 'Tambah (+)'],
                    ['REMOVED', 'Kurang (-)'],
                    ['MODIFIED', 'Ubah Spek / Vol'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`border px-2.5 py-1 font-mono text-[11px] ${
                      filter === key
                        ? 'border-ink bg-ink text-white'
                        : 'border-gridBorder bg-white text-ink hover:bg-paper'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="font-mono text-xs text-slateInk">
                {filteredItems.length} item ditampilkan
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="border-b border-gridBorder bg-subtle/60 font-mono text-[11px] uppercase text-slateInk">
                  <tr>
                    <th className="px-2.5 py-2">No</th>
                    <th className="min-w-[220px] px-2.5 py-2">
                      Divisi WBS &amp; Uraian Pekerjaan
                    </th>
                    <th className="px-2.5 py-2">Status</th>
                    <th className="px-2.5 py-2">AHSP (Awal → Baru)</th>
                    <th className="px-2.5 py-2 text-right">Vol Awal</th>
                    <th className="px-2.5 py-2 text-right">Vol Baru</th>
                    <th className="px-2.5 py-2 text-right">Selisih Vol</th>
                    <th className="px-2.5 py-2 text-right">Total Awal</th>
                    <th className="px-2.5 py-2 text-right">Total Baru</th>
                    <th className="px-2.5 py-2 text-right">Selisih (Rp)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gridBorder">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-4 py-8 text-center text-sm text-slateInk"
                      >
                        Tidak ada item pada filter ini.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, idx) => {
                      const badge = STATUS_BADGE[item.status];
                      const deltaCost = Number(item.deltaTotal);
                      return (
                        <tr key={item.key} className="hover:bg-subtle/30">
                          <td className="px-2.5 py-2 font-mono text-slateInk">
                            {idx + 1}
                          </td>
                          <td className="px-2.5 py-2">
                            <p className="font-medium text-ink">
                              {item.description}
                            </p>
                            <p className="font-mono text-[10px] text-slateInk">
                              {item.wbsPath} ({item.unit})
                            </p>
                          </td>
                          <td className="px-2.5 py-2">
                            <Badge className={badge.className}>
                              {badge.label}
                            </Badge>
                          </td>
                          <td className="px-2.5 py-2 font-mono text-[11px] text-slateInk">
                            {item.baseAhspCode ?? '-'} &rarr;{' '}
                            {item.revisedAhspCode ?? '-'}
                          </td>
                          <td className="px-2.5 py-2 text-right font-mono tabular-nums">
                            {formatIdDecimal(item.baseVolume, 4)}
                          </td>
                          <td className="px-2.5 py-2 text-right font-mono tabular-nums">
                            {formatIdDecimal(item.revisedVolume, 4)}
                          </td>
                          <td className="px-2.5 py-2 text-right font-mono tabular-nums">
                            {Number(item.deltaVolume) > 0 ? '+' : ''}
                            {formatIdDecimal(item.deltaVolume, 4)}
                          </td>
                          <td className="px-2.5 py-2 text-right font-mono tabular-nums">
                            {formatRupiah(item.baseTotal, 2)}
                          </td>
                          <td className="px-2.5 py-2 text-right font-mono tabular-nums">
                            {formatRupiah(item.revisedTotal, 2)}
                          </td>
                          <td
                            className={`px-2.5 py-2 text-right font-mono font-semibold tabular-nums ${
                              deltaCost > 0
                                ? 'text-emerald-700'
                                : deltaCost < 0
                                ? 'text-red-700'
                                : 'text-slateInk'
                            }`}
                          >
                            {deltaCost > 0 ? '+' : ''}
                            {formatRupiah(item.deltaTotal, 2)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
