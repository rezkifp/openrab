'use client';

import { useEffect, useState } from 'react';
import { Calendar, Save, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatIdDecimal, formatRupiah } from '@/lib/rab/format';
import type {
  ComputedWorkspaceState,
  WorkspaceProject,
} from '@/lib/rab/workspace-calc';

interface LocalScheduleDraft {
  startWeek: string;
  durationWeeks: string;
}

export function RecapAndSCurvePanel({
  project,
  computed,
  isLocked,
  isPending,
  onUpdateSchedule,
}: {
  project: WorkspaceProject;
  computed: ComputedWorkspaceState;
  isLocked: boolean;
  isPending: boolean;
  onUpdateSchedule: (
    wbsId: string,
    startWeek: number,
    durationWeeks: number
  ) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, LocalScheduleDraft>>({});

  useEffect(() => {
    const next: Record<string, LocalScheduleDraft> = {};
    for (const r of computed.recapRows) {
      next[r.wbsId] = {
        startWeek: String(r.startWeek),
        durationWeeks: String(r.durationWeeks),
      };
    }
    setDrafts(next);
  }, [computed.recapRows]);

  if (computed.totals === null || computed.recapRows.length === 0) {
    return (
      <div className="border border-gridBorder bg-white p-6 text-sm text-slateInk">
        Rekapitulasi dan Kurva S belum tersedia karena proyek belum memiliki
        item valid atau terdapat error harga efektif.
      </div>
    );
  }

  const sCurve = computed.sCurve;
  const maxWeeklyWeight = sCurve
    ? Math.max(
        1,
        ...sCurve.weeks.map((w) => Number(w.weeklyWeight) || 0)
      )
    : 1;

  // SVG chart coordinate system
  const svgW = 860;
  const svgH = 220;
  const padL = 44;
  const padR = 20;
  const padT = 18;
  const padB = 30;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const commitSchedule = (wbsId: string) => {
    if (isLocked) return;
    const d = drafts[wbsId];
    if (!d) return;
    const sw = Math.max(1, Math.min(104, Math.trunc(Number(d.startWeek) || 1)));
    const dur = Math.max(
      1,
      Math.min(104, Math.trunc(Number(d.durationWeeks) || 1))
    );
    onUpdateSchedule(wbsId, sw, dur);
  };

  return (
    <div className="space-y-6">
      {/* SECTION A: REKAPITULASI DIVISI WBS & BOBOT (%) */}
      <div className="border border-gridBorder bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gridBorder pb-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">
              Rekapitulasi Divisi Pekerjaan &amp; Bobot (%)
            </h2>
            <p className="text-xs text-slateInk">
              Ringkasan biaya per divisi WBS beserta bobot persentase terhadap
              total pekerjaan dan alokasi harga OHP versi Owner Estimate.
            </p>
          </div>
          <span className="font-mono text-xs text-slateInk">
            {computed.recapRows.length} divisi
          </span>
        </div>

        <div className="mt-4 overflow-x-auto border border-gridBorder">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="border-b border-gridBorder bg-subtle font-mono text-[11px] uppercase text-slateInk">
              <tr>
                <th className="px-3 py-2.5">No</th>
                <th className="px-3 py-2.5">Divisi Pekerjaan (WBS)</th>
                <th className="px-3 py-2.5 text-right">Subtotal Base (Rp)</th>
                <th className="px-3 py-2.5 text-right">
                  Harga + OHP {project.overheadProfitMargin}% (Rp)
                </th>
                <th className="px-3 py-2.5 text-right">Bobot (%)</th>
                <th className="w-44 px-3 py-2.5">Proporsi Visual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gridBorder">
              {computed.recapRows.map((r) => {
                const pctNum = Math.min(
                  100,
                  Math.max(0, Number(r.weightPercent) || 0)
                );
                return (
                  <tr key={r.wbsId} className="hover:bg-subtle/40">
                    <td className="px-3 py-2.5 font-mono font-semibold text-slateInk">
                      {r.code}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-ink">
                      {r.name}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatRupiah(r.subtotal, 2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatRupiah(r.clientSubtotalWithOhp, 2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">
                      {formatIdDecimal(r.weightPercent, 2)}%
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="h-2.5 w-full border border-gridBorder bg-subtle">
                        <div
                          className="h-full bg-amber-700"
                          style={{ width: `${pctNum}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-gridBorder bg-subtle/50 font-mono text-xs">
              <tr>
                <td colSpan={2} className="px-3 py-2 font-semibold text-ink">
                  Subtotal Konstruksi / DPP
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {formatRupiah(computed.totals.subtotal, 2)}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {formatRupiah(computed.totals.dpp, 2)}
                </td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">
                  100,00%
                </td>
                <td />
              </tr>
              <tr>
                <td colSpan={3} className="px-3 py-1.5 text-right text-slateInk">
                  PPN ({project.taxRatePpn}%)
                </td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                  {formatRupiah(computed.totals.ppn, 2)}
                </td>
                <td colSpan={2} />
              </tr>
              <tr className="bg-subtle">
                <td
                  colSpan={3}
                  className="px-3 py-2.5 text-right font-bold uppercase text-ink"
                >
                  Grand Total
                </td>
                <td className="px-3 py-2.5 text-right text-sm font-bold tabular-nums text-ink">
                  {formatRupiah(computed.totals.grandTotal, 2)}
                </td>
                <td colSpan={2} className="px-3 py-2.5 font-sans text-[11px] text-slateInk">
                  {computed.costPerM2 && project.buildingAreaM2
                    ? `${formatRupiah(computed.costPerM2, 2)} / m2`
                    : ''}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* SECTION B: JADWAL PELAKSANAAN & KURVA S OTOMATIS */}
      {sCurve && (
        <div className="border border-gridBorder bg-white p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gridBorder pb-3">
            <div>
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <TrendingUp className="h-5 w-5 text-amber-700" />
                Jadwal Pelaksanaan &amp; Kurva S Rencana (S-Curve)
              </h2>
              <p className="text-xs text-slateInk">
                Atur minggu mulai dan durasi setiap divisi WBS — Kurva S bobot
                mingguan dan rencana arus kas dihitung otomatis.
              </p>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs text-slateInk">
              <Calendar className="h-4 w-4" />
              Total Durasi: <strong className="text-ink">{sCurve.totalWeeks} Minggu</strong>
            </div>
          </div>

          {/* SVG S-Curve Visualization */}
          {sCurve.weeks.length > 0 && (
            <div className="border border-gridBorder bg-paper p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slateInk">
                <span className="font-mono uppercase">
                  Grafik Kurva S Kumulatif (0% — 100%)
                </span>
                <div className="flex items-center gap-4 font-mono">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 bg-gridBorder border border-slateInk/40" />
                    Bobot Mingguan (%)
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-amber-800 font-semibold">
                    <span className="inline-block h-0.5 w-4 bg-amber-700" />
                    Kumulatif Kurva S (%)
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <svg
                  viewBox={`0 0 ${svgW} ${svgH}`}
                  className="h-56 w-full min-w-[600px]"
                  role="img"
                  aria-label="Grafik Kurva S Rencana Pelaksanaan Proyek"
                >
                  {/* Horizontal percentage gridlines */}
                  {[0, 25, 50, 75, 100].map((pct) => {
                    const y = padT + plotH - (pct / 100) * plotH;
                    return (
                      <g key={pct}>
                        <line
                          x1={padL}
                          y1={y}
                          x2={svgW - padR}
                          y2={y}
                          stroke="#DDD9D0"
                          strokeDasharray={pct === 0 ? undefined : '4 4'}
                          strokeWidth={1}
                        />
                        <text
                          x={padL - 6}
                          y={y + 3.5}
                          textAnchor="end"
                          className="fill-slate-500 font-mono text-[10px]"
                        >
                          {pct}%
                        </text>
                      </g>
                    );
                  })}

                  {/* Weekly bars */}
                  {sCurve.weeks.map((pt, i) => {
                    const n = sCurve.weeks.length;
                    const stepW = plotW / Math.max(1, n);
                    const barW = Math.max(4, Math.min(28, stepW * 0.52));
                    const cx = padL + (i + 0.5) * stepW;
                    const wkPct = Number(pt.weeklyWeight) || 0;
                    const barH = (wkPct / Math.max(maxWeeklyWeight * 1.15, 25)) * plotH;
                    const barY = padT + plotH - barH;
                    return (
                      <g key={pt.week}>
                        <rect
                          x={cx - barW / 2}
                          y={barY}
                          width={barW}
                          height={Math.max(0, barH)}
                          fill="#E2DDD2"
                        />
                        {(n <= 20 || i % Math.ceil(n / 16) === 0 || i === n - 1) && (
                          <text
                            x={cx}
                            y={svgH - 8}
                            textAnchor="middle"
                            className="fill-slate-600 font-mono text-[10px]"
                          >
                            M{pt.week}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Cumulative S-Curve polygon area + polyline */}
                  {(() => {
                    const n = sCurve.weeks.length;
                    const stepW = plotW / Math.max(1, n);
                    const startPt = `${padL},${padT + plotH}`;
                    const pts = sCurve.weeks.map((pt, i) => {
                      const x = padL + (i + 1) * stepW;
                      const cumPct = Math.min(
                        100,
                        Math.max(0, Number(pt.cumulativeWeight) || 0)
                      );
                      const y = padT + plotH - (cumPct / 100) * plotH;
                      return { x, y, pt };
                    });
                    const polyPoints = [
                      startPt,
                      ...pts.map((p) => `${p.x},${p.y}`),
                    ].join(' ');
                    const areaPoints = [
                      startPt,
                      ...pts.map((p) => `${p.x},${p.y}`),
                      `${padL + plotW},${padT + plotH}`,
                    ].join(' ');

                    return (
                      <>
                        <polygon
                          points={areaPoints}
                          fill="#B45309"
                          fillOpacity={0.1}
                        />
                        <polyline
                          fill="none"
                          stroke="#B45309"
                          strokeWidth={2.5}
                          points={polyPoints}
                        />
                        {pts.map((p) => (
                          <g key={p.pt.week}>
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={3.5}
                              fill="#FFFFFF"
                              stroke="#B45309"
                              strokeWidth={2}
                            >
                              <title>
                                {`Minggu ${p.pt.week}: +${formatIdDecimal(
                                  p.pt.weeklyWeight,
                                  2
                                )}% | Kumulatif ${formatIdDecimal(
                                  p.pt.cumulativeWeight,
                                  2
                                )}% (${formatRupiah(p.pt.cumulativeCost, 0)})`}
                              </title>
                            </circle>
                          </g>
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>
          )}

          {/* Weekly Matrix Table + Inline Start Week / Duration Controls */}
          <div className="overflow-x-auto border border-gridBorder">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="border-b border-gridBorder bg-subtle font-mono text-[11px] uppercase text-slateInk">
                <tr>
                  <th className="sticky left-0 z-10 bg-subtle px-2.5 py-2">
                    No
                  </th>
                  <th className="min-w-[200px] px-2.5 py-2">Divisi WBS</th>
                  <th className="px-2 py-2 text-center">Mgg Mulai</th>
                  <th className="px-2 py-2 text-center">Durasi</th>
                  {!isLocked && <th className="px-1.5 py-2" />}
                  <th className="px-2.5 py-2 text-right">Bobot</th>
                  {sCurve.weeks.map((w) => (
                    <th
                      key={w.week}
                      className="min-w-[52px] border-l border-gridBorder/60 px-1.5 py-2 text-center"
                    >
                      M{w.week}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gridBorder">
                {sCurve.rows.map((row, idx) => {
                  const rec = computed.recapRows[idx];
                  const d = drafts[row.wbsId] ?? {
                    startWeek: String(row.startWeek),
                    durationWeeks: String(row.durationWeeks),
                  };
                  return (
                    <tr key={row.wbsId} className="hover:bg-subtle/30">
                      <td className="sticky left-0 bg-white px-2.5 py-2 font-mono font-semibold text-slateInk">
                        {rec?.code ?? idx + 1}
                      </td>
                      <td className="px-2.5 py-2 font-medium text-ink">
                        {row.wbsName}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <Input
                          type="number"
                          min={1}
                          max={104}
                          disabled={isLocked || isPending}
                          value={d.startWeek}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [row.wbsId]: {
                                ...d,
                                startWeek: e.target.value,
                              },
                            }))
                          }
                          onBlur={() => commitSchedule(row.wbsId)}
                          className="h-7 w-14 px-1.5 text-center font-mono text-xs"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <Input
                          type="number"
                          min={1}
                          max={104}
                          disabled={isLocked || isPending}
                          value={d.durationWeeks}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [row.wbsId]: {
                                ...d,
                                durationWeeks: e.target.value,
                              },
                            }))
                          }
                          onBlur={() => commitSchedule(row.wbsId)}
                          className="h-7 w-14 px-1.5 text-center font-mono text-xs"
                        />
                      </td>
                      {!isLocked && (
                        <td className="px-1 py-1.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={isPending}
                            title="Simpan jadwal divisi"
                            onClick={() => commitSchedule(row.wbsId)}
                            className="h-7 w-7"
                          >
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      )}
                      <td className="px-2.5 py-2 text-right font-mono font-semibold tabular-nums">
                        {formatIdDecimal(row.weightPercent, 2)}%
                      </td>
                      {sCurve.weeks.map((w) => {
                        const wkWeight = row.weeklyWeights[w.week];
                        return (
                          <td
                            key={w.week}
                            className={`border-l border-gridBorder/60 px-1.5 py-2 text-right font-mono text-[11px] tabular-nums ${
                              wkWeight
                                ? 'bg-amber-100/70 font-semibold text-ink'
                                : 'text-slate-300'
                            }`}
                          >
                            {wkWeight ? formatIdDecimal(wkWeight, 2) : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-gridBorder bg-subtle/60 font-mono text-[11px]">
                <tr>
                  <td
                    colSpan={isLocked ? 4 : 5}
                    className="px-2.5 py-2 font-semibold text-ink"
                  >
                    Bobot Mingguan (%)
                  </td>
                  <td className="px-2.5 py-2 text-right font-bold">100,00%</td>
                  {sCurve.weeks.map((w) => (
                    <td
                      key={w.week}
                      className="border-l border-gridBorder/60 px-1.5 py-2 text-right font-semibold tabular-nums"
                    >
                      {formatIdDecimal(w.weeklyWeight, 2)}
                    </td>
                  ))}
                </tr>
                <tr className="bg-amber-50/70">
                  <td
                    colSpan={isLocked ? 4 : 5}
                    className="px-2.5 py-2 font-bold text-amber-900"
                  >
                    Kumulatif Kurva S (%)
                  </td>
                  <td className="px-2.5 py-2 text-right font-bold text-amber-900">
                    -
                  </td>
                  {sCurve.weeks.map((w) => (
                    <td
                      key={w.week}
                      className="border-l border-gridBorder/60 px-1.5 py-2 text-right font-bold tabular-nums text-amber-900"
                    >
                      {formatIdDecimal(w.cumulativeWeight, 2)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td
                    colSpan={isLocked ? 4 : 5}
                    className="px-2.5 py-2 text-slateInk"
                  >
                    Arus Kas Mingguan (Base Rp)
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-slateInk">
                    {formatRupiah(computed.totals.subtotal, 0)}
                  </td>
                  {sCurve.weeks.map((w) => (
                    <td
                      key={w.week}
                      className="border-l border-gridBorder/60 px-1.5 py-2 text-right tabular-nums text-slateInk"
                    >
                      {formatIdDecimal(w.weeklyCost, 0)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td
                    colSpan={isLocked ? 4 : 5}
                    className="px-2.5 py-2 font-semibold text-ink"
                  >
                    Arus Kas Kumulatif (Base Rp)
                  </td>
                  <td className="px-2.5 py-2 text-right font-semibold tabular-nums">
                    -
                  </td>
                  {sCurve.weeks.map((w) => (
                    <td
                      key={w.week}
                      className="border-l border-gridBorder/60 px-1.5 py-2 text-right font-semibold tabular-nums"
                    >
                      {formatIdDecimal(w.cumulativeCost, 0)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
