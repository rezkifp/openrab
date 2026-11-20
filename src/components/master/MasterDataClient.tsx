'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  Download,
  Edit3,
  Plus,
  Power,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  addAhspComposition,
  createAhsp,
  createRegion,
  createResource,
  deleteAhsp,
  deleteAhspComposition,
  deleteRegion,
  deleteResource,
  deleteResourcePrice,
  importMasterExcelAction,
  saveResourcePrice,
  updateAhsp,
  updateAhspComposition,
  updateRegion,
  updateResource,
} from '@/app/actions/master';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { calcHsp, type ResourceType } from '@/lib/rab/calc';
import { formatRupiah, isDummyText } from '@/lib/rab/format';
import { pickEffectivePrice } from '@/lib/rab/pricing';

interface RegionItem {
  id: string;
  name: string;
  isActive: boolean;
}

interface ResourceItem {
  id: string;
  code: string;
  name: string;
  type: ResourceType;
  unit: string;
  isActive: boolean;
}

interface PriceItem {
  id: string;
  resourceId: string;
  regionId: string;
  basePrice: string;
  effectiveDate: string;
}

interface AhspItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  isActive: boolean;
}

interface CompositionItem {
  id: string;
  ahspId: string;
  resourceId: string;
  coefficient: string;
}

export interface MasterBundleProps {
  regions: RegionItem[];
  resources: ResourceItem[];
  prices: PriceItem[];
  ahsps: AhspItem[];
  compositions: CompositionItem[];
  hasDummy: boolean;
}

export function MasterDataClient({ initial }: { initial: MasterBundleProps }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // Resource form state
  const [resCode, setResCode] = useState('');
  const [resName, setResName] = useState('');
  const [resType, setResType] = useState<ResourceType>('MATERIAL');
  const [resUnit, setResUnit] = useState('');
  const [editingResId, setEditingResId] = useState<string | null>(null);
  const [editResDraft, setEditResDraft] = useState<ResourceItem | null>(null);

  // Region form state
  const [regionName, setRegionName] = useState('');
  const [editingRegionId, setEditingRegionId] = useState<string | null>(null);
  const [editRegionName, setEditRegionName] = useState('');

  // Price form state
  const [priceResId, setPriceResId] = useState(
    initial.resources[0]?.id ?? ''
  );
  const [priceRegionId, setPriceRegionId] = useState(
    initial.regions[0]?.id ?? ''
  );
  const [priceValue, setPriceValue] = useState('');
  const [priceDate, setPriceDate] = useState('2026-06-01');

  // AHSP form state
  const [ahspCode, setAhspCode] = useState('');
  const [ahspName, setAhspName] = useState('');
  const [ahspUnit, setAhspUnit] = useState('m2');
  const [selectedAhspId, setSelectedAhspId] = useState<string>(
    initial.ahsps[0]?.id ?? ''
  );
  const [editingAhspId, setEditingAhspId] = useState<string | null>(null);
  const [editAhspDraft, setEditAhspDraft] = useState<AhspItem | null>(null);

  // Composition form state
  const [compResId, setCompResId] = useState(
    initial.resources.find((r) => r.isActive)?.id ??
      initial.resources[0]?.id ??
      ''
  );
  const [compCoef, setCompCoef] = useState('');
  const [previewRegionId, setPreviewRegionId] = useState(
    initial.regions[0]?.id ?? ''
  );
  const [previewDate, setPreviewDate] = useState('2026-06-15');

  const runAction = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    successMsg: string
  ) => {
    setBannerError(null);
    setBannerSuccess(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setBannerError(res.error ?? 'Terjadi kesalahan.');
      } else {
        setBannerSuccess(successMsg);
        router.refresh();
      }
    });
  };

  const regionMap = new Map(initial.regions.map((r) => [r.id, r]));
  const resourceMap = new Map(initial.resources.map((r) => [r.id, r]));

  const selectedAhsp = initial.ahsps.find((a) => a.id === selectedAhspId);
  const selectedComps = initial.compositions.filter(
    (c) => c.ahspId === selectedAhspId
  );

  let previewHspDisplay: { ok: true; value: string } | { ok: false; msg: string } =
    { ok: false, msg: 'Belum ada komposisi.' };

  if (selectedComps.length > 0 && previewRegionId) {
    try {
      const lines = selectedComps.map((c) => {
        const res = resourceMap.get(c.resourceId);
        const rows = initial.prices.filter((p) => p.resourceId === c.resourceId);
        try {
          const eff = pickEffectivePrice(rows, previewRegionId, previewDate);
          return { coefficient: c.coefficient, price: eff };
        } catch {
          throw new Error(
            `Harga ${res?.name ?? c.resourceId} belum tersedia untuk wilayah & tanggal ini.`
          );
        }
      });
      const hsp = calcHsp(lines);
      previewHspDisplay = { ok: true, value: formatRupiah(hsp, 3) };
    } catch (e) {
      previewHspDisplay = {
        ok: false,
        msg: e instanceof Error ? e.message : 'Gagal menghitung pratinjau HSP.',
      };
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gridBorder pb-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-slateInk">
            Master Library
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink">
            Master Data Resources, Harga Regional &amp; AHSP
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/master/export"
            className="inline-flex h-8 items-center gap-1.5 border border-gridBorder bg-white px-3 text-xs font-medium text-ink hover:bg-subtle"
          >
            <Download className="h-3.5 w-3.5" />
            Export Template (.xlsx)
          </a>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 border border-ink bg-ink px-3 text-xs font-medium text-white hover:bg-slate-800">
            <Upload className="h-3.5 w-3.5" />
            Import Excel (.xlsx)
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              disabled={isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const fd = new FormData();
                fd.append('file', file);
                setBannerError(null);
                setBannerSuccess(null);
                startTransition(async () => {
                  const res = await importMasterExcelAction(fd);
                  if (!res.ok) {
                    setBannerError(res.error);
                  } else {
                    setBannerSuccess(
                      `Import selesai: ${res.data.resourcesUpserted} resources, ${res.data.pricesUpserted} harga, ${res.data.compositionsUpserted} komposisi AHSP diperbarui.`
                    );
                    router.refresh();
                  }
                });
              }}
            />
          </label>
          {initial.hasDummy && (
            <div className="flex items-center gap-2 border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs text-orange-900">
              <AlertTriangle className="h-4 w-4 shrink-0 text-orange-700" />
              <span>
                Mode data contoh (<strong>DUMMY</strong>).
              </span>
            </div>
          )}
        </div>
      </div>

      {bannerError && (
        <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {bannerError}
        </div>
      )}
      {bannerSuccess && (
        <div className="border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {bannerSuccess}
        </div>
      )}

      <Tabs defaultValue="resources">
        <TabsList>
          <TabsTrigger value="resources">
            Resources ({initial.resources.length})
          </TabsTrigger>
          <TabsTrigger value="prices">
            Wilayah &amp; Harga ({initial.prices.length})
          </TabsTrigger>
          <TabsTrigger value="ahsp">
            Master AHSP ({initial.ahsps.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: RESOURCES */}
        <TabsContent value="resources" className="space-y-4">
          <form
            className="grid grid-cols-1 gap-3 border border-gridBorder bg-white p-4 sm:grid-cols-6"
            onSubmit={(e) => {
              e.preventDefault();
              runAction(
                () =>
                  createResource({
                    code: resCode,
                    name: resName,
                    type: resType,
                    unit: resUnit,
                  }),
                'Resource baru ditambahkan.'
              );
              setResCode('');
              setResName('');
              setResUnit('');
            }}
          >
            <Input
              placeholder="Kode (mis. MAT-BATA-01)"
              value={resCode}
              onChange={(e) => setResCode(e.target.value)}
              required
              className="font-mono"
            />
            <Input
              placeholder="Nama Material / Upah / Alat"
              value={resName}
              onChange={(e) => setResName(e.target.value)}
              required
              className="sm:col-span-2"
            />
            <select
              value={resType}
              onChange={(e) => setResType(e.target.value as ResourceType)}
              className="h-9 border border-gridBorder bg-white px-3 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-ink"
            >
              <option value="MATERIAL">MATERIAL</option>
              <option value="LABOR">LABOR</option>
              <option value="EQUIPMENT">EQUIPMENT</option>
            </select>
            <Input
              placeholder="Satuan (bh, kg, m3, OH)"
              value={resUnit}
              onChange={(e) => setResUnit(e.target.value)}
              required
            />
            <Button type="submit" disabled={isPending}>
              <Plus className="h-4 w-4" />
              Tambah Resource
            </Button>
          </form>

          <div className="overflow-x-auto border border-gridBorder bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-gridBorder bg-subtle font-mono text-xs uppercase text-slateInk">
                <tr>
                  <th className="px-3 py-2.5">Kode</th>
                  <th className="px-3 py-2.5">Nama Resource</th>
                  <th className="px-3 py-2.5">Tipe</th>
                  <th className="px-3 py-2.5">Satuan</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gridBorder">
                {initial.resources.map((res) => {
                  const isEditing = editingResId === res.id && editResDraft;
                  return (
                    <tr key={res.id} className={!res.isActive ? 'bg-subtle/60 opacity-70' : ''}>
                      <td className="px-3 py-2 font-mono text-xs">
                        {isEditing ? (
                          <Input
                            value={editResDraft.code}
                            onChange={(e) =>
                              setEditResDraft({
                                ...editResDraft,
                                code: e.target.value,
                              })
                            }
                            className="h-8 font-mono text-xs"
                          />
                        ) : (
                          res.code
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <Input
                            value={editResDraft.name}
                            onChange={(e) =>
                              setEditResDraft({
                                ...editResDraft,
                                name: e.target.value,
                              })
                            }
                            className="h-8"
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-ink">{res.name}</span>
                            {(isDummyText(res.name) || isDummyText(res.code)) && (
                              <Badge variant="dummy">DUMMY</Badge>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {isEditing ? (
                          <select
                            value={editResDraft.type}
                            onChange={(e) =>
                              setEditResDraft({
                                ...editResDraft,
                                type: e.target.value as ResourceType,
                              })
                            }
                            className="h-8 border border-gridBorder bg-white px-2 text-xs"
                          >
                            <option value="MATERIAL">MATERIAL</option>
                            <option value="LABOR">LABOR</option>
                            <option value="EQUIPMENT">EQUIPMENT</option>
                          </select>
                        ) : (
                          res.type
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {isEditing ? (
                          <Input
                            value={editResDraft.unit}
                            onChange={(e) =>
                              setEditResDraft({
                                ...editResDraft,
                                unit: e.target.value,
                              })
                            }
                            className="h-8 w-24 font-mono text-xs"
                          />
                        ) : (
                          res.unit
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={res.isActive ? 'finalized' : 'default'}>
                          {res.isActive ? 'AKTIF' : 'NONAKTIF'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          {isEditing ? (
                            <>
                              <Button
                                size="icon"
                                variant="default"
                                title="Simpan"
                                disabled={isPending}
                                onClick={() => {
                                  runAction(
                                    () => updateResource(editResDraft),
                                    'Resource diperbarui.'
                                  );
                                  setEditingResId(null);
                                  setEditResDraft(null);
                                }}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                title="Batal"
                                onClick={() => {
                                  setEditingResId(null);
                                  setEditResDraft(null);
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="icon"
                                variant="outline"
                                title="Edit"
                                onClick={() => {
                                  setEditingResId(res.id);
                                  setEditResDraft({ ...res });
                                }}
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                title={res.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                                disabled={isPending}
                                onClick={() =>
                                  runAction(
                                    () =>
                                      updateResource({
                                        ...res,
                                        isActive: !res.isActive,
                                      }),
                                    res.isActive
                                      ? 'Resource dinonaktifkan.'
                                      : 'Resource diaktifkan.'
                                  )
                                }
                              >
                                <Power className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                title="Hapus"
                                disabled={isPending}
                                onClick={() =>
                                  runAction(
                                    () => deleteResource(res.id),
                                    'Resource dihapus.'
                                  )
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5 text-red-700" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* TAB 2: REGIONS & REGIONAL PRICES */}
        <TabsContent value="prices" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Regions panel */}
            <div className="space-y-3 border border-gridBorder bg-white p-4">
              <h2 className="font-display text-base font-semibold text-ink">
                Daftar Wilayah
              </h2>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  runAction(
                    () => createRegion({ name: regionName }),
                    'Wilayah baru ditambahkan.'
                  );
                  setRegionName('');
                }}
              >
                <Input
                  placeholder="Nama wilayah baru"
                  value={regionName}
                  onChange={(e) => setRegionName(e.target.value)}
                  required
                />
                <Button type="submit" disabled={isPending}>
                  <Plus className="h-4 w-4" />
                  Tambah
                </Button>
              </form>
              <div className="divide-y divide-gridBorder border border-gridBorder">
                {initial.regions.map((reg) => {
                  const isEditing = editingRegionId === reg.id;
                  return (
                    <div
                      key={reg.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      {isEditing ? (
                        <Input
                          value={editRegionName}
                          onChange={(e) => setEditRegionName(e.target.value)}
                          className="h-8"
                        />
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={!reg.isActive ? 'line-through text-slateInk' : 'font-medium'}>
                            {reg.name}
                          </span>
                          {isDummyText(reg.name) && (
                            <Badge variant="dummy">DUMMY</Badge>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        {isEditing ? (
                          <>
                            <Button
                              size="icon"
                              variant="default"
                              onClick={() => {
                                runAction(
                                  () =>
                                    updateRegion({
                                      id: reg.id,
                                      name: editRegionName,
                                      isActive: reg.isActive,
                                    }),
                                  'Wilayah diperbarui.'
                                );
                                setEditingRegionId(null);
                              }}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => setEditingRegionId(null)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="outline"
                              title="Edit"
                              onClick={() => {
                                setEditingRegionId(reg.id);
                                setEditRegionName(reg.name);
                              }}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              title={reg.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                              onClick={() =>
                                runAction(
                                  () =>
                                    updateRegion({
                                      id: reg.id,
                                      name: reg.name,
                                      isActive: !reg.isActive,
                                    }),
                                  'Status wilayah diubah.'
                                )
                              }
                            >
                              <Power className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              title="Hapus"
                              onClick={() =>
                                runAction(
                                  () => deleteRegion(reg.id),
                                  'Wilayah dihapus.'
                                )
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-700" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Regional prices panel */}
            <div className="space-y-4 border border-gridBorder bg-white p-4 lg:col-span-2">
              <h2 className="font-display text-base font-semibold text-ink">
                Harga Satuan Dasar per Wilayah &amp; Tanggal Efektif
              </h2>
              <form
                className="grid grid-cols-1 gap-3 sm:grid-cols-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  runAction(
                    () =>
                      saveResourcePrice({
                        resourceId: priceResId,
                        regionId: priceRegionId,
                        basePrice: priceValue,
                        effectiveDate: priceDate,
                      }),
                    'Harga regional disimpan.'
                  );
                  setPriceValue('');
                }}
              >
                <select
                  value={priceResId}
                  onChange={(e) => setPriceResId(e.target.value)}
                  className="h-9 border border-gridBorder bg-white px-2 text-sm sm:col-span-2"
                  required
                >
                  {initial.resources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} — {r.name}
                    </option>
                  ))}
                </select>
                <select
                  value={priceRegionId}
                  onChange={(e) => setPriceRegionId(e.target.value)}
                  className="h-9 border border-gridBorder bg-white px-2 text-sm"
                  required
                >
                  {initial.regions.map((reg) => (
                    <option key={reg.id} value={reg.id}>
                      {reg.name}
                    </option>
                  ))}
                </select>
                <Input
                  type="date"
                  value={priceDate}
                  onChange={(e) => setPriceDate(e.target.value)}
                  required
                  className="font-mono text-xs"
                />
                <div className="flex gap-2">
                  <Input
                    placeholder="Harga (mis. 850.50)"
                    value={priceValue}
                    onChange={(e) => setPriceValue(e.target.value)}
                    required
                    className="font-mono"
                  />
                  <Button type="submit" disabled={isPending}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </form>

              <div className="overflow-x-auto border border-gridBorder">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="border-b border-gridBorder bg-subtle font-mono text-xs uppercase text-slateInk">
                    <tr>
                      <th className="px-3 py-2">Resource</th>
                      <th className="px-3 py-2">Wilayah</th>
                      <th className="px-3 py-2">Effective Date</th>
                      <th className="px-3 py-2 text-right">Harga Dasar</th>
                      <th className="px-3 py-2 text-right">Hapus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gridBorder">
                    {initial.prices.map((p) => {
                      const res = resourceMap.get(p.resourceId);
                      const reg = regionMap.get(p.regionId);
                      return (
                        <tr key={p.id}>
                          <td className="px-3 py-2">
                            <span className="font-mono text-xs text-slateInk">
                              {res?.code}
                            </span>{' '}
                            <span className="font-medium">{res?.name}</span>
                          </td>
                          <td className="px-3 py-2">{reg?.name}</td>
                          <td className="px-3 py-2 font-mono text-xs tabular-nums">
                            {p.effectiveDate}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {formatRupiah(p.basePrice, 2)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              size="icon"
                              variant="outline"
                              title="Hapus entri harga"
                              disabled={isPending}
                              onClick={() =>
                                runAction(
                                  () => deleteResourcePrice(p.id),
                                  'Entri harga dihapus.'
                                )
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-700" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: MASTER AHSP & COMPOSITIONS */}
        <TabsContent value="ahsp" className="space-y-6">
          <form
            className="grid grid-cols-1 gap-3 border border-gridBorder bg-white p-4 sm:grid-cols-6"
            onSubmit={(e) => {
              e.preventDefault();
              runAction(
                () =>
                  createAhsp({
                    code: ahspCode,
                    name: ahspName,
                    unit: ahspUnit,
                  }),
                'AHSP baru ditambahkan.'
              );
              setAhspCode('');
              setAhspName('');
            }}
          >
            <Input
              placeholder="Kode AHSP"
              value={ahspCode}
              onChange={(e) => setAhspCode(e.target.value)}
              required
              className="font-mono"
            />
            <Input
              placeholder="Nama Pekerjaan AHSP"
              value={ahspName}
              onChange={(e) => setAhspName(e.target.value)}
              required
              className="sm:col-span-3"
            />
            <Input
              placeholder="Satuan (m2, m3, m1)"
              value={ahspUnit}
              onChange={(e) => setAhspUnit(e.target.value)}
              required
            />
            <Button type="submit" disabled={isPending}>
              <Plus className="h-4 w-4" />
              Tambah AHSP
            </Button>
          </form>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left: AHSP list */}
            <div className="border border-gridBorder bg-white lg:col-span-5">
              <div className="border-b border-gridBorder bg-subtle px-4 py-2.5 font-mono text-xs uppercase text-slateInk">
                Daftar Master AHSP
              </div>
              <div className="divide-y divide-gridBorder">
                {initial.ahsps.map((ahsp) => {
                  const isEditing = editingAhspId === ahsp.id && editAhspDraft;
                  const isSelected = selectedAhspId === ahsp.id;
                  return (
                    <div
                      key={ahsp.id}
                      className={`p-3 ${isSelected ? 'bg-subtle/80 border-l-2 border-l-ink' : ''}`}
                    >
                      {isEditing ? (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Input
                              value={editAhspDraft.code}
                              onChange={(e) =>
                                setEditAhspDraft({
                                  ...editAhspDraft,
                                  code: e.target.value,
                                })
                              }
                              className="h-8 font-mono text-xs"
                            />
                            <Input
                              value={editAhspDraft.unit}
                              onChange={(e) =>
                                setEditAhspDraft({
                                  ...editAhspDraft,
                                  unit: e.target.value,
                                })
                              }
                              className="h-8 w-20 font-mono text-xs"
                            />
                          </div>
                          <Input
                            value={editAhspDraft.name}
                            onChange={(e) =>
                              setEditAhspDraft({
                                ...editAhspDraft,
                                name: e.target.value,
                              })
                            }
                            className="h-8"
                          />
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              onClick={() => {
                                runAction(
                                  () => updateAhsp(editAhspDraft),
                                  'AHSP diperbarui.'
                                );
                                setEditingAhspId(null);
                                setEditAhspDraft(null);
                              }}
                            >
                              Simpan
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingAhspId(null);
                                setEditAhspDraft(null);
                              }}
                            >
                              Batal
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedAhspId(ahsp.id)}
                            className="text-left"
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-xs text-slateInk">
                                {ahsp.code}
                              </span>
                              <Badge variant={ahsp.isActive ? 'finalized' : 'default'}>
                                {ahsp.unit}
                              </Badge>
                              {(isDummyText(ahsp.name) || isDummyText(ahsp.code)) && (
                                <Badge variant="dummy">DUMMY</Badge>
                              )}
                            </div>
                            <p className="mt-1 text-sm font-medium text-ink">
                              {ahsp.name}
                            </p>
                          </button>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              size="icon"
                              variant="outline"
                              title="Edit"
                              onClick={() => {
                                setEditingAhspId(ahsp.id);
                                setEditAhspDraft({ ...ahsp });
                              }}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              title={ahsp.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                              onClick={() =>
                                runAction(
                                  () =>
                                    updateAhsp({
                                      ...ahsp,
                                      isActive: !ahsp.isActive,
                                    }),
                                  'Status AHSP diperbarui.'
                                )
                              }
                            >
                              <Power className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              title="Hapus"
                              onClick={() =>
                                runAction(
                                  () => deleteAhsp(ahsp.id),
                                  'AHSP dihapus.'
                                )
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-700" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Selected AHSP Compositions + Live HSP Preview */}
            <div className="space-y-4 border border-gridBorder bg-white p-4 lg:col-span-7">
              {selectedAhsp ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gridBorder pb-3">
                    <div>
                      <p className="font-mono text-xs text-slateInk">
                        {selectedAhsp.code} ({selectedAhsp.unit})
                      </p>
                      <h3 className="font-display text-lg font-semibold text-ink">
                        Komposisi: {selectedAhsp.name}
                      </h3>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[11px] uppercase text-slateInk">
                        Pratinjau HSP (3 desimal)
                      </p>
                      <p className="font-mono text-lg font-semibold tabular-nums text-ink">
                        {previewHspDisplay.ok
                          ? previewHspDisplay.value
                          : 'Harga belum lengkap'}
                      </p>
                      {!previewHspDisplay.ok && (
                        <p className="text-xs text-red-700">
                          {previewHspDisplay.msg}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 bg-subtle p-2.5 text-xs">
                    <span className="font-mono uppercase text-slateInk">
                      Uji Pratinjau Wilayah &amp; Tanggal:
                    </span>
                    <select
                      value={previewRegionId}
                      onChange={(e) => setPreviewRegionId(e.target.value)}
                      className="h-8 border border-gridBorder bg-white px-2 text-xs"
                    >
                      {initial.regions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="date"
                      value={previewDate}
                      onChange={(e) => setPreviewDate(e.target.value)}
                      className="h-8 w-40 font-mono text-xs"
                    />
                  </div>

                  <form
                    className="grid grid-cols-1 gap-2 sm:grid-cols-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      runAction(
                        () =>
                          addAhspComposition({
                            ahspId: selectedAhsp.id,
                            resourceId: compResId,
                            coefficient: compCoef,
                          }),
                        'Baris komposisi ditambahkan.'
                      );
                      setCompCoef('');
                    }}
                  >
                    <select
                      value={compResId}
                      onChange={(e) => setCompResId(e.target.value)}
                      className="h-9 border border-gridBorder bg-white px-2 text-sm sm:col-span-2"
                      required
                    >
                      {initial.resources
                        .filter((r) => r.isActive)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.code} — {r.name} ({r.unit})
                          </option>
                        ))}
                    </select>
                    <Input
                      placeholder="Koefisien (4 desimal)"
                      value={compCoef}
                      onChange={(e) => setCompCoef(e.target.value)}
                      required
                      className="font-mono"
                    />
                    <Button type="submit" disabled={isPending}>
                      <Plus className="h-4 w-4" />
                      Tambah Baris
                    </Button>
                  </form>

                  <table className="w-full border-collapse border border-gridBorder text-left text-sm">
                    <thead className="border-b border-gridBorder bg-subtle font-mono text-xs uppercase text-slateInk">
                      <tr>
                        <th className="px-3 py-2">Resource</th>
                        <th className="px-3 py-2">Tipe</th>
                        <th className="px-3 py-2 text-right">Koefisien</th>
                        <th className="px-3 py-2 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gridBorder">
                      {selectedComps.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-3 py-6 text-center text-slateInk"
                          >
                            Belum ada komposisi resource pada AHSP ini.
                          </td>
                        </tr>
                      ) : (
                        selectedComps.map((c) => {
                          const res = resourceMap.get(c.resourceId);
                          return (
                            <tr key={c.id}>
                              <td className="px-3 py-2">
                                <span className="font-mono text-xs text-slateInk">
                                  {res?.code}
                                </span>{' '}
                                <span className="font-medium">{res?.name}</span>{' '}
                                <span className="text-xs text-slateInk">
                                  ({res?.unit})
                                </span>
                              </td>
                              <td className="px-3 py-2 font-mono text-xs">
                                {res?.type}
                              </td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums">
                                <input
                                  defaultValue={c.coefficient}
                                  onBlur={(e) => {
                                    const nextVal = e.target.value.trim();
                                    if (nextVal && nextVal !== c.coefficient) {
                                      runAction(
                                        () =>
                                          updateAhspComposition({
                                            id: c.id,
                                            coefficient: nextVal,
                                          }),
                                        'Koefisien diperbarui.'
                                      );
                                    }
                                  }}
                                  className="w-28 border border-gridBorder bg-white px-2 py-1 text-right font-mono text-xs tabular-nums"
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  title="Hapus komposisi"
                                  onClick={() =>
                                    runAction(
                                      () => deleteAhspComposition(c.id),
                                      'Komposisi dihapus.'
                                    )
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-red-700" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </>
              ) : (
                <p className="text-sm text-slateInk">
                  Pilih salah satu AHSP di panel kiri untuk mengelola komposisi.
                </p>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
