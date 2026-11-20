import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import {
  getProjectComparisonData,
  getProjectWorkspace,
} from '@/app/actions/project';
import { calcHsp, type VariationStatus } from '@/lib/rab/calc';
import { pickEffectivePrice } from '@/lib/rab/pricing';
import { buildWbsPathMap } from '@/lib/rab/workspace-calc';

export const runtime = 'nodejs';

type ExportMode = 'internal' | 'client' | 'boq' | 'baptk';

const VARIATION_LABELS: Record<VariationStatus, string> = {
  ADDED: 'TAMBAH BARU',
  REMOVED: 'DIHAPUS / KURANG',
  MODIFIED_VOLUME: 'UBAH VOLUME',
  MODIFIED_SPEC: 'UBAH SPEK AHSP',
  MODIFIED_BOTH: 'UBAH VOL & SPEK',
  UNCHANGED: 'TETAP',
};

function safeFileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'openrab'
  );
}

function appendRecapAndSCurveSheet(
  workbook: ExcelJS.Workbook,
  workspace: NonNullable<Awaited<ReturnType<typeof getProjectWorkspace>>>
) {
  const { project, computed } = workspace;
  const sheet = workbook.addWorksheet('Rekap & Kurva S');

  sheet.addRow(['REKAPITULASI DIVISI WBS & JADWAL KURVA S — OpenRAB']).font = {
    bold: true,
    size: 13,
  };
  sheet.addRow(['Nama Proyek', project.name]);
  sheet.addRow(['Status', project.status]);
  sheet.addRow([]);

  const recapHdr = sheet.addRow([
    'No',
    'Divisi Pekerjaan (WBS)',
    'Minggu Mulai',
    'Durasi (Mgg)',
    'Subtotal Base (Rp)',
    `Harga + OHP ${project.overheadProfitMargin}% (Rp)`,
    'Bobot (%)',
  ]);
  recapHdr.font = { bold: true };
  recapHdr.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1EFEA' },
    };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  for (const r of computed.recapRows) {
    const row = sheet.addRow([
      r.code,
      r.name,
      r.startWeek,
      r.durationWeeks,
      Number(r.subtotal),
      Number(r.clientSubtotalWithOhp),
      Number(r.weightPercent),
    ]);
    row.getCell(5).numFmt = '#,##0.00';
    row.getCell(6).numFmt = '#,##0.00';
    row.getCell(7).numFmt = '0.00"%"';
  }

  if (computed.totals) {
    const totalRow = sheet.addRow([
      '',
      'TOTAL SUBTOTAL / DPP',
      '',
      '',
      Number(computed.totals.subtotal),
      Number(computed.totals.dpp),
      100,
    ]);
    totalRow.font = { bold: true };
    totalRow.getCell(5).numFmt = '#,##0.00';
    totalRow.getCell(6).numFmt = '#,##0.00';
    totalRow.getCell(7).numFmt = '0.00"%"';
  }

  if (computed.sCurve && computed.sCurve.weeks.length > 0) {
    sheet.addRow([]);
    sheet.addRow(['MATRIKS JADWAL PELAKSANAAN & KURVA S RENCANA (%)']).font = {
      bold: true,
      size: 11,
    };

    const weekCols = computed.sCurve.weeks.map((w) => `M${w.week}`);
    const sHdr = sheet.addRow([
      'No',
      'Divisi WBS',
      'Bobot (%)',
      ...weekCols,
    ]);
    sHdr.font = { bold: true };
    sHdr.eachCell((c) => {
      c.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1EFEA' },
      };
      c.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    computed.sCurve.rows.forEach((r, idx) => {
      const cells = computed.sCurve!.weeks.map((w) => {
        const val = r.weeklyWeights[w.week];
        return val ? Number(val) : null;
      });
      const row = sheet.addRow([
        computed.recapRows[idx]?.code ?? `${idx + 1}`,
        r.wbsName,
        Number(r.weightPercent),
        ...cells,
      ]);
      row.getCell(3).numFmt = '0.00';
      for (let c = 4; c < 4 + weekCols.length; c += 1) {
        const cell = row.getCell(c);
        cell.numFmt = '0.00';
        if (cell.value !== null) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF1EFEA' },
          };
        }
      }
    });

    const wkRow = sheet.addRow([
      '',
      'Bobot Mingguan (%)',
      100,
      ...computed.sCurve.weeks.map((w) => Number(w.weeklyWeight)),
    ]);
    wkRow.font = { bold: true };
    for (let c = 3; c < 4 + weekCols.length; c += 1) {
      wkRow.getCell(c).numFmt = '0.00';
    }

    const cumRow = sheet.addRow([
      '',
      'Kumulatif Kurva S (%)',
      '',
      ...computed.sCurve.weeks.map((w) => Number(w.cumulativeWeight)),
    ]);
    cumRow.font = { bold: true };
    for (let c = 4; c < 4 + weekCols.length; c += 1) {
      cumRow.getCell(c).numFmt = '0.00';
    }

    const costWkRow = sheet.addRow([
      '',
      'Arus Kas Mingguan (Rp)',
      '',
      ...computed.sCurve.weeks.map((w) => Number(w.weeklyCost)),
    ]);
    for (let c = 4; c < 4 + weekCols.length; c += 1) {
      costWkRow.getCell(c).numFmt = '#,##0.00';
    }

    const costCumRow = sheet.addRow([
      '',
      'Arus Kas Kumulatif (Rp)',
      '',
      ...computed.sCurve.weeks.map((w) => Number(w.cumulativeCost)),
    ]);
    costCumRow.font = { bold: true };
    for (let c = 4; c < 4 + weekCols.length; c += 1) {
      costCumRow.getCell(c).numFmt = '#,##0.00';
    }
  }

  sheet.getColumn(1).width = 8;
  sheet.getColumn(2).width = 36;
  sheet.getColumn(3).width = 14;
  sheet.getColumn(4).width = 14;
  sheet.getColumn(5).width = 20;
  sheet.getColumn(6).width = 24;
  sheet.getColumn(7).width = 14;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const url = new URL(req.url);
  const rawMode = url.searchParams.get('mode') ?? 'internal';
  const mode: ExportMode =
    rawMode === 'client' || rawMode === 'boq' || rawMode === 'baptk'
      ? rawMode
      : 'internal';
  const baseIdParam = url.searchParams.get('baseId');

  const workspace = await getProjectWorkspace(id);
  if (!workspace) {
    return NextResponse.json(
      { error: 'Proyek tidak ditemukan.' },
      { status: 404 }
    );
  }

  const {
    project,
    wbsList,
    ahsps,
    compositions,
    prices,
    snapshots,
    computed,
    hasDummy,
  } = workspace;

  if (computed.priceErrors.length > 0 || computed.totals === null) {
    return NextResponse.json(
      {
        error:
          computed.priceErrors[0] ??
          'Proyek memiliki error validasi atau harga efektif belum lengkap sehingga tidak dapat diexport.',
      },
      { status: 400 }
    );
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OpenRAB';
  workbook.created = new Date();

  const exportDateIso = new Date().toISOString().slice(0, 10);
  const effectiveRegionName =
    project.status === 'FINALIZED' && project.regionNameFrozen
      ? project.regionNameFrozen
      : project.regionName;

  const wbsPathMap = buildWbsPathMap(wbsList);
  const snapPathByTakeoff = new Map(
    snapshots.map((s) => [s.takeoffId, s.wbsPath])
  );

  const rowsByPath = new Map<string, typeof computed.rows>();
  for (const row of computed.rows) {
    const path =
      project.status === 'FINALIZED'
        ? snapPathByTakeoff.get(row.id) ?? wbsPathMap.get(row.wbsId) ?? 'WBS'
        : wbsPathMap.get(row.wbsId) ?? 'WBS';
    const arr = rowsByPath.get(path);
    if (arr) arr.push(row);
    else rowsByPath.set(path, [row]);
  }

  // =========================================================================
  // MODE BAPTK (ADDENDUM / CCO)
  // =========================================================================
  if (mode === 'baptk') {
    const effectiveBaseId = baseIdParam || project.sourceProjectId;
    if (!effectiveBaseId) {
      return NextResponse.json(
        {
          error:
            'Pilih proyek pembanding (Kontrak Awal / Opsi A) terlebih dahulu untuk export BAPTK.',
        },
        { status: 400 }
      );
    }

    const cmpRes = await getProjectComparisonData(effectiveBaseId, id);
    if (!cmpRes.ok) {
      return NextResponse.json({ error: cmpRes.error }, { status: 400 });
    }
    const cmp = cmpRes.data;

    const sheet = workbook.addWorksheet('BAPTK (Addendum)');
    sheet.columns = [
      { width: 6 },
      { width: 26 },
      { width: 34 },
      { width: 8 },
      { width: 18 },
      { width: 14 },
      { width: 14 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 16 },
      { width: 16 },
      { width: 18 },
      { width: 18 },
      { width: 20 },
    ];

    sheet.addRow([
      'BERITA ACARA PEKERJAAN TAMBAH KURANG (ADDENDUM / CCO) — OpenRAB',
    ]).font = { bold: true, size: 13 };
    sheet.addRow([
      'Kontrak Awal (Opsi A)',
      `${cmp.baseProject.name} (${cmp.baseProject.status})`,
    ]);
    sheet.addRow([
      'Addendum / Revisi (Opsi B)',
      `${cmp.revisedProject.name} (${cmp.revisedProject.status})`,
    ]);
    if (project.clientName) sheet.addRow(['Klien / Owner', project.clientName]);
    if (project.projectLocation)
      sheet.addRow(['Lokasi Proyek', project.projectLocation]);
    if (project.architectName)
      sheet.addRow(['Arsitek / Studio', project.architectName]);
    sheet.addRow(['Tanggal Export', exportDateIso]);
    sheet.addRow([]);

    const summaryPairs: Array<[string, number]> = [
      ['Nilai Kontrak Awal (Grand Total)', Number(cmp.baseGrandTotal)],
      ['Total Pekerjaan Tambah (Base)', Number(cmp.totalAddition)],
      ['Total Pekerjaan Kurang (Base)', Number(cmp.totalDeduction)],
      ['Selisih Netto Subtotal (Base)', Number(cmp.netDeltaSubtotal)],
      [
        `Selisih Netto Grand Total (${cmp.deltaPercent}%)`,
        Number(cmp.netDeltaGrandTotal),
      ],
      ['Nilai Kontrak Addendum (Grand Total)', Number(cmp.revisedGrandTotal)],
    ];

    for (const [lbl, val] of summaryPairs) {
      const r = sheet.addRow(['', lbl, val]);
      r.getCell(2).font = { bold: true };
      r.getCell(3).font = { bold: true };
      r.getCell(3).numFmt = '#,##0.00';
    }
    sheet.addRow([]);

    const hdr = sheet.addRow([
      'No',
      'Divisi WBS',
      'Uraian Pekerjaan',
      'Sat',
      'Status Perubahan',
      'AHSP Awal',
      'AHSP Baru',
      'Vol Awal',
      'Vol Baru',
      'Selisih Vol',
      'HSP Awal (Rp)',
      'HSP Baru (Rp)',
      'Total Awal (Rp)',
      'Total Baru (Rp)',
      'Selisih Biaya (Rp)',
    ]);
    hdr.font = { bold: true };
    hdr.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1EFEA' },
      };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    cmp.items.forEach((item, idx) => {
      const row = sheet.addRow([
        idx + 1,
        item.wbsPath,
        item.description,
        item.unit,
        VARIATION_LABELS[item.status],
        item.baseAhspCode ?? '-',
        item.revisedAhspCode ?? '-',
        Number(item.baseVolume),
        Number(item.revisedVolume),
        Number(item.deltaVolume),
        Number(item.baseHsp),
        Number(item.revisedHsp),
        Number(item.baseTotal),
        Number(item.revisedTotal),
        Number(item.deltaTotal),
      ]);
      row.getCell(8).numFmt = '#,##0.0000';
      row.getCell(9).numFmt = '#,##0.0000';
      row.getCell(10).numFmt = '#,##0.0000';
      row.getCell(11).numFmt = '#,##0.000';
      row.getCell(12).numFmt = '#,##0.000';
      row.getCell(13).numFmt = '#,##0.00';
      row.getCell(14).numFmt = '#,##0.00';
      row.getCell(15).numFmt = '#,##0.00';
      row.getCell(15).font = {
        bold: true,
        color: {
          argb:
            Number(item.deltaTotal) > 0
              ? 'FF047857'
              : Number(item.deltaTotal) < 0
              ? 'FFB91C1C'
              : 'FF0F172A',
        },
      };
    });

    sheet.addRow([]);
    sheet.addRow([]);
    sheet.addRow([
      '',
      'Pemilik Proyek (Owner)',
      '',
      'Arsitek / Konsultan MK',
      '',
      '',
      'Kontraktor Pelaksana',
    ]).font = { bold: true };
    sheet.addRow([]);
    sheet.addRow([]);
    sheet.addRow([
      '',
      project.clientName ?? '(____________________)',
      '',
      project.architectName ?? '(____________________)',
      '',
      '',
      '(____________________)',
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${safeFileSlug(project.name)}-baptk.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  // =========================================================================
  // MODE BLANK BoQ (TENDER KONTRAKTOR)
  // =========================================================================
  if (mode === 'boq') {
    const boqSheet = workbook.addWorksheet('Blank BoQ Tender');
    boqSheet.columns = [
      { key: 'no', width: 8 },
      { key: 'desc', width: 48 },
      { key: 'vol', width: 15 },
      { key: 'unit', width: 10 },
      { key: 'hsp', width: 24 },
      { key: 'total', width: 24 },
    ];

    boqSheet.addRow([
      'DOKUMEN TENDER — BILL OF QUANTITIES (BLANK BoQ) — OpenRAB',
    ]).font = { bold: true, size: 13 };
    boqSheet.addRow(['Nama Proyek', project.name]);
    if (project.clientName)
      boqSheet.addRow(['Pemilik Proyek / Owner', project.clientName]);
    if (project.projectLocation)
      boqSheet.addRow(['Lokasi Proyek', project.projectLocation]);
    if (project.architectName)
      boqSheet.addRow(['Konsultan Perencana / Arsitek', project.architectName]);
    if (project.buildingAreaM2) {
      const aRow = boqSheet.addRow([
        'Luas Bangunan (m2)',
        Number(project.buildingAreaM2),
      ]);
      aRow.getCell(2).numFmt = '#,##0.00';
    }
    boqSheet.addRow(['Wilayah Referensi', effectiveRegionName]);
    boqSheet.addRow(['Tanggal Dokumen Tender', exportDateIso]);
    boqSheet.addRow([
      'Petunjuk Kontraktor',
      'Isi kolom Harga Satuan Penawaran (kolom kuning). Jumlah Harga & Total akan terhitung otomatis.',
    ]);
    boqSheet.addRow([]);

    const hdr = boqSheet.addRow([
      'No',
      'Uraian Pekerjaan',
      'Volume',
      'Satuan',
      'Harga Satuan Penawaran (Rp)',
      'Jumlah Harga (Rp)',
    ]);
    hdr.font = { bold: true };
    hdr.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1EFEA' },
      };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    const firstTableRow = hdr.number + 1;
    let secIdx = 0;
    let lastTableRow = hdr.number;

    for (const [wbsPath, items] of rowsByPath.entries()) {
      secIdx += 1;
      const secRow = boqSheet.addRow([`${secIdx}`, wbsPath, '', '', '', '']);
      secRow.font = { bold: true };
      secRow.eachCell((c) => {
        c.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8F7F4' },
        };
      });
      lastTableRow = secRow.number;

      items.forEach((item, idx) => {
        const dataRow = boqSheet.addRow([
          `${secIdx}.${idx + 1}`,
          item.description,
          Number(item.calculatedVolume),
          item.ahspUnit,
          null,
          null,
        ]);
        const rNum = dataRow.number;
        dataRow.getCell(3).numFmt = '#,##0.0000';
        const hspCell = dataRow.getCell(5);
        hspCell.numFmt = '#,##0.00';
        hspCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEFCE8' },
        };
        hspCell.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' },
        };

        const totalCell = dataRow.getCell(6);
        totalCell.value = { formula: `C${rNum}*E${rNum}` };
        totalCell.numFmt = '#,##0.00';
        totalCell.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' },
        };
        lastTableRow = rNum;
      });
    }

    boqSheet.addRow([]);
    const subRow = boqSheet.addRow([
      '',
      '',
      '',
      '',
      'Subtotal Penawaran',
      { formula: `SUM(F${firstTableRow}:F${lastTableRow})` },
    ]);
    subRow.getCell(5).font = { bold: true };
    subRow.getCell(6).font = { bold: true };
    subRow.getCell(6).numFmt = '#,##0.00';

    const ppnRateNum = Number(project.taxRatePpn);
    const ppnRow = boqSheet.addRow([
      '',
      '',
      '',
      '',
      `PPN (${project.taxRatePpn}%)`,
      { formula: `F${subRow.number}*${ppnRateNum}/100` },
    ]);
    ppnRow.getCell(5).font = { bold: true };
    ppnRow.getCell(6).numFmt = '#,##0.00';

    const grandRow = boqSheet.addRow([
      '',
      '',
      '',
      '',
      'Grand Total Penawaran',
      { formula: `F${subRow.number}+F${ppnRow.number}` },
    ]);
    grandRow.getCell(5).font = { bold: true };
    grandRow.getCell(6).font = { bold: true };
    grandRow.getCell(6).numFmt = '#,##0.00';

    boqSheet.addRow([]);
    boqSheet.addRow([]);
    boqSheet.addRow([
      '',
      'Kontraktor Penawar (Cap & Tanda Tangan)',
      '',
      '',
      'Pemberi Tugas / Konsultan',
      '',
    ]).font = { bold: true };
    boqSheet.addRow([]);
    boqSheet.addRow([]);
    boqSheet.addRow([
      '',
      '(____________________)',
      '',
      '',
      project.architectName ?? '(____________________)',
      '',
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${safeFileSlug(project.name)}-blank-boq.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  // =========================================================================
  // MODE CLIENT (OWNER ESTIMATE)
  // =========================================================================
  if (mode === 'client') {
    const recapSheet = workbook.addWorksheet('Rekapitulasi');
    recapSheet.columns = [
      { width: 8 },
      { width: 42 },
      { width: 22 },
      { width: 24 },
      { width: 14 },
    ];

    recapSheet.addRow([
      'OWNER ESTIMATE — REKAPITULASI RENCANA ANGGARAN BIAYA (RAB)',
    ]).font = { bold: true, size: 13 };
    if (hasDummy) {
      recapSheet.addRow([
        'Keterangan',
        'DATA CONTOH (DUMMY) — MEMERLUKAN VALIDASI QS',
      ]).font = { bold: true, color: { argb: 'FF9A3412' } };
    }
    recapSheet.addRow(['Nama Proyek', project.name]);
    if (project.clientName)
      recapSheet.addRow(['Klien / Owner', project.clientName]);
    if (project.projectLocation)
      recapSheet.addRow(['Lokasi Proyek', project.projectLocation]);
    if (project.architectName)
      recapSheet.addRow(['Arsitek / Studio', project.architectName]);
    if (project.buildingAreaM2) {
      const aRow = recapSheet.addRow([
        'Luas Bangunan (m2)',
        Number(project.buildingAreaM2),
      ]);
      aRow.getCell(2).numFmt = '#,##0.00';
    }
    recapSheet.addRow(['Wilayah Referensi', effectiveRegionName]);
    recapSheet.addRow(['Tanggal Harga', project.priceDate]);
    recapSheet.addRow(['Status', project.status]);
    recapSheet.addRow([]);

    const recHdr = recapSheet.addRow([
      'No',
      'Divisi Pekerjaan',
      'Subtotal Pekerjaan (Rp)',
      `Termasuk OHP ${project.overheadProfitMargin}% (Rp)`,
      'Bobot (%)',
    ]);
    recHdr.font = { bold: true };
    recHdr.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1EFEA' },
      };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    for (const r of computed.recapRows) {
      const row = recapSheet.addRow([
        r.code,
        r.name,
        Number(r.subtotal),
        Number(r.clientSubtotalWithOhp),
        Number(r.weightPercent),
      ]);
      row.getCell(3).numFmt = '#,##0.00';
      row.getCell(4).numFmt = '#,##0.00';
      row.getCell(5).numFmt = '0.00"%"';
    }

    recapSheet.addRow([]);
    const clientSummary: Array<[string, string]> = [
      ['Subtotal Pekerjaan', computed.totals.subtotal],
      [`Overhead & Profit (${project.overheadProfitMargin}%)`, computed.totals.ohp],
      ['Dasar Pengenaan Pajak (DPP)', computed.totals.dpp],
      [`PPN (${project.taxRatePpn}%)`, computed.totals.ppn],
      ['GRAND TOTAL', computed.totals.grandTotal],
    ];
    for (const [label, val] of clientSummary) {
      const r = recapSheet.addRow(['', '', label, Number(val), '']);
      r.getCell(3).font = { bold: true };
      r.getCell(4).font = { bold: label === 'GRAND TOTAL' };
      r.getCell(4).numFmt = '#,##0.00';
    }

    if (computed.costPerM2 && project.buildingAreaM2) {
      const m2Row = recapSheet.addRow([
        '',
        '',
        `Biaya per m2 (${project.buildingAreaM2} m2)`,
        Number(computed.costPerM2),
        '',
      ]);
      m2Row.getCell(3).font = { italic: true };
      m2Row.getCell(4).numFmt = '#,##0.00';
    }

    recapSheet.addRow([]);
    recapSheet.addRow([]);
    recapSheet.addRow([
      '',
      'Disiapkan Oleh (Arsitek / Estimator)',
      '',
      'Disetujui Oleh (Klien / Owner)',
      '',
    ]).font = { bold: true };
    recapSheet.addRow([]);
    recapSheet.addRow([]);
    recapSheet.addRow([
      '',
      project.architectName ?? '(____________________)',
      '',
      project.clientName ?? '(____________________)',
      '',
    ]);

    // Sheet 2: Rincian RAB Klien (tanpa kode AHSP internal)
    const detailSheet = workbook.addWorksheet('Rincian RAB Klien');
    detailSheet.columns = [
      { width: 8 },
      { width: 48 },
      { width: 15 },
      { width: 10 },
      { width: 18 },
      { width: 20 },
    ];
    detailSheet.addRow([`RINCIAN PEKERJAAN RAB — ${project.name}`]).font = {
      bold: true,
      size: 12,
    };
    detailSheet.addRow([]);
    const detHdr = detailSheet.addRow([
      'No',
      'Uraian Pekerjaan',
      'Volume',
      'Satuan',
      'Harga Satuan (Rp)',
      'Total Harga (Rp)',
    ]);
    detHdr.font = { bold: true };
    detHdr.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1EFEA' },
      };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    let cSecIdx = 0;
    for (const [wbsPath, items] of rowsByPath.entries()) {
      cSecIdx += 1;
      const secRow = detailSheet.addRow([`${cSecIdx}`, wbsPath, '', '', '', '']);
      secRow.font = { bold: true };
      secRow.eachCell((c) => {
        c.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8F7F4' },
        };
      });

      items.forEach((item, idx) => {
        const dataRow = detailSheet.addRow([
          `${cSecIdx}.${idx + 1}`,
          item.description,
          Number(item.calculatedVolume),
          item.ahspUnit,
          Number(item.hsp ?? '0'),
          Number(item.baseTotal ?? '0'),
        ]);
        dataRow.getCell(3).numFmt = '#,##0.0000';
        dataRow.getCell(5).numFmt = '#,##0.000';
        dataRow.getCell(6).numFmt = '#,##0.00';
      });
    }

    detailSheet.addRow([]);
    for (const [label, val] of clientSummary) {
      const r = detailSheet.addRow(['', '', '', '', label, Number(val)]);
      r.getCell(5).font = { bold: true };
      r.getCell(6).font = { bold: label === 'GRAND TOTAL' };
      r.getCell(6).numFmt = '#,##0.00';
    }

    appendRecapAndSCurveSheet(workbook, workspace);

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${safeFileSlug(project.name)}-client.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  // =========================================================================
  // MODE INTERNAL QS (DEFAULT — RAB + AHSP + BOM + REKAP & KURVA S)
  // =========================================================================
  const rabSheet = workbook.addWorksheet('RAB');
  rabSheet.columns = [
    { key: 'no', width: 8 },
    { key: 'desc', width: 42 },
    { key: 'ahsp', width: 24 },
    { key: 'vol', width: 15 },
    { key: 'unit', width: 10 },
    { key: 'hsp', width: 18 },
    { key: 'total', width: 20 },
  ];

  rabSheet.addRow(['RENCANA ANGGARAN BIAYA (RAB) — OpenRAB']).font = {
    bold: true,
    size: 13,
  };
  if (hasDummy) {
    rabSheet.addRow([
      'Keterangan',
      'DATA CONTOH (DUMMY) — REQUIRES QS VALIDATION',
    ]).font = {
      bold: true,
      color: { argb: 'FF9A3412' },
    };
  }
  rabSheet.addRow(['Nama Proyek', project.name]);
  if (project.clientName) {
    rabSheet.addRow(['Klien / Owner', project.clientName]);
  }
  if (project.projectLocation) {
    rabSheet.addRow(['Lokasi Proyek', project.projectLocation]);
  }
  if (project.architectName) {
    rabSheet.addRow(['Arsitek / Studio', project.architectName]);
  }
  if (project.buildingAreaM2) {
    const areaRow = rabSheet.addRow([
      'Luas Bangunan (m2)',
      Number(project.buildingAreaM2),
    ]);
    areaRow.getCell(2).numFmt = '#,##0.00';
  }
  rabSheet.addRow(['Wilayah', effectiveRegionName]);
  rabSheet.addRow(['Tanggal Harga (price_date)', project.priceDate]);
  rabSheet.addRow(['Status', project.status]);
  rabSheet.addRow(['Margin OHP (%)', Number(project.overheadProfitMargin)]);
  rabSheet.addRow(['Tarif PPN (%)', Number(project.taxRatePpn)]);
  rabSheet.addRow(['Tanggal Export', exportDateIso]);
  rabSheet.addRow([]);

  const rabHeader = rabSheet.addRow([
    'No',
    'Uraian Pekerjaan',
    'Kode AHSP',
    'Volume',
    'Satuan',
    'HSP (Rp)',
    'Total (Rp)',
  ]);
  rabHeader.font = { bold: true };
  rabHeader.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1EFEA' },
    };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  let sectionIdx = 0;
  for (const [wbsPath, items] of rowsByPath.entries()) {
    sectionIdx += 1;
    const secRow = rabSheet.addRow([`${sectionIdx}`, wbsPath, '', '', '', '', '']);
    secRow.font = { bold: true };
    secRow.eachCell((c) => {
      c.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8F7F4' },
      };
    });

    items.forEach((item, idx) => {
      const dataRow = rabSheet.addRow([
        `${sectionIdx}.${idx + 1}`,
        item.description,
        item.ahspCode,
        Number(item.calculatedVolume),
        item.ahspUnit,
        Number(item.hsp ?? '0'),
        Number(item.baseTotal ?? '0'),
      ]);
      dataRow.getCell(4).numFmt = '#,##0.0000';
      dataRow.getCell(6).numFmt = '#,##0.000';
      dataRow.getCell(7).numFmt = '#,##0.00';
    });
  }

  rabSheet.addRow([]);
  const summaryRows: Array<[string, string]> = [
    ['Subtotal', computed.totals.subtotal],
    [`OHP (${project.overheadProfitMargin}%)`, computed.totals.ohp],
    ['DPP', computed.totals.dpp],
    [`PPN (${project.taxRatePpn}%)`, computed.totals.ppn],
    ['Grand Total', computed.totals.grandTotal],
  ];

  for (const [label, val] of summaryRows) {
    const r = rabSheet.addRow(['', '', '', '', '', label, Number(val)]);
    r.getCell(6).font = { bold: true };
    r.getCell(7).font = { bold: label === 'Grand Total' };
    r.getCell(7).numFmt = '#,##0.00';
  }

  if (computed.costPerM2 && project.buildingAreaM2) {
    const m2Row = rabSheet.addRow([
      '',
      '',
      '',
      '',
      '',
      `Biaya per m2 (${project.buildingAreaM2} m2)`,
      Number(computed.costPerM2),
    ]);
    m2Row.getCell(6).font = { italic: true };
    m2Row.getCell(7).numFmt = '#,##0.00';
  }

  rabSheet.addRow([]);
  rabSheet.addRow([]);
  rabSheet.addRow([
    '',
    'Disiapkan Oleh (Arsitek / Estimator)',
    '',
    '',
    '',
    'Disetujui Oleh (Klien / Owner)',
    '',
  ]).font = { bold: true };
  rabSheet.addRow([]);
  rabSheet.addRow([]);
  rabSheet.addRow([
    '',
    project.architectName ?? '(____________________)',
    '',
    '',
    '',
    project.clientName ?? '(____________________)',
    '',
  ]);

  // SHEET 2: AHSP
  const ahspSheet = workbook.addWorksheet('AHSP');
  ahspSheet.columns = [
    { key: 'ahspCode', width: 24 },
    { key: 'ahspName', width: 34 },
    { key: 'resCode', width: 20 },
    { key: 'resName', width: 28 },
    { key: 'resType', width: 12 },
    { key: 'resUnit', width: 10 },
    { key: 'coef', width: 14 },
    { key: 'price', width: 18 },
    { key: 'lineVal', width: 18 },
  ];

  const ahspHeader = ahspSheet.addRow([
    'Kode AHSP',
    'Nama Pekerjaan',
    'Kode Resource',
    'Nama Resource',
    'Tipe',
    'Satuan',
    'Koefisien',
    'Harga Efektif / Beku',
    'Jumlah (Koef x Harga)',
  ]);
  ahspHeader.font = { bold: true };

  if (project.status === 'FINALIZED') {
    const seenAhsp = new Map<string, typeof snapshots>();
    for (const s of snapshots) {
      const key = `${s.ahspCode}||${s.ahspName}`;
      if (!seenAhsp.has(key)) seenAhsp.set(key, []);
      seenAhsp.get(key)!.push(s);
    }
    for (const [, group] of seenAhsp.entries()) {
      const uniqueComps = new Map<string, (typeof snapshots)[number]>();
      for (const g of group) {
        if (!uniqueComps.has(g.resourceCode)) uniqueComps.set(g.resourceCode, g);
      }
      const lines: { coefficient: string; price: string }[] = [];
      for (const c of uniqueComps.values()) {
        const lineTotal = new Decimal(c.coefficient).times(
          new Decimal(c.frozenPrice)
        );
        lines.push({ coefficient: c.coefficient, price: c.frozenPrice });
        const r = ahspSheet.addRow([
          c.ahspCode,
          c.ahspName,
          c.resourceCode,
          c.resourceName,
          c.resourceType,
          c.resourceUnit,
          Number(c.coefficient),
          Number(c.frozenPrice),
          Number(lineTotal.toString()),
        ]);
        r.getCell(7).numFmt = '#,##0.0000';
        r.getCell(8).numFmt = '#,##0.00';
        r.getCell(9).numFmt = '#,##0.000';
      }
      const totalHsp = calcHsp(lines);
      const hspRow = ahspSheet.addRow([
        group[0].ahspCode,
        `Total HSP (${group[0].ahspUnit})`,
        '',
        '',
        '',
        '',
        '',
        '',
        Number(totalHsp.toString()),
      ]);
      hspRow.font = { bold: true };
      hspRow.getCell(9).numFmt = '#,##0.000';
    }
  } else {
    const usedAhspIds = Array.from(new Set(computed.rows.map((r) => r.ahspId)));
    const ahspMap = new Map(ahsps.map((a) => [a.id, a]));
    const pricesByRes = new Map<string, typeof prices>();
    for (const p of prices) {
      const arr = pricesByRes.get(p.resourceId);
      if (arr) arr.push(p);
      else pricesByRes.set(p.resourceId, [p]);
    }

    for (const ahspId of usedAhspIds) {
      const ahsp = ahspMap.get(ahspId);
      if (!ahsp) continue;
      const comps = compositions.filter((c) => c.ahspId === ahspId);
      const lines: { coefficient: string; price: string }[] = [];
      for (const c of comps) {
        const eff = pickEffectivePrice(
          pricesByRes.get(c.resourceId) ?? [],
          project.regionId,
          project.priceDate
        );
        lines.push({ coefficient: c.coefficient, price: eff });
        const lineTotal = new Decimal(c.coefficient).times(new Decimal(eff));
        const r = ahspSheet.addRow([
          ahsp.code,
          ahsp.name,
          c.resourceCode,
          c.resourceName,
          c.resourceType,
          c.resourceUnit,
          Number(c.coefficient),
          Number(eff),
          Number(lineTotal.toString()),
        ]);
        r.getCell(7).numFmt = '#,##0.0000';
        r.getCell(8).numFmt = '#,##0.00';
        r.getCell(9).numFmt = '#,##0.000';
      }
      const totalHsp = calcHsp(lines);
      const hspRow = ahspSheet.addRow([
        ahsp.code,
        `Total HSP (${ahsp.unit})`,
        '',
        '',
        '',
        '',
        '',
        '',
        Number(totalHsp.toString()),
      ]);
      hspRow.font = { bold: true };
      hspRow.getCell(9).numFmt = '#,##0.000';
    }
  }

  // SHEET 3: BOM
  const bomSheet = workbook.addWorksheet('BOM');
  bomSheet.columns = [
    { key: 'type', width: 14 },
    { key: 'code', width: 22 },
    { key: 'name', width: 34 },
    { key: 'unit', width: 12 },
    { key: 'qty', width: 18 },
  ];

  const bomHeader = bomSheet.addRow([
    'Tipe',
    'Kode Resource',
    'Nama Resource',
    'Satuan',
    'Total Kuantitas',
  ]);
  bomHeader.font = { bold: true };

  for (const b of computed.bom) {
    const r = bomSheet.addRow([
      b.resourceType,
      b.resourceCode,
      b.resourceName,
      b.resourceUnit,
      Number(b.quantity),
    ]);
    r.getCell(5).numFmt = '#,##0.0000';
  }

  // SHEET 4: REKAP & KURVA S
  appendRecapAndSCurveSheet(workbook, workspace);

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${safeFileSlug(project.name)}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
