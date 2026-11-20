'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  Lock,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  createProject,
  deleteDraftProject,
  type ProjectListItem,
} from '@/app/actions/project';
import { FeasibilityDialog } from '@/components/workspace/FeasibilityDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRupiah } from '@/lib/rab/format';
import type { WorkspaceRegion } from '@/lib/rab/workspace-calc';

export function ProjectsListClient({
  projects,
  regions,
}: {
  projects: ProjectListItem[];
  regions: WorkspaceRegion[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feasibilityOpen, setFeasibilityOpen] = useState(false);

  const activeRegions = regions.filter((r) => r.isActive);
  const [name, setName] = useState('');
  const [regionId, setRegionId] = useState(activeRegions[0]?.id ?? '');
  const [priceDate, setPriceDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [ohpMargin, setOhpMargin] = useState('10.00');
  const [ppnRate, setPpnRate] = useState('11.00');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    startTransition(async () => {
      const res = await createProject({
        name,
        regionId,
        priceDate,
        overheadProfitMargin: ohpMargin,
        taxRatePpn: ppnRate,
      });
      if (!res.ok) {
        setErrorMsg(res.error);
        return;
      }
      setName('');
      router.push(`/projects/${res.data.id}`);
    });
  };

  const handleDelete = (id: string, projectName: string) => {
    if (!confirm(`Hapus proyek DRAFT "${projectName}"? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    setErrorMsg(null);
    startTransition(async () => {
      const res = await deleteDraftProject(id);
      if (!res.ok) {
        setErrorMsg(res.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-gridBorder pb-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-slateInk">
            Project Directory
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink">
            Daftar Proyek RAB
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-xs text-slateInk">
            {projects.length} proyek tercatat
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFeasibilityOpen(true)}
            disabled={activeRegions.length === 0}
          >
            <Calculator className="h-4 w-4 text-amber-700" />
            Kalkulator Feasibility &amp; Auto-RAB
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMsg}
        </div>
      )}

      {/* Create new project form */}
      <form
        onSubmit={handleCreate}
        className="space-y-3 border border-gridBorder bg-white p-4"
      >
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-slateInk">
          Buat Proyek Baru (DRAFT)
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slateInk">
              Nama Proyek
            </label>
            <Input
              placeholder="Mis. Rumah Tinggal Tipe 120"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slateInk">
              Wilayah Harga
            </label>
            <select
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
              required
              className="h-9 w-full border border-gridBorder bg-white px-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-ink"
            >
              {activeRegions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slateInk">
              Tanggal Harga
            </label>
            <Input
              type="date"
              value={priceDate}
              onChange={(e) => setPriceDate(e.target.value)}
              required
              className="font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slateInk">
                OHP (%)
              </label>
              <Input
                value={ohpMargin}
                onChange={(e) => setOhpMargin(e.target.value)}
                required
                className="font-mono text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slateInk">
                PPN (%)
              </label>
              <Input
                value={ppnRate}
                onChange={(e) => setPpnRate(e.target.value)}
                required
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={isPending || activeRegions.length === 0}
              className="w-full"
            >
              <Plus className="h-4 w-4" />
              Buat Proyek
            </Button>
          </div>
        </div>
      </form>

      {/* Projects table */}
      <div className="overflow-x-auto border border-gridBorder bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b border-gridBorder bg-subtle font-mono text-xs uppercase text-slateInk">
            <tr>
              <th className="px-4 py-3">Proyek</th>
              <th className="px-4 py-3">Wilayah</th>
              <th className="px-4 py-3">Price Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Item</th>
              <th className="px-4 py-3 text-right">Grand Total</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gridBorder">
            {projects.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slateInk">
                  Belum ada proyek. Buat proyek baru di formulir di atas.
                </td>
              </tr>
            ) : (
              projects.map((p) => (
                <tr key={p.id} className="hover:bg-subtle/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${p.id}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {p.name}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {p.isDummy && <Badge variant="dummy">DUMMY</Badge>}
                      {p.sourceProjectId && (
                        <span className="font-mono text-[11px] text-slateInk">
                          salinan
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slateInk">{p.regionName}</td>
                  <td className="px-4 py-3 font-mono text-xs tabular-nums">
                    {p.priceDate}
                  </td>
                  <td className="px-4 py-3">
                    {p.status === 'FINALIZED' ? (
                      <Badge variant="finalized" className="gap-1">
                        <Lock className="h-3 w-3" />
                        FINALIZED
                      </Badge>
                    ) : (
                      <Badge variant="draft">DRAFT</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                    {p.takeoffCount}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                    {p.hasMissingPrice ? (
                      <span className="inline-flex items-center gap-1 text-xs font-normal text-red-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Harga belum lengkap
                      </span>
                    ) : p.grandTotal !== null ? (
                      formatRupiah(p.grandTotal, 2)
                    ) : (
                      'Rp 0,00'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Link
                        href={`/projects/${p.id}`}
                        className="inline-flex h-8 items-center gap-1 border border-ink bg-ink px-3 text-xs font-medium text-white hover:bg-slate-800"
                      >
                        Buka
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      {p.status === 'DRAFT' && (
                        <Button
                          size="icon"
                          variant="outline"
                          title="Hapus proyek DRAFT"
                          disabled={isPending}
                          onClick={() => handleDelete(p.id, p.name)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-700" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <FeasibilityDialog
        open={feasibilityOpen}
        onOpenChange={setFeasibilityOpen}
        regions={regions}
      />
    </div>
  );
}
