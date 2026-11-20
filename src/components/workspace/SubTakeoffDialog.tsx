'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
  RabValidationError,
  calcSubTakeoffBreakdown,
  calcSubTakeoffItemVolume,
  type SubTakeoffFormula,
  type SubTakeoffItemInput,
} from '@/lib/rab/calc';
import { formatIdDecimal } from '@/lib/rab/format';
import type { ComputedTakeoffRow } from '@/lib/rab/workspace-calc';

function createEmptyItem(op: 'ADD' | 'DEDUCT' = 'ADD'): SubTakeoffItemInput {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: op === 'ADD' ? 'Segmen / Ruangan Baru' : 'Bukaan Pintu / Jendela',
    op,
    formula: 'RECT',
    length: '1',
    width: null,
    height: null,
    count: '1',
    topWidth: '0.30',
    bottomWidth: '0.70',
    span: '6.00',
    rise: '2.00',
    diameterMm: '12',
  };
}

function parseInitialItems(row: ComputedTakeoffRow): SubTakeoffItemInput[] {
  if (row.subItemsJson) {
    try {
      const parsed = JSON.parse(row.subItemsJson) as SubTakeoffItemInput[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Fallback below
    }
  }
  const items: SubTakeoffItemInput[] = [
    {
      id: 'init-add',
      label: 'Segmen Utama',
      op: 'ADD',
      formula: 'RECT',
      length: row.length,
      width: row.width,
      height: row.height,
      count: row.count,
      topWidth: '0.30',
      bottomWidth: '0.70',
      span: '6.00',
      rise: '2.00',
      diameterMm: '12',
    },
  ];
  if (row.deductionVolume && Number(row.deductionVolume) > 0) {
    items.push({
      id: 'init-ded',
      label: 'Pengurang Awal',
      op: 'DEDUCT',
      formula: 'RECT',
      length: row.deductionVolume,
      width: null,
      height: null,
      count: null,
      topWidth: '0.30',
      bottomWidth: '0.70',
      span: '6.00',
      rise: '2.00',
      diameterMm: '12',
    });
  }
  return items;
}

export function SubTakeoffDialog({
  row,
  open,
  disabled,
  onOpenChange,
  onSave,
}: {
  row: ComputedTakeoffRow | null;
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (subItemsJson: string | null) => Promise<void>;
}) {
  const [items, setItems] = useState<SubTakeoffItemInput[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row && open) {
      setItems(parseInitialItems(row));
    }
  }, [row, open]);

  const preview = useMemo(() => {
    try {
      const res = calcSubTakeoffBreakdown(items);
      return { ok: true as const, data: res };
    } catch (err) {
      return {
        ok: false as const,
        error:
          err instanceof RabValidationError
            ? err.message
            : 'Periksa kembali input angka sub-takeoff.',
      };
    }
  }, [items]);

  const updateItem = (id: string, patch: Partial<SubTakeoffItemInput>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kalkulator Rincian Sub-Takeoff</DialogTitle>
          <DialogDescription>
            Rincian volume multi-ruangan, bukaan pintu/jendela, pondasi
            trapesium, atap miring, dan pembesian untuk:{' '}
            <strong>{row.description}</strong> ({row.ahspUnit})
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          {!disabled && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setItems((prev) => [...prev, createEmptyItem('ADD')])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah Segmen (+)
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setItems((prev) => [...prev, createEmptyItem('DEDUCT')])
                }
              >
                <Plus className="h-3.5 w-3.5 text-red-700" />
                Tambah Bukaan / Pengurang (-)
              </Button>
            </div>
          )}

          <div className="space-y-2">
            {items.map((item) => {
              let itemVol = 'ERR';
              try {
                itemVol = formatIdDecimal(
                  calcSubTakeoffItemVolume(item).toString(),
                  4
                );
              } catch {
                itemVol = 'ERR';
              }

              return (
                <div
                  key={item.id}
                  className="space-y-2 border border-gridBorder bg-subtle/40 p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={item.op}
                      disabled={disabled}
                      onChange={(e) =>
                        updateItem(item.id, {
                          op: e.target.value as 'ADD' | 'DEDUCT',
                        })
                      }
                      className="h-8 border border-gridBorder bg-white px-2 font-mono text-xs font-semibold"
                    >
                      <option value="ADD">+ TAMBAH</option>
                      <option value="DEDUCT">- KURANGI</option>
                    </select>

                    <select
                      value={item.formula}
                      disabled={disabled}
                      onChange={(e) =>
                        updateItem(item.id, {
                          formula: e.target.value as SubTakeoffFormula,
                        })
                      }
                      className="h-8 border border-gridBorder bg-white px-2 text-xs"
                    >
                      <option value="RECT">Persegi / Ruangan (P x L x T x Jml)</option>
                      <option value="TRAPEZOID">Trapesium Pondasi / Galian</option>
                      <option value="GABLE_ROOF">Atap Miring (Bentang &amp; Tinggi)</option>
                      <option value="REBAR_KG">Besi Tulangan (mm &rarr; kg)</option>
                    </select>

                    <Input
                      value={item.label}
                      disabled={disabled}
                      placeholder="Label ruangan / as"
                      onChange={(e) =>
                        updateItem(item.id, { label: e.target.value })
                      }
                      className="h-8 flex-1 min-w-[160px] text-xs"
                    />

                    <div className="ml-auto flex items-center gap-2">
                      <span className="font-mono font-semibold tabular-nums">
                        {item.op === 'DEDUCT' ? '-' : '+'} {itemVol}
                      </span>
                      {!disabled && items.length > 1 && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            setItems((prev) =>
                              prev.filter((x) => x.id !== item.id)
                            )
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-700" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Formula-specific inputs */}
                  {item.formula === 'RECT' && (
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="text-[11px] text-slateInk">P</label>
                        <Input
                          value={item.length ?? ''}
                          disabled={disabled}
                          placeholder="null"
                          onChange={(e) =>
                            updateItem(item.id, {
                              length: e.target.value === '' ? null : e.target.value,
                            })
                          }
                          className="h-7 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slateInk">L</label>
                        <Input
                          value={item.width ?? ''}
                          disabled={disabled}
                          placeholder="null"
                          onChange={(e) =>
                            updateItem(item.id, {
                              width: e.target.value === '' ? null : e.target.value,
                            })
                          }
                          className="h-7 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slateInk">T</label>
                        <Input
                          value={item.height ?? ''}
                          disabled={disabled}
                          placeholder="null"
                          onChange={(e) =>
                            updateItem(item.id, {
                              height: e.target.value === '' ? null : e.target.value,
                            })
                          }
                          className="h-7 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slateInk">Jumlah</label>
                        <Input
                          value={item.count ?? ''}
                          disabled={disabled}
                          placeholder="null"
                          onChange={(e) =>
                            updateItem(item.id, {
                              count: e.target.value === '' ? null : e.target.value,
                            })
                          }
                          className="h-7 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {item.formula === 'TRAPEZOID' && (
                    <div className="grid grid-cols-5 gap-2">
                      <div>
                        <label className="text-[11px] text-slateInk">Lebar Atas</label>
                        <Input
                          value={item.topWidth ?? ''}
                          disabled={disabled}
                          onChange={(e) =>
                            updateItem(item.id, { topWidth: e.target.value })
                          }
                          className="h-7 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slateInk">Lebar Bawah</label>
                        <Input
                          value={item.bottomWidth ?? ''}
                          disabled={disabled}
                          onChange={(e) =>
                            updateItem(item.id, { bottomWidth: e.target.value })
                          }
                          className="h-7 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slateInk">Tinggi</label>
                        <Input
                          value={item.height ?? ''}
                          disabled={disabled}
                          onChange={(e) =>
                            updateItem(item.id, { height: e.target.value })
                          }
                          className="h-7 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slateInk">Panjang</label>
                        <Input
                          value={item.length ?? ''}
                          disabled={disabled}
                          onChange={(e) =>
                            updateItem(item.id, { length: e.target.value })
                          }
                          className="h-7 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slateInk">Jumlah</label>
                        <Input
                          value={item.count ?? ''}
                          disabled={disabled}
                          onChange={(e) =>
                            updateItem(item.id, {
                              count: e.target.value === '' ? null : e.target.value,
                            })
                          }
                          className="h-7 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {item.formula === 'GABLE_ROOF' && (
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="text-[11px] text-slateInk">Panjang Atap (m)</label>
                        <Input
                          value={item.length ?? ''}
                          disabled={disabled}
                          onChange={(e) =>
                            updateItem(item.id, { length: e.target.value })
                          }
                          className="h-7 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slateInk">Bentang Datar (m)</label>
                        <Input
                          value={item.span ?? ''}
                          disabled={disabled}
                          onChange={(e) =>
                            updateItem(item.id, { span: e.target.value })
                          }
                          className="h-7 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slateInk">Tinggi Puncak (m)</label>
                        <Input
                          value={item.rise ?? ''}
                          disabled={disabled}
                          onChange={(e) =>
                            updateItem(item.id, { rise: e.target.value })
                          }
                          className="h-7 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slateInk">Jumlah</label>
                        <Input
                          value={item.count ?? ''}
                          disabled={disabled}
                          onChange={(e) =>
                            updateItem(item.id, {
                              count: e.target.value === '' ? null : e.target.value,
                            })
                          }
                          className="h-7 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {item.formula === 'REBAR_KG' && (
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[11px] text-slateInk">Diameter Besi (mm)</label>
                        <Input
                          value={item.diameterMm ?? ''}
                          disabled={disabled}
                          onChange={(e) =>
                            updateItem(item.id, { diameterMm: e.target.value })
                          }
                          className="h-7 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slateInk">Panjang (m)</label>
                        <Input
                          value={item.length ?? ''}
                          disabled={disabled}
                          onChange={(e) =>
                            updateItem(item.id, { length: e.target.value })
                          }
                          className="h-7 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slateInk">Jumlah Batang</label>
                        <Input
                          value={item.count ?? ''}
                          disabled={disabled}
                          onChange={(e) =>
                            updateItem(item.id, {
                              count: e.target.value === '' ? null : e.target.value,
                            })
                          }
                          className="h-7 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border border-gridBorder bg-white p-3 text-xs">
            {preview.ok ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-slateInk">Total Tambah: </span>
                  <strong className="font-mono tabular-nums">
                    {formatIdDecimal(preview.data.totalAdd, 4)}
                  </strong>
                  <span className="mx-2 text-slateInk">|</span>
                  <span className="text-slateInk">Total Pengurang: </span>
                  <strong className="font-mono tabular-nums text-red-700">
                    {formatIdDecimal(preview.data.totalDeduct, 4)}
                  </strong>
                </div>
                <div>
                  <span className="text-slateInk">Volume Bersih: </span>
                  <strong className="font-mono text-sm tabular-nums text-ink">
                    {formatIdDecimal(preview.data.netVolume, 4)} {row.ahspUnit}
                  </strong>
                </div>
              </div>
            ) : (
              <p className="font-medium text-red-700">{preview.error}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            {!disabled && row.subItemsJson && (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  await onSave(null);
                  setSaving(false);
                  onOpenChange(false);
                }}
              >
                Reset ke Input Grid Biasa
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Tutup
            </Button>
            {!disabled && (
              <Button
                type="button"
                disabled={!preview.ok || saving}
                onClick={async () => {
                  if (!preview.ok) return;
                  setSaving(true);
                  await onSave(JSON.stringify(items));
                  setSaving(false);
                  onOpenChange(false);
                }}
              >
                Simpan Rincian Volume
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
