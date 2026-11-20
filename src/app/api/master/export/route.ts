import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getMasterDataBundle } from '@/app/actions/master';

export const runtime = 'nodejs';

export async function GET() {
  const bundle = await getMasterDataBundle();

  const regionMap = new Map(bundle.regions.map((r) => [r.id, r]));
  const resourceMap = new Map(bundle.resources.map((r) => [r.id, r]));
  const ahspMap = new Map(bundle.ahsps.map((a) => [a.id, a]));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OpenRAB Master Library';
  workbook.created = new Date();

  // Sheet 1: Resources
  const resSheet = workbook.addWorksheet('Resources');
  resSheet.columns = [
    { header: 'code', key: 'code', width: 20 },
    { header: 'name', key: 'name', width: 38 },
    { header: 'type', key: 'type', width: 14 },
    { header: 'unit', key: 'unit', width: 12 },
    { header: 'is_active', key: 'is_active', width: 12 },
  ];
  resSheet.getRow(1).font = { bold: true };

  for (const r of bundle.resources) {
    resSheet.addRow({
      code: r.code,
      name: r.name,
      type: r.type,
      unit: r.unit,
      is_active: r.isActive ? 'TRUE' : 'FALSE',
    });
  }

  // Sheet 2: Regional_Prices
  const priceSheet = workbook.addWorksheet('Regional_Prices');
  priceSheet.columns = [
    { header: 'resource_code', key: 'resource_code', width: 20 },
    { header: 'region_name', key: 'region_name', width: 34 },
    { header: 'effective_date', key: 'effective_date', width: 16 },
    { header: 'base_price', key: 'base_price', width: 18 },
  ];
  priceSheet.getRow(1).font = { bold: true };

  for (const p of bundle.prices) {
    const res = resourceMap.get(p.resourceId);
    const reg = regionMap.get(p.regionId);
    if (!res || !reg) continue;
    const row = priceSheet.addRow({
      resource_code: res.code,
      region_name: reg.name,
      effective_date: p.effectiveDate,
      base_price: Number(p.basePrice),
    });
    row.getCell(4).numFmt = '#,##0.00';
  }

  // Sheet 3: AHSP_Compositions
  const ahspSheet = workbook.addWorksheet('AHSP_Compositions');
  ahspSheet.columns = [
    { header: 'ahsp_code', key: 'ahsp_code', width: 18 },
    { header: 'ahsp_name', key: 'ahsp_name', width: 48 },
    { header: 'ahsp_unit', key: 'ahsp_unit', width: 12 },
    { header: 'resource_code', key: 'resource_code', width: 20 },
    { header: 'coefficient', key: 'coefficient', width: 14 },
  ];
  ahspSheet.getRow(1).font = { bold: true };

  for (const c of bundle.compositions) {
    const ahsp = ahspMap.get(c.ahspId);
    const res = resourceMap.get(c.resourceId);
    if (!ahsp || !res) continue;
    const row = ahspSheet.addRow({
      ahsp_code: ahsp.code,
      ahsp_name: ahsp.name,
      ahsp_unit: ahsp.unit,
      resource_code: res.code,
      coefficient: Number(c.coefficient),
    });
    row.getCell(5).numFmt = '#,##0.0000';
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        'attachment; filename="openrab-master-template.xlsx"',
    },
  });
}
