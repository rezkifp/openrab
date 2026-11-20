import { NextResponse } from 'next/server';
import PdfPrinter from 'pdfmake';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import {
  getProjectComparisonData,
  getProjectWorkspace,
} from '@/app/actions/project';
import type { VariationStatus } from '@/lib/rab/calc';
import { formatIdDecimal, formatRupiah } from '@/lib/rab/format';
import { buildWbsPathMap } from '@/lib/rab/workspace-calc';

export const runtime = 'nodejs';

type ExportMode = 'internal' | 'client' | 'boq' | 'baptk';

const VARIATION_LABELS: Record<VariationStatus, string> = {
  ADDED: 'TAMBAH',
  REMOVED: 'KURANG',
  MODIFIED_VOLUME: 'UBAH VOL',
  MODIFIED_SPEC: 'UBAH SPEK',
  MODIFIED_BOTH: 'UBAH VOL+SPEK',
  UNCHANGED: 'TETAP',
};

const pdfFonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

function safeFileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'openrab'
  );
}

function renderPdfBuffer(docDefinition: TDocumentDefinitions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const printer = new PdfPrinter(pdfFonts);
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks: Buffer[] = [];
    pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', (err: Error) => reject(err));
    pdfDoc.end();
  });
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

  const { project, wbsList, snapshots, computed, hasDummy } = workspace;

  if (computed.priceErrors.length > 0 || computed.totals === null) {
    return NextResponse.json(
      {
        error:
          computed.priceErrors[0] ??
          'Proyek memiliki error validasi atau harga efektif belum lengkap sehingga tidak dapat diexport ke PDF.',
      },
      { status: 400 }
    );
  }

  const effectiveRegionName =
    project.status === 'FINALIZED' && project.regionNameFrozen
      ? project.regionNameFrozen
      : project.regionName;

  // =========================================================================
  // MODE BAPTK (ADDENDUM / CCO) — LANDSCAPE A4
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

    const baptkBody: TableCell[][] = [
      [
        { text: 'No', bold: true, fillColor: '#F1EFEA' },
        { text: 'Divisi WBS / Uraian Pekerjaan', bold: true, fillColor: '#F1EFEA' },
        { text: 'Status', bold: true, fillColor: '#F1EFEA' },
        { text: 'Vol Awal', bold: true, alignment: 'right', fillColor: '#F1EFEA' },
        { text: 'Vol Baru', bold: true, alignment: 'right', fillColor: '#F1EFEA' },
        { text: 'Selisih Vol', bold: true, alignment: 'right', fillColor: '#F1EFEA' },
        { text: 'Total Awal', bold: true, alignment: 'right', fillColor: '#F1EFEA' },
        { text: 'Total Baru', bold: true, alignment: 'right', fillColor: '#F1EFEA' },
        { text: 'Selisih (Rp)', bold: true, alignment: 'right', fillColor: '#F1EFEA' },
      ],
    ];

    cmp.items.forEach((item, idx) => {
      const deltaNum = Number(item.deltaTotal);
      baptkBody.push([
        { text: `${idx + 1}` },
        {
          text: `${item.description}\n[${item.wbsPath}] (${item.unit})`,
        },
        { text: VARIATION_LABELS[item.status], bold: true },
        { text: formatIdDecimal(item.baseVolume, 4), alignment: 'right' },
        { text: formatIdDecimal(item.revisedVolume, 4), alignment: 'right' },
        { text: formatIdDecimal(item.deltaVolume, 4), alignment: 'right' },
        { text: formatRupiah(item.baseTotal, 2), alignment: 'right' },
        { text: formatRupiah(item.revisedTotal, 2), alignment: 'right' },
        {
          text: formatRupiah(item.deltaTotal, 2),
          alignment: 'right',
          bold: true,
          color: deltaNum > 0 ? '#047857' : deltaNum < 0 ? '#B91C1C' : '#0F172A',
        },
      ]);
    });

    const baptkDoc: TDocumentDefinitions = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [32, 36, 32, 44],
      defaultStyle: { font: 'Helvetica', fontSize: 8.5, color: '#0F172A' },
      content: [
        {
          text: 'BERITA ACARA PEKERJAAN TAMBAH KURANG (ADDENDUM / CCO)',
          fontSize: 14,
          bold: true,
          margin: [0, 0, 0, 6],
        },
        {
          columns: [
            {
              width: '*',
              stack: [
                {
                  text: `Kontrak Awal (Opsi A): ${cmp.baseProject.name} (${cmp.baseProject.status})`,
                  fontSize: 9,
                },
                {
                  text: `Addendum / Revisi (Opsi B): ${cmp.revisedProject.name} (${cmp.revisedProject.status})`,
                  fontSize: 9,
                  bold: true,
                },
                ...(project.clientName
                  ? [{ text: `Klien / Owner: ${project.clientName}`, fontSize: 8.5 }]
                  : []),
                ...(project.projectLocation
                  ? [{ text: `Lokasi: ${project.projectLocation}`, fontSize: 8.5 }]
                  : []),
              ],
            },
            {
              width: 280,
              table: {
                widths: ['*', 115],
                body: [
                  [
                    { text: 'Nilai Kontrak Awal (Grand Total)', bold: true },
                    { text: formatRupiah(cmp.baseGrandTotal, 2), alignment: 'right' },
                  ],
                  [
                    { text: 'Total Pekerjaan Tambah (Base)' },
                    {
                      text: formatRupiah(cmp.totalAddition, 2),
                      alignment: 'right',
                      color: '#047857',
                    },
                  ],
                  [
                    { text: 'Total Pekerjaan Kurang (Base)' },
                    {
                      text: formatRupiah(cmp.totalDeduction, 2),
                      alignment: 'right',
                      color: '#B91C1C',
                    },
                  ],
                  [
                    { text: `Selisih Netto (${cmp.deltaPercent}%)`, bold: true },
                    {
                      text: formatRupiah(cmp.netDeltaGrandTotal, 2),
                      alignment: 'right',
                      bold: true,
                    },
                  ],
                  [
                    { text: 'Nilai Kontrak Addendum (Grand Total)', bold: true },
                    {
                      text: formatRupiah(cmp.revisedGrandTotal, 2),
                      alignment: 'right',
                      bold: true,
                    },
                  ],
                ],
              },
              layout: 'lightHorizontalLines',
              fontSize: 8.5,
            },
          ],
          margin: [0, 0, 0, 14],
        },
        {
          table: {
            headerRows: 1,
            widths: [24, '*', 64, 52, 52, 52, 78, 78, 82],
            body: baptkBody,
          },
          layout: 'lightHorizontalLines',
          fontSize: 8,
          margin: [0, 0, 0, 22],
        },
        {
          columns: [
            {
              width: '*',
              alignment: 'center',
              stack: [
                { text: 'Pemilik Proyek (Owner)', bold: true, fontSize: 9 },
                { text: '\n\n\n\n' },
                { text: project.clientName ?? '(____________________)', bold: true },
              ],
            },
            {
              width: '*',
              alignment: 'center',
              stack: [
                { text: 'Arsitek / Konsultan MK', bold: true, fontSize: 9 },
                { text: '\n\n\n\n' },
                { text: project.architectName ?? '(____________________)', bold: true },
              ],
            },
            {
              width: '*',
              alignment: 'center',
              stack: [
                { text: 'Kontraktor Pelaksana', bold: true, fontSize: 9 },
                { text: '\n\n\n\n' },
                { text: '(____________________)', bold: true },
              ],
            },
          ],
        },
      ],
      footer: (currentPage, pageCount) => ({
        columns: [
          {
            text: `OpenRAB BAPTK | ${cmp.baseProject.name} vs ${cmp.revisedProject.name}`,
            fontSize: 8,
            color: '#475569',
            margin: [32, 0, 0, 0],
          },
          {
            text: `Hal ${currentPage} / ${pageCount}`,
            fontSize: 8,
            color: '#475569',
            alignment: 'right',
            margin: [0, 0, 32, 0],
          },
        ],
      }),
    };

    const pdfBuffer = await renderPdfBuffer(baptkDoc);
    const filename = `${safeFileSlug(project.name)}-baptk.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  // =========================================================================
  // MODES: INTERNAL QS, CLIENT (OWNER ESTIMATE), & BLANK BoQ
  // =========================================================================
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

  const isBlankBoq = mode === 'boq';
  const isClient = mode === 'client';

  // WBS Executive Recapitulation Table (included in internal & client modes)
  const recapBody: TableCell[][] = isClient
    ? [
        [
          { text: 'No', bold: true, fillColor: '#F1EFEA' },
          { text: 'Divisi Pekerjaan', bold: true, fillColor: '#F1EFEA' },
          {
            text: 'Subtotal Base (Rp)',
            bold: true,
            alignment: 'right',
            fillColor: '#F1EFEA',
          },
          {
            text: `Harga + OHP ${project.overheadProfitMargin}%`,
            bold: true,
            alignment: 'right',
            fillColor: '#F1EFEA',
          },
          {
            text: 'Bobot (%)',
            bold: true,
            alignment: 'right',
            fillColor: '#F1EFEA',
          },
        ],
        ...computed.recapRows.map(
          (r): TableCell[] => [
            { text: r.code, bold: true },
            { text: r.name },
            { text: formatRupiah(r.subtotal, 2), alignment: 'right' },
            {
              text: formatRupiah(r.clientSubtotalWithOhp, 2),
              alignment: 'right',
            },
            {
              text: `${formatIdDecimal(r.weightPercent, 2)}%`,
              alignment: 'right',
              bold: true,
            },
          ]
        ),
      ]
    : [
        [
          { text: 'No', bold: true, fillColor: '#F1EFEA' },
          { text: 'Divisi WBS', bold: true, fillColor: '#F1EFEA' },
          { text: 'Jadwal', bold: true, alignment: 'center', fillColor: '#F1EFEA' },
          {
            text: 'Bobot (%)',
            bold: true,
            alignment: 'right',
            fillColor: '#F1EFEA',
          },
          {
            text: 'Subtotal Base (Rp)',
            bold: true,
            alignment: 'right',
            fillColor: '#F1EFEA',
          },
          {
            text: `Harga + OHP ${project.overheadProfitMargin}%`,
            bold: true,
            alignment: 'right',
            fillColor: '#F1EFEA',
          },
        ],
        ...computed.recapRows.map(
          (r): TableCell[] => [
            { text: r.code, bold: true },
            { text: r.name },
            {
              text: `M${r.startWeek} (${r.durationWeeks} mgg)`,
              alignment: 'center',
            },
            {
              text: `${formatIdDecimal(r.weightPercent, 2)}%`,
              alignment: 'right',
              bold: true,
            },
            { text: formatRupiah(r.subtotal, 2), alignment: 'right' },
            {
              text: formatRupiah(r.clientSubtotalWithOhp, 2),
              alignment: 'right',
            },
          ]
        ),
      ];

  const recapTableBlock: Content[] =
    !isBlankBoq && computed.recapRows.length > 0
      ? [
          {
            text: 'I. REKAPITULASI DIVISI PEKERJAAN & BOBOT (%)',
            fontSize: 10.5,
            bold: true,
            margin: [0, 0, 0, 6],
          },
          {
            table: {
              headerRows: 1,
              widths: isClient
                ? [28, '*', 95, 110, 52]
                : [28, '*', 64, 52, 95, 95],
              body: recapBody,
            },
            layout: 'lightHorizontalLines',
            fontSize: 8.5,
            margin: [0, 0, 0, 14],
          },
        ]
      : [];

  const tableBody: TableCell[][] = [
    [
      { text: 'No', bold: true, fillColor: '#F1EFEA' },
      { text: 'Uraian Pekerjaan', bold: true, fillColor: '#F1EFEA' },
      { text: 'Volume', bold: true, alignment: 'right', fillColor: '#F1EFEA' },
      { text: 'Sat', bold: true, fillColor: '#F1EFEA' },
      {
        text: isBlankBoq ? 'Harga Satuan (Rp)' : 'HSP (Rp)',
        bold: true,
        alignment: 'right',
        fillColor: '#F1EFEA',
      },
      {
        text: isBlankBoq ? 'Jumlah Harga (Rp)' : 'Total (Rp)',
        bold: true,
        alignment: 'right',
        fillColor: '#F1EFEA',
      },
    ],
  ];

  let secIdx = 0;
  for (const [wbsPath, items] of rowsByPath.entries()) {
    secIdx += 1;
    tableBody.push([
      { text: `${secIdx}`, bold: true, fillColor: '#F8F7F4' },
      { text: wbsPath, bold: true, colSpan: 5, fillColor: '#F8F7F4' },
      {},
      {},
      {},
      {},
    ]);

    items.forEach((item, idx) => {
      const descText =
        isClient || isBlankBoq
          ? item.description
          : `${item.description}\n(${item.ahspCode})`;

      tableBody.push([
        { text: `${secIdx}.${idx + 1}` },
        { text: descText },
        {
          text: formatIdDecimal(item.calculatedVolume, 4),
          alignment: 'right',
        },
        { text: item.ahspUnit },
        {
          text: isBlankBoq
            ? 'Rp ...................'
            : item.hsp
            ? formatRupiah(item.hsp, 3)
            : '-',
          alignment: 'right',
        },
        {
          text: isBlankBoq
            ? 'Rp .....................'
            : item.baseTotal
            ? formatRupiah(item.baseTotal, 2)
            : '-',
          alignment: 'right',
          bold: !isBlankBoq,
        },
      ]);
    });
  }

  const titleText = isBlankBoq
    ? 'DOKUMEN TENDER — BILL OF QUANTITIES (BLANK BoQ)'
    : isClient
    ? 'OWNER ESTIMATE — RENCANA ANGGARAN BIAYA (RAB)'
    : 'REKAPITULASI RENCANA ANGGARAN BIAYA (RAB)';

  const summaryTableBlock: Content = isBlankBoq
    ? {
        table: {
          widths: ['*', 140],
          body: [
            [
              { text: 'Subtotal Penawaran Kontraktor', alignment: 'right' },
              { text: 'Rp .........................', alignment: 'right' },
            ],
            [
              { text: `PPN (${project.taxRatePpn}%)`, alignment: 'right' },
              { text: 'Rp .........................', alignment: 'right' },
            ],
            [
              { text: 'GRAND TOTAL PENAWARAN', bold: true, alignment: 'right' },
              {
                text: 'Rp .........................',
                bold: true,
                alignment: 'right',
              },
            ],
          ],
        },
        layout: 'noBorders',
        fontSize: 9.5,
        margin: [0, 0, 0, 26],
      }
    : {
        table: {
          widths: ['*', 130],
          body: [
            [
              { text: 'Subtotal', alignment: 'right' },
              {
                text: formatRupiah(computed.totals.subtotal, 2),
                alignment: 'right',
              },
            ],
            [
              {
                text: `Overhead & Profit (${project.overheadProfitMargin}%)`,
                alignment: 'right',
              },
              { text: formatRupiah(computed.totals.ohp, 2), alignment: 'right' },
            ],
            [
              { text: 'Dasar Pengenaan Pajak (DPP)', alignment: 'right' },
              { text: formatRupiah(computed.totals.dpp, 2), alignment: 'right' },
            ],
            [
              { text: `PPN (${project.taxRatePpn}%)`, alignment: 'right' },
              { text: formatRupiah(computed.totals.ppn, 2), alignment: 'right' },
            ],
            [
              { text: 'GRAND TOTAL', bold: true, alignment: 'right' },
              {
                text: formatRupiah(computed.totals.grandTotal, 2),
                bold: true,
                alignment: 'right',
              },
            ],
            ...(computed.costPerM2 && project.buildingAreaM2
              ? [
                  [
                    {
                      text: `Biaya per m2 Bangunan (${formatIdDecimal(project.buildingAreaM2, 2)} m2)`,
                      italics: true,
                      alignment: 'right' as const,
                    },
                    {
                      text: `${formatRupiah(computed.costPerM2, 2)} / m2`,
                      italics: true,
                      alignment: 'right' as const,
                    },
                  ],
                ]
              : []),
          ],
        },
        layout: 'noBorders',
        fontSize: 9.5,
        margin: [0, 0, 0, 26],
      };

  const content: Content[] = [
    {
      text: titleText,
      fontSize: 14,
      bold: true,
      margin: [0, 0, 0, 4],
    },
    ...(hasDummy
      ? [
          {
            text: 'DATA CONTOH (DUMMY) — MEMERLUKAN VALIDASI QUANTITY SURVEYOR',
            fontSize: 9,
            bold: true,
            color: '#9A3412',
            margin: [0, 0, 0, 8] as [number, number, number, number],
          },
        ]
      : []),
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: `Proyek: ${project.name}`, fontSize: 10, bold: true },
            ...(project.clientName
              ? [{ text: `Klien / Owner: ${project.clientName}`, fontSize: 9 }]
              : []),
            ...(project.projectLocation
              ? [{ text: `Lokasi: ${project.projectLocation}`, fontSize: 9 }]
              : []),
            ...(project.architectName
              ? [{ text: `Arsitek / Studio: ${project.architectName}`, fontSize: 9 }]
              : []),
            { text: `Wilayah: ${effectiveRegionName}`, fontSize: 9 },
          ],
        },
        {
          width: 'auto',
          stack: [
            {
              text: isBlankBoq ? 'DOKUMEN TENDER' : `Status: ${project.status}`,
              fontSize: 9,
              bold: true,
              alignment: 'right',
            },
            {
              text: `Price Date: ${project.priceDate}`,
              fontSize: 9,
              alignment: 'right',
            },
            ...(project.buildingAreaM2
              ? [
                  {
                    text: `Luas Bangunan: ${formatIdDecimal(project.buildingAreaM2, 2)} m2`,
                    fontSize: 9,
                    alignment: 'right' as const,
                  },
                ]
              : []),
          ],
        },
      ],
      margin: [0, 0, 0, 12],
    },
    ...recapTableBlock,
    ...(!isBlankBoq && computed.recapRows.length > 0
      ? [
          {
            text: 'II. RINCIAN VOLUME & ANGGARAN PEKERJAAN',
            fontSize: 10.5,
            bold: true,
            margin: [0, 0, 0, 6] as [number, number, number, number],
          },
        ]
      : []),
    {
      table: {
        headerRows: 1,
        widths: [28, '*', 58, 30, 85, 95],
        body: tableBody,
      },
      layout: 'lightHorizontalLines',
      fontSize: 8.5,
      margin: [0, 0, 0, 14],
    },
    summaryTableBlock,
    {
      columns: isBlankBoq
        ? [
            {
              width: '*',
              alignment: 'center',
              stack: [
                {
                  text: 'Kontraktor Penawar (Cap & Tanda Tangan)',
                  fontSize: 9,
                  bold: true,
                },
                { text: '\n\n\n\n' },
                { text: '(____________________)', fontSize: 9, bold: true },
              ],
            },
            {
              width: '*',
              alignment: 'center',
              stack: [
                { text: 'Pemberi Tugas / Konsultan', fontSize: 9, bold: true },
                { text: '\n\n\n\n' },
                {
                  text: project.architectName ?? '(____________________)',
                  fontSize: 9,
                  bold: true,
                },
              ],
            },
          ]
        : [
            {
              width: '*',
              alignment: 'center',
              stack: [
                { text: 'Disiapkan Oleh (Arsitek / Estimator)', fontSize: 9, bold: true },
                { text: '\n\n\n\n' },
                {
                  text: project.architectName ?? '(____________________)',
                  fontSize: 9,
                  bold: true,
                },
              ],
            },
            {
              width: '*',
              alignment: 'center',
              stack: [
                { text: 'Disetujui Oleh (Klien / Owner)', fontSize: 9, bold: true },
                { text: '\n\n\n\n' },
                {
                  text: project.clientName ?? '(____________________)',
                  fontSize: 9,
                  bold: true,
                },
              ],
            },
          ],
    },
  ];

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [36, 40, 36, 48],
    defaultStyle: {
      font: 'Helvetica',
      fontSize: 9,
      color: '#0F172A',
    },
    ...(project.status === 'DRAFT' && !isBlankBoq
      ? {
          watermark: {
            text: 'DRAFT',
            color: '#94A3B8',
            opacity: 0.22,
            bold: true,
            italics: false,
          },
        }
      : {}),
    footer: (currentPage, pageCount) => ({
      columns: [
        {
          text: `OpenRAB (${mode.toUpperCase()}) | Status: ${project.status} | Price Date: ${project.priceDate}${hasDummy ? ' | DATA CONTOH' : ''}`,
          fontSize: 8,
          color: '#475569',
          margin: [36, 0, 0, 0],
        },
        {
          text: `Hal ${currentPage} / ${pageCount}`,
          fontSize: 8,
          color: '#475569',
          alignment: 'right',
          margin: [0, 0, 36, 0],
        },
      ],
    }),
    content,
  };

  const pdfBuffer = await renderPdfBuffer(docDefinition);
  const suffix = mode === 'internal' ? '' : `-${mode}`;
  const filename = `${safeFileSlug(project.name)}${suffix}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
