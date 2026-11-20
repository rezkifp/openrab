'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Calculator,
  Check,
  Copy,
  Edit3,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  Lock,
  Package,
  Plus,
  Save,
  Scale,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  duplicateProjectAsDraft,
  finalizeProject,
} from '@/app/actions/finalize';
import {
  createWbsNode,
  deleteTakeoffRow,
  deleteWbsNode,
  duplicateTakeoffRow,
  moveTakeoffRow,
  moveWbsNode,
  renameWbsNode,
  saveTakeoffRow,
  updateProjectMeta,
  updateWbsSchedule,
  type WorkspacePayload,
} from '@/app/actions/project';
import { RecapAndSCurvePanel } from '@/components/workspace/RecapAndSCurvePanel';
import { KeyboardShortcutsDialog } from '@/components/workspace/KeyboardShortcutsDialog';
import { SubTakeoffDialog } from '@/components/workspace/SubTakeoffDialog';
import { ValueEngineeringPanel } from '@/components/workspace/ValueEngineeringPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ResourceType } from '@/lib/rab/calc';
import { formatIdDecimal, formatRupiah } from '@/lib/rab/format';
import type {
  ComputedTakeoffRow,
  WorkspaceWbsNode,
} from '@/lib/rab/workspace-calc';
import { useProjectStore } from '@/store/useProjectStore';

interface WbsTreeNode extends WorkspaceWbsNode {
  depth: number;
  children: WbsTreeNode[];
}

function buildWbsTree(nodes: WorkspaceWbsNode[]): WbsTreeNode[] {
  const map = new Map<string, WbsTreeNode>();
  for (const n of nodes) {
    map.set(n.id, { ...n, depth: 1, children: [] });
  }
  const roots: WbsTreeNode[] = [];
  for (const n of nodes) {
    const current = map.get(n.id)!;
    if (n.parentId && map.has(n.parentId)) {
      map.get(n.parentId)!.children.push(current);
    } else {
      roots.push(current);
    }
  }
  const sortAndDepth = (list: WbsTreeNode[], depth: number) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const item of list) {
      item.depth = depth;
      sortAndDepth(item.children, depth + 1);
    }
  };
  sortAndDepth(roots, 1);
  return roots;
}

const columnHelper = createColumnHelper<ComputedTakeoffRow>();

const RESOURCE_GROUP_LABELS: Record<ResourceType, string> = {
  MATERIAL: 'Bahan / Material',
  LABOR: 'Tenaga Kerja / Upah',
  EQUIPMENT: 'Peralatan',
};

export function ProjectWorkspaceClient({
  initial,
}: {
  initial: WorkspacePayload;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);
  const [finalizeOpen, setFinalizeOpen] = useState(false);

  const hydrate = useProjectStore((s) => s.hydrate);
  const project = useProjectStore((s) => s.project) ?? initial.project;
  const regions = useProjectStore((s) => s.regions);
  const wbsList = useProjectStore((s) => s.wbsList);
  const ahsps = useProjectStore((s) => s.ahsps);
  const computed = useProjectStore((s) => s.computed) ?? initial.computed;
  const selectedWbsId = useProjectStore((s) => s.selectedWbsId);
  const selectWbs = useProjectStore((s) => s.selectWbs);
  const updateTakeoffFieldLocal = useProjectStore(
    (s) => s.updateTakeoffFieldLocal
  );
  const applyServerTakeoffRow = useProjectStore((s) => s.applyServerTakeoffRow);
  const setRowServerError = useProjectStore((s) => s.setRowServerError);
  const rowServerErrors = useProjectStore((s) => s.rowServerErrors);
  const hasDummy = useProjectStore((s) => s.hasDummy);

  useEffect(() => {
    hydrate(initial, true);
  }, [initial, hydrate]);

  const [metaName, setMetaName] = useState(initial.project.name);
  const [metaRegionId, setMetaRegionId] = useState(initial.project.regionId);
  const [metaPriceDate, setMetaPriceDate] = useState(initial.project.priceDate);
  const [metaOhp, setMetaOhp] = useState(initial.project.overheadProfitMargin);
  const [metaPpn, setMetaPpn] = useState(initial.project.taxRatePpn);
  const [metaClientName, setMetaClientName] = useState(
    initial.project.clientName ?? ''
  );
  const [metaLocation, setMetaLocation] = useState(
    initial.project.projectLocation ?? ''
  );
  const [metaArchitect, setMetaArchitect] = useState(
    initial.project.architectName ?? ''
  );
  const [metaAreaM2, setMetaAreaM2] = useState(
    initial.project.buildingAreaM2 ?? ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [subTakeoffRowId, setSubTakeoffRowId] = useState<string | null>(null);
  const [exportMode, setExportMode] = useState<'internal' | 'client' | 'boq'>(
    'internal'
  );
  const [activeTab, setActiveTab] = useState<string>('rab');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('openrab_shortcuts_enabled');
      if (saved === 'false') setShortcutsEnabled(false);
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleToggleShortcuts = (next: boolean) => {
    setShortcutsEnabled(next);
    try {
      localStorage.setItem('openrab_shortcuts_enabled', String(next));
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    if (!shortcutsEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape' && shortcutsOpen) {
        setShortcutsOpen(false);
        return;
      }

      if (isTyping) return;

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === '1') {
          e.preventDefault();
          setActiveTab('rab');
        } else if (e.key === '2') {
          e.preventDefault();
          setActiveTab('bom');
        } else if (e.key === '3') {
          e.preventDefault();
          setActiveTab('recap');
        } else if (e.key === '4') {
          e.preventDefault();
          setActiveTab('ve');
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'e') {
          e.preventDefault();
          window.location.href = `/api/projects/${project.id}/export/excel?mode=${exportMode}`;
        } else if (key === 'p') {
          e.preventDefault();
          window.open(
            `/api/projects/${project.id}/export/pdf?mode=${exportMode}`,
            '_blank',
            'noopener,noreferrer'
          );
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcutsEnabled, shortcutsOpen, project.id, exportMode]);

  useEffect(() => {
    setMetaName(initial.project.name);
    setMetaRegionId(initial.project.regionId);
    setMetaPriceDate(initial.project.priceDate);
    setMetaOhp(initial.project.overheadProfitMargin);
    setMetaPpn(initial.project.taxRatePpn);
    setMetaClientName(initial.project.clientName ?? '');
    setMetaLocation(initial.project.projectLocation ?? '');
    setMetaArchitect(initial.project.architectName ?? '');
    setMetaAreaM2(initial.project.buildingAreaM2 ?? '');
  }, [initial.project]);

  const [newRootWbsName, setNewRootWbsName] = useState('');
  const [addingChildTo, setAddingChildTo] = useState<string | null>(null);
  const [newChildName, setNewChildName] = useState('');
  const [renamingWbsId, setRenamingWbsId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const activeAhsps = useMemo(
    () => ahsps.filter((a) => a.isActive),
    [ahsps]
  );
  const [addDesc, setAddDesc] = useState('');
  const [addAhspId, setAddAhspId] = useState(
    initial.ahsps.find((a) => a.isActive)?.id ?? ''
  );
  const [addP, setAddP] = useState('');
  const [addL, setAddL] = useState('');
  const [addT, setAddT] = useState('');
  const [addCount, setAddCount] = useState('');
  const [addDeduction, setAddDeduction] = useState('0');

  useEffect(() => {
    if (!addAhspId && activeAhsps.length > 0) {
      setAddAhspId(activeAhsps[0].id);
    }
  }, [addAhspId, activeAhsps]);

  const isLocked = project.status === 'FINALIZED';
  const effectiveWbsList = wbsList.length > 0 ? wbsList : initial.wbsList;
  const effectiveRegions = regions.length > 0 ? regions : initial.regions;
  const wbsTree = useMemo(
    () => buildWbsTree(effectiveWbsList),
    [effectiveWbsList]
  );

  const visibleTakeoffs = useMemo(() => {
    const byWbs = selectedWbsId
      ? computed.rows.filter((r) => r.wbsId === selectedWbsId)
      : computed.rows;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return byWbs;
    return byWbs.filter(
      (r) =>
        r.description.toLowerCase().includes(q) ||
        r.ahspCode.toLowerCase().includes(q) ||
        r.ahspName.toLowerCase().includes(q)
    );
  }, [computed.rows, selectedWbsId, searchQuery]);

  const activeSubTakeoffRow = useMemo(
    () => computed.rows.find((r) => r.id === subTakeoffRowId) ?? null,
    [computed.rows, subTakeoffRowId]
  );

  const persistRow = async (rowId: string) => {
    if (isLocked) return;
    const latest =
      useProjectStore
        .getState()
        .computed?.rows.find((r) => r.id === rowId) ??
      computed.rows.find((r) => r.id === rowId);
    if (!latest) return;
    if (latest.validationError) {
      setRowServerError(latest.id, latest.validationError);
      return;
    }
    const res = await saveTakeoffRow({
      id: latest.id,
      wbsId: latest.wbsId,
      ahspId: latest.ahspId,
      description: latest.description,
      length: latest.length,
      width: latest.width,
      height: latest.height,
      count: latest.count,
      deductionVolume: latest.deductionVolume,
      subItemsJson: latest.subItemsJson,
    });
    if (!res.ok) {
      setRowServerError(latest.id, res.error);
    } else {
      applyServerTakeoffRow(res.data);
      router.refresh();
    }
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('description', {
        header: 'Deskripsi Pekerjaan',
        cell: (info) => {
          const row = info.row.original;
          const rowErr = row.validationError || rowServerErrors[row.id];
          return (
            <div className="min-w-[200px] space-y-1">
              <input
                type="text"
                value={row.description}
                disabled={isLocked}
                onChange={(e) =>
                  updateTakeoffFieldLocal(row.id, {
                    description: e.target.value,
                  })
                }
                onBlur={() => void persistRow(row.id)}
                className="w-full border border-gridBorder bg-white px-2 py-1 text-xs text-ink disabled:bg-subtle"
              />
              {rowErr && (
                <p className="text-[11px] font-medium text-red-700">{rowErr}</p>
              )}
              {row.priceErrors.length > 0 && (
                <p className="text-[11px] text-red-700">
                  {row.priceErrors[0]}
                </p>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor('ahspId', {
        header: 'AHSP',
        cell: (info) => {
          const row = info.row.original;
          if (isLocked) {
            return (
              <div className="max-w-[220px] text-xs text-ink">
                <span className="font-mono text-[11px] text-slateInk">
                  {row.ahspCode}
                </span>{' '}
                <span>{row.ahspName}</span>
              </div>
            );
          }
          const selectedInactive = !row.ahspIsActive;
          return (
            <select
              value={row.ahspId}
              disabled={isLocked}
              onChange={(e) => {
                const nextAhspId = e.target.value;
                updateTakeoffFieldLocal(row.id, { ahspId: nextAhspId });
                void saveTakeoffRow({
                  id: row.id,
                  wbsId: row.wbsId,
                  ahspId: nextAhspId,
                  description: row.description,
                  length: row.length,
                  width: row.width,
                  height: row.height,
                  count: row.count,
                  deductionVolume: row.deductionVolume,
                  subItemsJson: row.subItemsJson,
                }).then((res) => {
                  if (!res.ok) setRowServerError(row.id, res.error);
                  else {
                    applyServerTakeoffRow(res.data);
                    router.refresh();
                  }
                });
              }}
              className="h-7 max-w-[210px] border border-gridBorder bg-white px-1.5 text-xs text-ink disabled:bg-subtle"
            >
              {selectedInactive && (
                <option value={row.ahspId}>
                  [NONAKTIF] {row.ahspCode} — {row.ahspName}
                </option>
              )}
              {activeAhsps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          );
        },
      }),
      ...(['length', 'width', 'height', 'count', 'deductionVolume'] as const).map(
        (field) => {
          const labels: Record<typeof field, string> = {
            length: 'P',
            width: 'L',
            height: 'T',
            count: 'Jml',
            deductionVolume: 'Pengurang',
          };
          return columnHelper.accessor(field, {
            header: labels[field],
            cell: (info) => {
              const row = info.row.original;
              const rawVal = row[field] ?? '';
              const hasSubItems = Boolean(row.subItemsJson);
              return (
                <input
                  type="text"
                  inputMode="decimal"
                  value={rawVal}
                  placeholder={field === 'deductionVolume' ? '0' : 'null'}
                  disabled={isLocked || hasSubItems}
                  title={
                    hasSubItems
                      ? 'Dihitung otomatis dari rincian Sub-Takeoff (klik ikon kalkulator untuk mengubah)'
                      : undefined
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    const normalized =
                      field === 'deductionVolume'
                        ? val === ''
                          ? '0'
                          : val
                        : val === ''
                        ? null
                        : val;
                    updateTakeoffFieldLocal(row.id, {
                      [field]: normalized,
                    });
                  }}
                  onBlur={() => void persistRow(row.id)}
                  className="h-7 w-16 border border-gridBorder bg-white px-1.5 text-right font-mono text-xs tabular-nums text-ink placeholder:text-slate-300 disabled:bg-subtle"
                />
              );
            },
          });
        }
      ),
      columnHelper.accessor('calculatedVolume', {
        header: 'Volume',
        cell: (info) => {
          const row = info.row.original;
          return (
            <span className="block text-right font-mono text-xs font-medium tabular-nums">
              {row.validationError
                ? 'ERR'
                : formatIdDecimal(row.calculatedVolume, 4)}
            </span>
          );
        },
      }),
      columnHelper.accessor('ahspUnit', {
        header: 'Sat',
        cell: (info) => (
          <span className="font-mono text-xs text-slateInk">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('hsp', {
        header: 'HSP',
        cell: (info) => {
          const val = info.getValue();
          return (
            <span className="block text-right font-mono text-xs tabular-nums">
              {val === null ? '-' : formatRupiah(val, 3)}
            </span>
          );
        },
      }),
      columnHelper.accessor('baseTotal', {
        header: 'Total',
        cell: (info) => {
          const val = info.getValue();
          return (
            <span className="block text-right font-mono text-xs font-semibold tabular-nums">
              {val === null ? '-' : formatRupiah(val, 2)}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: (info) => {
          const row = info.row.original;
          let subCount = 0;
          if (row.subItemsJson) {
            try {
              const parsed = JSON.parse(row.subItemsJson) as unknown[];
              if (Array.isArray(parsed)) subCount = parsed.length;
            } catch {
              subCount = 0;
            }
          }

          return (
            <div className="flex items-center justify-end gap-0.5">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title={
                  subCount > 0
                    ? `Rincian Sub-Takeoff (${subCount} segmen)`
                    : 'Kalkulator Sub-Takeoff (Multi-ruangan / Bentuk)'
                }
                onClick={() => setSubTakeoffRowId(row.id)}
                className={subCount > 0 ? 'text-amber-700' : 'text-slateInk'}
              >
                <Calculator className="h-3.5 w-3.5" />
              </Button>
              {!isLocked && (
                <>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="Naikkan urutan baris"
                    disabled={isPending}
                    onClick={() => {
                      setBannerError(null);
                      startTransition(async () => {
                        const res = await moveTakeoffRow({
                          takeoffId: row.id,
                          direction: 'UP',
                        });
                        if (!res.ok) setBannerError(res.error);
                        else router.refresh();
                      });
                    }}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="Turunkan urutan baris"
                    disabled={isPending}
                    onClick={() => {
                      setBannerError(null);
                      startTransition(async () => {
                        const res = await moveTakeoffRow({
                          takeoffId: row.id,
                          direction: 'DOWN',
                        });
                        if (!res.ok) setBannerError(res.error);
                        else router.refresh();
                      });
                    }}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="Duplikat baris takeoff"
                    disabled={isPending}
                    onClick={() => {
                      setBannerError(null);
                      startTransition(async () => {
                        const res = await duplicateTakeoffRow(row.id);
                        if (!res.ok) setBannerError(res.error);
                        else router.refresh();
                      });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="Hapus baris takeoff"
                    disabled={isPending}
                    onClick={() => {
                      setBannerError(null);
                      startTransition(async () => {
                        const res = await deleteTakeoffRow(row.id);
                        if (!res.ok) setBannerError(res.error);
                        else router.refresh();
                      });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-700" />
                  </Button>
                </>
              )}
            </div>
          );
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLocked, activeAhsps, rowServerErrors, isPending]
  );

  const table = useReactTable({
    data: visibleTakeoffs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const bomItems = computed.bom;
  const bomByGroup = useMemo(() => {
    const groups: Record<ResourceType, typeof bomItems> = {
      MATERIAL: [],
      LABOR: [],
      EQUIPMENT: [],
    };
    for (const item of bomItems) {
      groups[item.resourceType].push(item);
    }
    return groups;
  }, [bomItems]);

  const handleSaveMeta = (e: React.FormEvent) => {
    e.preventDefault();
    setBannerError(null);
    setBannerSuccess(null);
    startTransition(async () => {
      const res = await updateProjectMeta({
        projectId: project.id,
        name: metaName,
        regionId: metaRegionId,
        priceDate: metaPriceDate,
        overheadProfitMargin: metaOhp,
        taxRatePpn: metaPpn,
        clientName: metaClientName,
        projectLocation: metaLocation,
        architectName: metaArchitect,
        buildingAreaM2: metaAreaM2,
      });
      if (!res.ok) setBannerError(res.error);
      else {
        setBannerSuccess('Pengaturan proyek disimpan.');
        router.refresh();
      }
    });
  };

  const handleAddTakeoff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWbsId) {
      setBannerError(
        'Pilih salah satu node WBS di sidebar kiri terlebih dahulu.'
      );
      return;
    }
    setBannerError(null);
    setBannerSuccess(null);
    startTransition(async () => {
      const res = await saveTakeoffRow({
        wbsId: selectedWbsId,
        ahspId: addAhspId,
        description: addDesc,
        length: addP.trim() === '' ? null : addP.trim(),
        width: addL.trim() === '' ? null : addL.trim(),
        height: addT.trim() === '' ? null : addT.trim(),
        count: addCount.trim() === '' ? null : addCount.trim(),
        deductionVolume: addDeduction.trim() === '' ? '0' : addDeduction.trim(),
      });
      if (!res.ok) {
        setBannerError(res.error);
      } else {
        setAddDesc('');
        setAddP('');
        setAddL('');
        setAddT('');
        setAddCount('');
        setAddDeduction('0');
        router.refresh();
      }
    });
  };

  const handleFinalize = () => {
    setBannerError(null);
    setBannerSuccess(null);
    startTransition(async () => {
      const res = await finalizeProject(project.id);
      if (!res.ok) {
        setBannerError(res.error);
        setFinalizeOpen(false);
      } else {
        setFinalizeOpen(false);
        setBannerSuccess(
          'Proyek berhasil difinalisasi dan snapshot harga telah dikunci.'
        );
        router.refresh();
      }
    });
  };

  const handleDuplicate = (customSuffix?: string) => {
    setBannerError(null);
    setBannerSuccess(null);
    startTransition(async () => {
      const res = await duplicateProjectAsDraft(project.id, customSuffix);
      if (!res.ok) {
        setBannerError(res.error);
      } else {
        router.push(`/projects/${res.data.id}`);
      }
    });
  };

  const handleUpdateSchedule = (
    wbsId: string,
    startWeek: number,
    durationWeeks: number
  ) => {
    setBannerError(null);
    setBannerSuccess(null);
    startTransition(async () => {
      const res = await updateWbsSchedule({ wbsId, startWeek, durationWeeks });
      if (!res.ok) {
        setBannerError(res.error);
      } else {
        setBannerSuccess('Jadwal pelaksanaan WBS diperbarui.');
        router.refresh();
      }
    });
  };

  const renderWbsNodes = (nodes: WbsTreeNode[]) =>
    nodes.map((node) => {
      const isSelected = selectedWbsId === node.id;
      const subtotal = computed.wbsSubtotals[node.id];
      return (
        <div key={node.id} className="min-w-0 space-y-1">
          <div
            className={`group min-w-0 overflow-hidden border px-2.5 py-2 text-xs ${
              isSelected
                ? 'border-ink bg-subtle font-semibold text-ink'
                : 'border-transparent hover:bg-subtle/60'
            }`}
            style={{ marginLeft: `${Math.min(node.depth - 1, 4) * 10}px` }}
          >
            {renamingWbsId === node.id ? (
              <div className="flex flex-1 items-center gap-1">
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="h-7 text-xs"
                />
                <Button
                  size="icon"
                  variant="default"
                  className="h-7 w-7 shrink-0"
                  onClick={() => {
                    startTransition(async () => {
                      const res = await renameWbsNode({
                        wbsId: node.id,
                        name: renameValue,
                      });
                      if (!res.ok) setBannerError(res.error);
                      else {
                        setRenamingWbsId(null);
                        router.refresh();
                      }
                    });
                  }}
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setRenamingWbsId(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="min-w-0 space-y-1">
                <button
                  type="button"
                  onClick={() => selectWbs(node.id)}
                  className="block w-full min-w-0 text-left break-words leading-snug"
                >
                  {node.name}
                </button>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => selectWbs(node.id)}
                    className="min-w-0 truncate text-left font-mono text-[11px] font-normal tabular-nums text-slateInk"
                  >
                    {subtotal === null || subtotal === undefined
                      ? '-'
                      : formatRupiah(subtotal, 2)}
                    {subtotal !== null &&
                      subtotal !== undefined &&
                      computed.wbsWeights[node.id] && (
                        <span className="ml-1 text-[10px] text-amber-800">
                          ({formatIdDecimal(computed.wbsWeights[node.id], 2)}%)
                        </span>
                      )}
                  </button>
                  {!isLocked && (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-80 group-hover:opacity-100">
                      {node.depth < 5 && (
                        <button
                          type="button"
                          title="Tambah sub-WBS"
                          onClick={() => {
                            setAddingChildTo(node.id);
                            setNewChildName('');
                          }}
                          className="p-0.5 text-slateInk hover:text-ink"
                        >
                          <FolderPlus className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        title="Rename WBS"
                        onClick={() => {
                          setRenamingWbsId(node.id);
                          setRenameValue(node.name);
                        }}
                        className="p-0.5 text-slateInk hover:text-ink"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Naikkan urutan"
                        onClick={() =>
                          startTransition(async () => {
                            const res = await moveWbsNode({
                              wbsId: node.id,
                              direction: 'UP',
                            });
                            if (!res.ok) setBannerError(res.error);
                            else router.refresh();
                          })
                        }
                        className="p-0.5 text-slateInk hover:text-ink"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Turunkan urutan"
                        onClick={() =>
                          startTransition(async () => {
                            const res = await moveWbsNode({
                              wbsId: node.id,
                              direction: 'DOWN',
                            });
                            if (!res.ok) setBannerError(res.error);
                            else router.refresh();
                          })
                        }
                        className="p-0.5 text-slateInk hover:text-ink"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Hapus node WBS (harus kosong)"
                        onClick={() =>
                          startTransition(async () => {
                            setBannerError(null);
                            const res = await deleteWbsNode(node.id);
                            if (!res.ok) setBannerError(res.error);
                            else router.refresh();
                          })
                        }
                        className="p-0.5 text-red-700 hover:text-red-900"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {addingChildTo === node.id && (
            <div
              className="flex gap-1 py-1"
              style={{ marginLeft: `${Math.min(node.depth, 4) * 10}px` }}
            >
              <Input
                placeholder="Nama sub-WBS"
                value={newChildName}
                onChange={(e) => setNewChildName(e.target.value)}
                className="h-7 text-xs"
              />
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  startTransition(async () => {
                    const res = await createWbsNode({
                      projectId: project.id,
                      parentId: node.id,
                      name: newChildName,
                    });
                    if (!res.ok) setBannerError(res.error);
                    else {
                      setAddingChildTo(null);
                      selectWbs(res.data.id);
                      router.refresh();
                    }
                  });
                }}
              >
                OK
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => setAddingChildTo(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {node.children.length > 0 && renderWbsNodes(node.children)}
        </div>
      );
    });

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gridBorder pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 border border-gridBorder bg-white px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-subtle"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Daftar Proyek
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-semibold text-ink">
                {project.name}
              </h1>
              <Badge variant={isLocked ? 'finalized' : 'draft'}>
                {project.status}
              </Badge>
              {hasDummy && <Badge variant="dummy">DUMMY</Badge>}
            </div>
            <p className="font-mono text-xs text-slateInk">
              Wilayah: {project.regionName} · Price Date: {project.priceDate}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {computed.totals !== null && (
            <>
              <select
                aria-label="Mode Dokumen Export"
                value={exportMode}
                onChange={(e) =>
                  setExportMode(e.target.value as 'internal' | 'client' | 'boq')
                }
                className="h-8 border border-gridBorder bg-white px-2 font-mono text-xs text-ink"
              >
                <option value="internal">Mode: Internal QS</option>
                <option value="client">Mode: Versi Klien (OE)</option>
                <option value="boq">Mode: Blank BoQ Tender</option>
              </select>
              <a
                href={`/api/projects/${project.id}/export/excel?mode=${exportMode}`}
                className="inline-flex h-8 items-center gap-1.5 border border-gridBorder bg-white px-3 text-xs font-medium text-ink hover:bg-subtle"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
                Export Excel
              </a>
              <a
                href={`/api/projects/${project.id}/export/pdf?mode=${exportMode}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 border border-gridBorder bg-white px-3 text-xs font-medium text-ink hover:bg-subtle"
              >
                <FileText className="h-3.5 w-3.5 text-red-700" />
                Export PDF
              </a>
            </>
          )}

          <KeyboardShortcutsDialog
            open={shortcutsOpen}
            onOpenChange={setShortcutsOpen}
            enabled={shortcutsEnabled}
            onToggleEnabled={handleToggleShortcuts}
          />

          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => handleDuplicate()}
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate as DRAFT
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => handleDuplicate('(Opsi VE)')}
            title="Buat salinan cabang untuk Value Engineering"
          >
            Buat Opsi VE
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => handleDuplicate('(Addendum VO)')}
            title="Buat salinan cabang untuk Pekerjaan Tambah / Kurang"
          >
            Buat Addendum (VO)
          </Button>

          {!isLocked && (
            <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
              <DialogTrigger asChild>
                <Button variant="locked" size="sm" disabled={isPending}>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Finalize Proyek
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Konfirmasi Finalisasi Proyek</DialogTitle>
                  <DialogDescription>
                    Tindakan ini akan membekukan seluruh harga efektif,
                    komposisi AHSP, dan volume takeoff ke dalam{' '}
                    <code>takeoff_snapshots</code>. Proyek yang sudah{' '}
                    <strong>FINALIZED</strong> tidak dapat diubah lagi. Untuk
                    revisi di masa depan, gunakan{' '}
                    <strong>Duplicate as DRAFT</strong>.
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-4 space-y-2 border border-gridBorder bg-subtle p-3 text-xs">
                  <p>
                    <strong>Proyek:</strong> {project.name}
                  </p>
                  <p>
                    <strong>Wilayah:</strong> {project.regionName}
                  </p>
                  <p>
                    <strong>Price Date:</strong> {project.priceDate}
                  </p>
                  <p>
                    <strong>Grand Total:</strong>{' '}
                    {computed.totals
                      ? formatRupiah(computed.totals.grandTotal, 2)
                      : 'Belum valid'}
                  </p>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setFinalizeOpen(false)}
                  >
                    Batal
                  </Button>
                  <Button
                    variant="locked"
                    disabled={isPending}
                    onClick={handleFinalize}
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Ya, Kunci &amp; Finalize
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* FINALIZED Locked Banner */}
      {isLocked && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-emerald-400 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <div className="flex items-center gap-2.5">
            <Lock className="h-4 w-4 shrink-0 text-emerald-700" />
            <span>
              <strong>TERKUNCI (FINALIZED)</strong> — Snapshot harga &amp; AHSP
              dibekukan pada wilayah{' '}
              <strong>{project.regionNameFrozen ?? project.regionName}</strong>
              {project.finalizedAt
                ? ` (${new Date(project.finalizedAt).toLocaleString('id-ID')})`
                : ''}
              . Seluruh perubahan langsung ditolak oleh server.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => handleDuplicate()}
          >
            <Copy className="h-3.5 w-3.5" />
            Buat Salinan Revisi (DRAFT)
          </Button>
        </div>
      )}

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

      {/* Missing effective price banner */}
      {computed.priceErrors.length > 0 && (
        <div className="space-y-1 border border-red-400 bg-red-50 px-4 py-3 text-sm text-red-900">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-red-700" />
            <span>Harga efektif tidak ditemukan — total RAB ditangguhkan:</span>
          </div>
          <ul className="list-inside list-disc text-xs">
            {computed.priceErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Project metadata form */}
      <form
        onSubmit={handleSaveMeta}
        className="grid grid-cols-1 gap-3 border border-gridBorder bg-white p-4 sm:grid-cols-12"
      >
        <div className="sm:col-span-4">
          <label className="mb-1 block text-xs font-medium text-slateInk">
            Nama Proyek
          </label>
          <Input
            value={metaName}
            disabled={isLocked}
            onChange={(e) => setMetaName(e.target.value)}
            required
          />
        </div>
        <div className="sm:col-span-3">
          <label className="mb-1 block text-xs font-medium text-slateInk">
            Wilayah Harga
          </label>
          <select
            value={metaRegionId}
            disabled={isLocked}
            onChange={(e) => setMetaRegionId(e.target.value)}
            className="h-9 w-full border border-gridBorder bg-white px-2 text-sm disabled:bg-subtle"
          >
            {effectiveRegions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {!r.isActive ? ' (NONAKTIF)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slateInk">
            Price Date
          </label>
          <Input
            type="date"
            value={metaPriceDate}
            disabled={isLocked}
            onChange={(e) => setMetaPriceDate(e.target.value)}
            className="font-mono text-xs"
            required
          />
        </div>
        <div className="sm:col-span-1">
          <label className="mb-1 block text-xs font-medium text-slateInk">
            OHP %
          </label>
          <Input
            value={metaOhp}
            disabled={isLocked}
            onChange={(e) => setMetaOhp(e.target.value)}
            className="font-mono text-xs"
            required
          />
        </div>
        <div className="sm:col-span-1">
          <label className="mb-1 block text-xs font-medium text-slateInk">
            PPN %
          </label>
          <Input
            value={metaPpn}
            disabled={isLocked}
            onChange={(e) => setMetaPpn(e.target.value)}
            className="font-mono text-xs"
            required
          />
        </div>
        <div className="flex items-end sm:col-span-1">
          <Button
            type="submit"
            disabled={isLocked || isPending}
            className="w-full"
            title="Simpan metadata proyek"
          >
            <Save className="h-4 w-4" />
          </Button>
        </div>

        <div className="sm:col-span-3">
          <label className="mb-1 block text-xs font-medium text-slateInk">
            Klien / Owner
          </label>
          <Input
            placeholder="Nama pemilik proyek"
            value={metaClientName}
            disabled={isLocked}
            onChange={(e) => setMetaClientName(e.target.value)}
          />
        </div>
        <div className="sm:col-span-4">
          <label className="mb-1 block text-xs font-medium text-slateInk">
            Lokasi Proyek
          </label>
          <Input
            placeholder="Alamat / kota lokasi bangunan"
            value={metaLocation}
            disabled={isLocked}
            onChange={(e) => setMetaLocation(e.target.value)}
          />
        </div>
        <div className="sm:col-span-3">
          <label className="mb-1 block text-xs font-medium text-slateInk">
            Arsitek / Studio
          </label>
          <Input
            placeholder="Nama biro / estimator"
            value={metaArchitect}
            disabled={isLocked}
            onChange={(e) => setMetaArchitect(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slateInk">
            Luas Bangunan (m&sup2;)
          </label>
          <Input
            placeholder="Mis. 120.00"
            value={metaAreaM2}
            disabled={isLocked}
            onChange={(e) => setMetaAreaM2(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
      </form>

      {/* Tabs: Takeoff & RAB, Rekap & Kurva S, BOM, Value Engineering & Addendum */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="rab">
            Takeoff &amp; RAB ({computed.rows.length})
          </TabsTrigger>
          <TabsTrigger value="recap" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Rekapitulasi &amp; Kurva S
          </TabsTrigger>
          <TabsTrigger value="bom" className="gap-1.5">
            <Package className="h-4 w-4" />
            Bill of Materials ({computed.bom.length})
          </TabsTrigger>
          <TabsTrigger value="ve" className="gap-1.5">
            <Scale className="h-4 w-4" />
            Value Engineering &amp; Addendum
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rab">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* WBS Sidebar */}
            <aside className="min-w-0 space-y-3 overflow-hidden border border-gridBorder bg-white p-4 lg:col-span-3">
              <div className="flex items-center justify-between border-b border-gridBorder pb-2">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-ink">
                  Struktur WBS
                </h2>
                <button
                  type="button"
                  onClick={() => selectWbs(null)}
                  className={`font-mono text-[11px] ${
                    selectedWbsId === null
                      ? 'font-bold text-ink underline'
                      : 'text-slateInk hover:text-ink'
                  }`}
                >
                  Semua
                </button>
              </div>

              {!isLocked && (
                <form
                  className="flex gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setBannerError(null);
                    startTransition(async () => {
                      const res = await createWbsNode({
                        projectId: project.id,
                        parentId: null,
                        name: newRootWbsName,
                      });
                      if (!res.ok) setBannerError(res.error);
                      else {
                        setNewRootWbsName('');
                        selectWbs(res.data.id);
                        router.refresh();
                      }
                    });
                  }}
                >
                  <Input
                    placeholder="Tambah WBS Root..."
                    value={newRootWbsName}
                    onChange={(e) => setNewRootWbsName(e.target.value)}
                    className="h-8 text-xs"
                    required
                  />
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8"
                    disabled={isPending}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </form>
              )}

              <div className="space-y-1">{renderWbsNodes(wbsTree)}</div>
            </aside>

            {/* Takeoff Grid & Summary Panel */}
            <section className="min-w-0 space-y-4 lg:col-span-9">
              <div className="overflow-x-auto border border-gridBorder bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gridBorder bg-subtle px-4 py-2.5">
                  <p className="font-mono text-xs uppercase text-slateInk">
                    Takeoff Grid{' '}
                    {selectedWbsId
                      ? `— ${effectiveWbsList.find((w) => w.id === selectedWbsId)?.name ?? ''}`
                      : '— Semua WBS'}
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slateInk" />
                      <Input
                        placeholder="Cari uraian / kode AHSP..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-7 w-56 pl-7 text-xs"
                      />
                    </div>
                    <p className="font-mono text-xs text-slateInk">
                      {visibleTakeoffs.length} baris
                    </p>
                  </div>
                </div>

                <table className="w-full border-collapse text-left text-xs">
                  <thead className="border-b border-gridBorder bg-subtle/70 font-mono text-[11px] uppercase text-slateInk">
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id}>
                        {hg.headers.map((header) => (
                          <th key={header.id} className="px-2 py-2 font-medium">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody className="divide-y divide-gridBorder">
                    {table.getRowModel().rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={columns.length}
                          className="px-4 py-8 text-center text-sm text-slateInk"
                        >
                          Belum ada baris takeoff pada WBS ini.
                        </td>
                      </tr>
                    ) : (
                      table.getRowModel().rows.map((row) => (
                        <tr
                          key={row.id}
                          className="align-top hover:bg-subtle/30"
                        >
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="px-2 py-2">
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {!isLocked && (
                <form
                  onSubmit={handleAddTakeoff}
                  className="space-y-2 border border-gridBorder bg-white p-4"
                >
                  <p className="font-mono text-xs font-semibold uppercase text-slateInk">
                    Tambah Baris Takeoff ke WBS Terpilih
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
                    <Input
                      placeholder="Deskripsi item pekerjaan"
                      value={addDesc}
                      onChange={(e) => setAddDesc(e.target.value)}
                      required
                      className="col-span-2 sm:col-span-3"
                    />
                    <select
                      value={addAhspId}
                      onChange={(e) => setAddAhspId(e.target.value)}
                      required
                      className="col-span-2 h-9 border border-gridBorder bg-white px-2 text-xs sm:col-span-3"
                    >
                      {activeAhsps.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name} ({a.unit})
                        </option>
                      ))}
                    </select>
                    <Input
                      placeholder="P"
                      value={addP}
                      onChange={(e) => setAddP(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <Input
                      placeholder="L"
                      value={addL}
                      onChange={(e) => setAddL(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <Input
                      placeholder="T"
                      value={addT}
                      onChange={(e) => setAddT(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <Input
                      placeholder="Jml"
                      value={addCount}
                      onChange={(e) => setAddCount(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <Input
                      placeholder="Pengurang"
                      value={addDeduction}
                      onChange={(e) => setAddDeduction(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <Button
                      type="submit"
                      disabled={
                        isPending || !selectedWbsId || activeAhsps.length === 0
                      }
                      className="col-span-2 sm:col-span-1"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </form>
              )}

              {/* Financial Summary Panel */}
              <div className="border border-gridBorder bg-white p-5">
                <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-ink">
                  Ringkasan Biaya Proyek
                </h3>
                {computed.totals === null ? (
                  <p className="mt-3 text-sm text-red-700">
                    Total proyek tidak dapat ditampilkan karena ada error
                    validasi atau harga resource yang belum tersedia.
                  </p>
                ) : (
                  <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
                    <div>
                      <dt className="font-mono text-[11px] uppercase text-slateInk">
                        Subtotal
                      </dt>
                      <dd className="mt-1 font-mono text-sm font-medium tabular-nums">
                        {formatRupiah(computed.totals.subtotal, 2)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[11px] uppercase text-slateInk">
                        OHP ({project.overheadProfitMargin}%)
                      </dt>
                      <dd className="mt-1 font-mono text-sm font-medium tabular-nums">
                        {formatRupiah(computed.totals.ohp, 2)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[11px] uppercase text-slateInk">
                        DPP
                      </dt>
                      <dd className="mt-1 font-mono text-sm font-medium tabular-nums">
                        {formatRupiah(computed.totals.dpp, 2)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[11px] uppercase text-slateInk">
                        PPN ({project.taxRatePpn}%)
                      </dt>
                      <dd className="mt-1 font-mono text-sm font-medium tabular-nums">
                        {formatRupiah(computed.totals.ppn, 2)}
                      </dd>
                    </div>
                    <div className="border-l-2 border-l-ink pl-3">
                      <dt className="font-mono text-[11px] font-semibold uppercase text-ink">
                        Grand Total
                      </dt>
                      <dd className="mt-1 font-mono text-lg font-bold tabular-nums text-ink">
                        {formatRupiah(computed.totals.grandTotal, 2)}
                      </dd>
                      {computed.costPerM2 && project.buildingAreaM2 && (
                        <p className="mt-1 font-mono text-[11px] text-slateInk tabular-nums">
                          {formatRupiah(computed.costPerM2, 2)} / m&sup2; (
                          {formatIdDecimal(project.buildingAreaM2, 2)} m&sup2;)
                        </p>
                      )}
                    </div>
                  </dl>
                )}
              </div>
            </section>
          </div>
        </TabsContent>

        {/* BOM TAB */}
        <TabsContent value="bom" className="space-y-6">
          <div className="border border-gridBorder bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gridBorder pb-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">
                  Bill of Materials (BOM) Kebutuhan Resource
                </h2>
                <p className="text-xs text-slateInk">
                  Agregasi SUM(Volume x Koefisien) per resource (4 desimal
                  HALF_UP), sumber:{' '}
                  {isLocked ? 'Snapshot Terkunci' : 'Master & Takeoff Live'}.
                </p>
              </div>
              <Badge variant={isLocked ? 'finalized' : 'draft'}>
                {isLocked ? 'SNAPSHOT' : 'LIVE DRAFT'}
              </Badge>
            </div>

            {computed.bom.length === 0 ? (
              <p className="py-8 text-center text-sm text-slateInk">
                Belum ada kebutuhan resource untuk dihitung.
              </p>
            ) : (
              <div className="mt-4 space-y-6">
                {(['MATERIAL', 'LABOR', 'EQUIPMENT'] as const).map((rtype) => {
                  const items = bomByGroup[rtype];
                  if (items.length === 0) return null;
                  return (
                    <div key={rtype} className="space-y-2">
                      <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-slateInk">
                        {RESOURCE_GROUP_LABELS[rtype]} ({items.length})
                      </h3>
                      <div className="overflow-x-auto border border-gridBorder">
                        <table className="w-full border-collapse text-left text-sm">
                          <thead className="border-b border-gridBorder bg-subtle font-mono text-xs uppercase text-slateInk">
                            <tr>
                              <th className="px-3 py-2">Kode</th>
                              <th className="px-3 py-2">Nama Resource</th>
                              <th className="px-3 py-2">Satuan</th>
                              <th className="px-3 py-2 text-right">
                                Total Kebutuhan
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gridBorder">
                            {items.map((b) => (
                              <tr key={`${b.resourceId}-${b.resourceCode}`}>
                                <td className="px-3 py-2 font-mono text-xs text-slateInk">
                                  {b.resourceCode}
                                </td>
                                <td className="px-3 py-2 font-medium text-ink">
                                  {b.resourceName}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs">
                                  {b.resourceUnit}
                                </td>
                                <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                                  {formatIdDecimal(b.quantity, 4)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* REKAPITULASI & KURVA S TAB */}
        <TabsContent value="recap" className="space-y-6">
          <RecapAndSCurvePanel
            project={project}
            computed={computed}
            isLocked={isLocked}
            isPending={isPending}
            onUpdateSchedule={handleUpdateSchedule}
          />
        </TabsContent>

        {/* VALUE ENGINEERING & ADDENDUM TAB */}
        <TabsContent value="ve" className="space-y-6">
          <ValueEngineeringPanel
            project={project}
            peerProjects={initial.peerProjects}
            isPending={isPending}
            onCreateBranch={(suffix) => handleDuplicate(suffix)}
          />
        </TabsContent>
      </Tabs>

      <SubTakeoffDialog
        row={activeSubTakeoffRow}
        open={subTakeoffRowId !== null}
        disabled={isLocked}
        onOpenChange={(open) => {
          if (!open) setSubTakeoffRowId(null);
        }}
        onSave={async (subItemsJson) => {
          if (!activeSubTakeoffRow) return;
          const res = await saveTakeoffRow({
            id: activeSubTakeoffRow.id,
            wbsId: activeSubTakeoffRow.wbsId,
            ahspId: activeSubTakeoffRow.ahspId,
            description: activeSubTakeoffRow.description,
            length: activeSubTakeoffRow.length,
            width: activeSubTakeoffRow.width,
            height: activeSubTakeoffRow.height,
            count: activeSubTakeoffRow.count,
            deductionVolume: activeSubTakeoffRow.deductionVolume,
            subItemsJson,
          });
          if (!res.ok) {
            setBannerError(res.error);
          } else {
            applyServerTakeoffRow(res.data);
            router.refresh();
          }
        }}
      />
    </div>
  );
}
