'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Calculator, Sparkles } from 'lucide-react';
import { createProjectFromFeasibility } from '@/app/actions/project';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  FEASIBILITY_BASE_RATES,
  RabValidationError,
  calcFeasibilityEstimate,
  type FinishingGrade,
} from '@/lib/rab/calc';
import { formatIdDecimal, formatRupiah } from '@/lib/rab/format';
import type { WorkspaceRegion } from '@/lib/rab/workspace-calc';

const GRADE_OPTIONS: Array<{
  value: FinishingGrade;
  label: string;
  desc: string;
}> = [
  {
    value: 'STANDARD',
    label: 'Standar',
    desc: 'Spesifikasi ekonomis & fungsional',
  },
  {
    value: 'MEDIUM',
    label: 'Menengah',
    desc: 'Granit 60x60, gypsum, baja ringan',
  },
  {
    value: 'LUXURY',
    label: 'Mewah / Premium',
    desc: 'Finishing custom & material kelas atas',
  },
];

export function FeasibilityDialog({
  open,
  onOpenChange,
  regions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regions: WorkspaceRegion[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeRegions = regions.filter((r) => r.isActive);
  const [name, setName] = useState('Rumah Tinggal Konsep 2 Lantai');
  const [regionId, setRegionId] = useState(activeRegions[0]?.id ?? '');
  const [priceDate, setPriceDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [clientName, setClientName] = useState('');
  const [projectLocation, setProjectLocation] = useState('');
  const [architectName, setArchitectName] = useState('');

  const [buildingAreaM2, setBuildingAreaM2] = useState('150');
  const [floors, setFloors] = useState(2);
  const [grade, setGrade] = useState<FinishingGrade>('MEDIUM');
  const [customRate, setCustomRate] = useState('');
  const [ohpMargin, setOhpMargin] = useState('10.00');
  const [ppnRate, setPpnRate] = useState('11.00');

  const preview = useMemo(() => {
    try {
      const data = calcFeasibilityEstimate({
        buildingAreaM2,
        floors,
        grade,
        customBaseRatePerM2: customRate.trim() === '' ? null : customRate,
        ohpPercent: ohpMargin,
        ppnPercent: ppnRate,
      });
      return { ok: true as const, data };
    } catch (err) {
      return {
        ok: false as const,
        error:
          err instanceof RabValidationError
            ? err.message
            : 'Parameter estimasi tidak valid.',
      };
    }
  }, [buildingAreaM2, floors, grade, customRate, ohpMargin, ppnRate]);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    startTransition(async () => {
      const res = await createProjectFromFeasibility({
        name,
        regionId: regionId || activeRegions[0]?.id || '',
        priceDate,
        overheadProfitMargin: ohpMargin,
        taxRatePpn: ppnRate,
        clientName,
        projectLocation,
        architectName,
        buildingAreaM2,
        floors,
        grade,
      });
      if (!res.ok) {
        setErrorMsg(res.error);
        return;
      }
      onOpenChange(false);
      router.push(`/projects/${res.data.id}`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-ink" />
            Kalkulator Feasibility Awal &amp; Generator RAB Otomatis
          </DialogTitle>
          <DialogDescription>
            Hitung estimasi anggaran konsep berdasarkan luas bangunan, jumlah
            lantai, dan kelas spesifikasi — lalu generate langsung menjadi
            struktur WBS &amp; template RAB detail 7 divisi.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleGenerate} className="mt-4 space-y-5">
          {errorMsg && (
            <div className="border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
              {errorMsg}
            </div>
          )}

          {/* Parameter Konsep & Finishing */}
          <div className="grid grid-cols-1 gap-3 border border-gridBorder bg-subtle/40 p-4 sm:grid-cols-12">
            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slateInk">
                Luas Bangunan (m&sup2;)
              </label>
              <Input
                value={buildingAreaM2}
                onChange={(e) => setBuildingAreaM2(e.target.value)}
                className="font-mono text-xs"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slateInk">
                Jumlah Lantai
              </label>
              <Input
                type="number"
                min={1}
                max={10}
                value={floors}
                onChange={(e) =>
                  setFloors(Math.max(1, Math.min(10, Number(e.target.value) || 1)))
                }
                className="font-mono text-xs"
                required
              />
            </div>
            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slateInk">
                Override Rate/m&sup2; (Opsional)
              </label>
              <Input
                placeholder="Default kelas"
                value={customRate}
                onChange={(e) => setCustomRate(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slateInk">
                OHP (%)
              </label>
              <Input
                value={ohpMargin}
                onChange={(e) => setOhpMargin(e.target.value)}
                className="font-mono text-xs"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slateInk">
                PPN (%)
              </label>
              <Input
                value={ppnRate}
                onChange={(e) => setPpnRate(e.target.value)}
                className="font-mono text-xs"
                required
              />
            </div>

            <div className="sm:col-span-12">
              <label className="mb-1.5 block text-xs font-medium text-slateInk">
                Kelas Spesifikasi Bangunan (Rule-of-Thumb Arsitek)
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {GRADE_OPTIONS.map((opt) => {
                  const selected = grade === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setGrade(opt.value)}
                      className={`border p-3 text-left transition-colors ${
                        selected
                          ? 'border-ink bg-white ring-1 ring-ink'
                          : 'border-gridBorder bg-white/70 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-display text-sm font-semibold text-ink">
                          {opt.label}
                        </span>
                        <span className="font-mono text-xs font-semibold tabular-nums text-amber-800">
                          {formatRupiah(FEASIBILITY_BASE_RATES[opt.value], 0)}/m&sup2;
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slateInk">
                        {opt.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Live Feasibility Output */}
          {!preview.ok ? (
            <div className="border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
              {preview.error}
            </div>
          ) : (
            <div className="space-y-3 border border-gridBorder bg-white p-4">
              <div className="grid grid-cols-2 gap-3 border-b border-gridBorder pb-3 sm:grid-cols-4">
                <div>
                  <p className="font-mono text-[10px] uppercase text-slateInk">
                    Rate Dasar (+Lantai)
                  </p>
                  <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums">
                    {formatRupiah(preview.data.unitRatePerM2, 2)}/m&sup2;
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase text-slateInk">
                    Subtotal Konstruksi
                  </p>
                  <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums">
                    {formatRupiah(preview.data.subtotal, 2)}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase text-slateInk">
                    Est. Biaya Akhir / m&sup2;
                  </p>
                  <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums">
                    {formatRupiah(preview.data.costPerM2Final, 2)}/m&sup2;
                  </p>
                </div>
                <div className="border-l-2 border-l-ink pl-3">
                  <p className="font-mono text-[10px] font-semibold uppercase text-ink">
                    Est. Grand Total
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-ink">
                    {formatRupiah(preview.data.grandTotal, 2)}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto border border-gridBorder">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="border-b border-gridBorder bg-subtle font-mono text-[11px] uppercase text-slateInk">
                    <tr>
                      <th className="px-2.5 py-1.5">Kode</th>
                      <th className="px-2.5 py-1.5">Divisi WBS Standar</th>
                      <th className="px-2.5 py-1.5 text-center">Jadwal</th>
                      <th className="px-2.5 py-1.5 text-right">Bobot</th>
                      <th className="px-2.5 py-1.5 text-right">
                        Estimasi Pagu Base
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gridBorder">
                    {preview.data.divisions.map((div) => (
                      <tr key={div.code}>
                        <td className="px-2.5 py-1.5 font-mono text-slateInk">
                          {div.code}
                        </td>
                        <td className="px-2.5 py-1.5 font-medium text-ink">
                          {div.name}
                        </td>
                        <td className="px-2.5 py-1.5 text-center font-mono text-[11px] text-slateInk">
                          M{div.startWeek} ({div.durationWeeks} mgg)
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">
                          {formatIdDecimal(div.weightPercent, 2)}%
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono font-medium tabular-nums">
                          {formatRupiah(div.estimatedBaseCost, 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Identitas Proyek untuk Auto-Generate */}
          <div className="grid grid-cols-1 gap-3 border border-gridBorder bg-white p-4 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <label className="mb-1 block text-xs font-medium text-slateInk">
                Nama Proyek RAB
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="sm:col-span-4">
              <label className="mb-1 block text-xs font-medium text-slateInk">
                Wilayah Harga Master
              </label>
              <select
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                className="h-9 w-full border border-gridBorder bg-white px-2 text-sm text-ink"
                required
              >
                {activeRegions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slateInk">
                Price Date
              </label>
              <Input
                type="date"
                value={priceDate}
                onChange={(e) => setPriceDate(e.target.value)}
                className="font-mono text-xs"
                required
              />
            </div>

            <div className="sm:col-span-4">
              <label className="mb-1 block text-xs font-medium text-slateInk">
                Klien / Owner (Opsional)
              </label>
              <Input
                placeholder="Nama pemilik proyek"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            </div>
            <div className="sm:col-span-4">
              <label className="mb-1 block text-xs font-medium text-slateInk">
                Lokasi Proyek (Opsional)
              </label>
              <Input
                placeholder="Kota / alamat proyek"
                value={projectLocation}
                onChange={(e) => setProjectLocation(e.target.value)}
              />
            </div>
            <div className="sm:col-span-4">
              <label className="mb-1 block text-xs font-medium text-slateInk">
                Arsitek / Studio (Opsional)
              </label>
              <Input
                placeholder="Nama biro / estimator"
                value={architectName}
                onChange={(e) => setArchitectName(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="flex items-center gap-1.5 text-[11px] text-slateInk">
              <Building2 className="h-3.5 w-3.5" />
              Auto-generate membuat proyek DRAFT + 7 Divisi WBS + 16 item
              takeoff awal siap edit berbasis Master AHSP.
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Tutup
              </Button>
              <Button
                type="submit"
                disabled={isPending || activeRegions.length === 0}
              >
                <Sparkles className="h-4 w-4" />
                Generate Proyek &amp; Template RAB Otomatis
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
