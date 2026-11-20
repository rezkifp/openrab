'use server';

import Decimal from 'decimal.js';
import ExcelJS from 'exceljs';
import { revalidatePath } from 'next/cache';
import { asc, desc, eq, sql } from 'drizzle-orm';
import {
  ahspCompositions,
  db,
  masterAhsp,
  masterResources,
  projects,
  projectTakeoffs,
  regions,
  resourcePrices,
  takeoffSnapshots,
} from '@/db';
import { hasAnyDummyMarker } from '@/lib/rab/format';
import type { ResourceType } from '@/lib/rab/calc';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP, precision: 40 });

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDecimalString(
  raw: string,
  dp: number,
  label: string
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: `${label} wajib diisi.` };
  }
  try {
    const d = new Decimal(trimmed);
    if (!d.isFinite() || d.lt(0)) {
      return { ok: false, error: `${label} harus bernilai >= 0.` };
    }
    return { ok: true, value: d.toFixed(dp, Decimal.ROUND_HALF_UP) };
  } catch {
    return { ok: false, error: `${label} harus berupa angka valid.` };
  }
}

export async function getMasterDataBundle() {
  const regionRows = await db.select().from(regions).orderBy(asc(regions.name));
  const resourceRows = await db
    .select()
    .from(masterResources)
    .orderBy(asc(masterResources.code));
  const priceRows = await db
    .select()
    .from(resourcePrices)
    .orderBy(desc(resourcePrices.effectiveDate));
  const ahspRows = await db
    .select()
    .from(masterAhsp)
    .orderBy(asc(masterAhsp.code));
  const compRows = await db
    .select()
    .from(ahspCompositions)
    .orderBy(asc(ahspCompositions.createdAt));

  const hasDummy = hasAnyDummyMarker([
    ...regionRows.filter((r) => r.isActive).map((r) => r.name),
    ...resourceRows.filter((r) => r.isActive).flatMap((r) => [r.code, r.name]),
    ...ahspRows.filter((a) => a.isActive).flatMap((a) => [a.code, a.name]),
  ]);

  return {
    regions: regionRows.map((r) => ({
      id: r.id,
      name: r.name,
      isActive: r.isActive,
    })),
    resources: resourceRows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      type: r.type,
      unit: r.unit,
      isActive: r.isActive,
    })),
    prices: priceRows.map((p) => ({
      id: p.id,
      resourceId: p.resourceId,
      regionId: p.regionId,
      basePrice: p.basePrice,
      effectiveDate: p.effectiveDate,
    })),
    ahsps: ahspRows.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      unit: a.unit,
      isActive: a.isActive,
    })),
    compositions: compRows.map((c) => ({
      id: c.id,
      ahspId: c.ahspId,
      resourceId: c.resourceId,
      coefficient: c.coefficient,
    })),
    hasDummy,
  };
}

export async function createRegion(input: {
  name: string;
}): Promise<ActionResult<{ id: string }>> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: 'Nama wilayah wajib diisi.' };
  }
  const [inserted] = await db
    .insert(regions)
    .values({ name, isActive: true })
    .returning({ id: regions.id });
  revalidatePath('/master');
  revalidatePath('/projects');
  return { ok: true, data: { id: inserted.id } };
}

export async function updateRegion(input: {
  id: string;
  name: string;
  isActive: boolean;
}): Promise<ActionResult> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: 'Nama wilayah wajib diisi.' };
  }
  await db
    .update(regions)
    .set({ name, isActive: input.isActive, updatedAt: new Date() })
    .where(eq(regions.id, input.id));
  revalidatePath('/master');
  revalidatePath('/projects');
  return { ok: true, data: undefined };
}

export async function deleteRegion(id: string): Promise<ActionResult> {
  const [projCount] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(projects)
    .where(eq(projects.regionId, id));
  const [priceCount] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(resourcePrices)
    .where(eq(resourcePrices.regionId, id));

  if ((projCount?.cnt ?? 0) > 0 || (priceCount?.cnt ?? 0) > 0) {
    return {
      ok: false,
      error:
        'Wilayah tidak dapat dihapus karena masih direferensikan oleh proyek atau daftar harga. Nonaktifkan via is_active = false.',
    };
  }

  await db.delete(regions).where(eq(regions.id, id));
  revalidatePath('/master');
  revalidatePath('/projects');
  return { ok: true, data: undefined };
}

export async function createResource(input: {
  code: string;
  name: string;
  type: ResourceType;
  unit: string;
}): Promise<ActionResult<{ id: string }>> {
  const code = input.code.trim();
  const name = input.name.trim();
  const unit = input.unit.trim();
  if (!code || !name || !unit) {
    return { ok: false, error: 'Kode, nama, dan satuan resource wajib diisi.' };
  }

  try {
    const [inserted] = await db
      .insert(masterResources)
      .values({ code, name, type: input.type, unit, isActive: true })
      .returning({ id: masterResources.id });
    revalidatePath('/master');
    return { ok: true, data: { id: inserted.id } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return { ok: false, error: `Kode resource "${code}" sudah terdaftar.` };
    }
    return { ok: false, error: 'Gagal menyimpan resource baru.' };
  }
}

export async function updateResource(input: {
  id: string;
  code: string;
  name: string;
  type: ResourceType;
  unit: string;
  isActive: boolean;
}): Promise<ActionResult> {
  const code = input.code.trim();
  const name = input.name.trim();
  const unit = input.unit.trim();
  if (!code || !name || !unit) {
    return { ok: false, error: 'Kode, nama, dan satuan resource wajib diisi.' };
  }

  try {
    await db
      .update(masterResources)
      .set({
        code,
        name,
        type: input.type,
        unit,
        isActive: input.isActive,
        updatedAt: new Date(),
      })
      .where(eq(masterResources.id, input.id));
    revalidatePath('/master');
    return { ok: true, data: undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return { ok: false, error: `Kode resource "${code}" sudah terdaftar.` };
    }
    return { ok: false, error: 'Gagal memperbarui resource.' };
  }
}

export async function deleteResource(id: string): Promise<ActionResult> {
  const [existing] = await db
    .select({ code: masterResources.code })
    .from(masterResources)
    .where(eq(masterResources.id, id));

  if (!existing) {
    return { ok: false, error: 'Resource tidak ditemukan.' };
  }

  const [priceCount] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(resourcePrices)
    .where(eq(resourcePrices.resourceId, id));
  const [compCount] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(ahspCompositions)
    .where(eq(ahspCompositions.resourceId, id));
  const [snapCount] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(takeoffSnapshots)
    .where(eq(takeoffSnapshots.resourceCode, existing.code));

  if (
    (priceCount?.cnt ?? 0) > 0 ||
    (compCount?.cnt ?? 0) > 0 ||
    (snapCount?.cnt ?? 0) > 0
  ) {
    return {
      ok: false,
      error:
        'Resource tidak dapat dihapus karena masih direferensikan oleh daftar harga, komposisi AHSP, atau snapshot. Nonaktifkan via is_active = false.',
    };
  }

  await db.delete(masterResources).where(eq(masterResources.id, id));
  revalidatePath('/master');
  return { ok: true, data: undefined };
}

export async function saveResourcePrice(input: {
  id?: string;
  resourceId: string;
  regionId: string;
  basePrice: string;
  effectiveDate: string;
}): Promise<ActionResult> {
  if (!ISO_DATE_RE.test(input.effectiveDate)) {
    return { ok: false, error: 'Tanggal efektif harus berformat YYYY-MM-DD.' };
  }
  const normalizedPrice = normalizeDecimalString(
    input.basePrice,
    2,
    'Harga dasar'
  );
  if (!normalizedPrice.ok) {
    return normalizedPrice;
  }

  try {
    if (input.id) {
      await db
        .update(resourcePrices)
        .set({
          resourceId: input.resourceId,
          regionId: input.regionId,
          basePrice: normalizedPrice.value,
          effectiveDate: input.effectiveDate,
          updatedAt: new Date(),
        })
        .where(eq(resourcePrices.id, input.id));
    } else {
      await db.insert(resourcePrices).values({
        resourceId: input.resourceId,
        regionId: input.regionId,
        basePrice: normalizedPrice.value,
        effectiveDate: input.effectiveDate,
      });
    }
    revalidatePath('/master');
    revalidatePath('/projects');
    return { ok: true, data: undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return {
        ok: false,
        error:
          'Harga untuk resource, wilayah, dan tanggal efektif tersebut sudah ada.',
      };
    }
    return { ok: false, error: 'Gagal menyimpan harga regional.' };
  }
}

export async function deleteResourcePrice(id: string): Promise<ActionResult> {
  await db.delete(resourcePrices).where(eq(resourcePrices.id, id));
  revalidatePath('/master');
  revalidatePath('/projects');
  return { ok: true, data: undefined };
}

export async function createAhsp(input: {
  code: string;
  name: string;
  unit: string;
}): Promise<ActionResult<{ id: string }>> {
  const code = input.code.trim();
  const name = input.name.trim();
  const unit = input.unit.trim();
  if (!code || !name || !unit) {
    return { ok: false, error: 'Kode, nama, dan satuan AHSP wajib diisi.' };
  }

  try {
    const [inserted] = await db
      .insert(masterAhsp)
      .values({ code, name, unit, isActive: true })
      .returning({ id: masterAhsp.id });
    revalidatePath('/master');
    return { ok: true, data: { id: inserted.id } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return { ok: false, error: `Kode AHSP "${code}" sudah terdaftar.` };
    }
    return { ok: false, error: 'Gagal menyimpan master AHSP.' };
  }
}

export async function updateAhsp(input: {
  id: string;
  code: string;
  name: string;
  unit: string;
  isActive: boolean;
}): Promise<ActionResult> {
  const code = input.code.trim();
  const name = input.name.trim();
  const unit = input.unit.trim();
  if (!code || !name || !unit) {
    return { ok: false, error: 'Kode, nama, dan satuan AHSP wajib diisi.' };
  }

  try {
    await db
      .update(masterAhsp)
      .set({
        code,
        name,
        unit,
        isActive: input.isActive,
        updatedAt: new Date(),
      })
      .where(eq(masterAhsp.id, input.id));
    revalidatePath('/master');
    return { ok: true, data: undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return { ok: false, error: `Kode AHSP "${code}" sudah terdaftar.` };
    }
    return { ok: false, error: 'Gagal memperbarui master AHSP.' };
  }
}

export async function deleteAhsp(id: string): Promise<ActionResult> {
  const [existing] = await db
    .select({ code: masterAhsp.code })
    .from(masterAhsp)
    .where(eq(masterAhsp.id, id));

  if (!existing) {
    return { ok: false, error: 'AHSP tidak ditemukan.' };
  }

  const [takeoffCount] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(projectTakeoffs)
    .where(eq(projectTakeoffs.ahspId, id));
  const [compCount] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(ahspCompositions)
    .where(eq(ahspCompositions.ahspId, id));
  const [snapCount] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(takeoffSnapshots)
    .where(eq(takeoffSnapshots.ahspCode, existing.code));

  if (
    (takeoffCount?.cnt ?? 0) > 0 ||
    (compCount?.cnt ?? 0) > 0 ||
    (snapCount?.cnt ?? 0) > 0
  ) {
    return {
      ok: false,
      error:
        'AHSP tidak dapat dihapus karena masih direferensikan oleh komposisi, takeoff proyek, atau snapshot. Nonaktifkan via is_active = false.',
    };
  }

  await db.delete(masterAhsp).where(eq(masterAhsp.id, id));
  revalidatePath('/master');
  return { ok: true, data: undefined };
}

export async function addAhspComposition(input: {
  ahspId: string;
  resourceId: string;
  coefficient: string;
}): Promise<ActionResult> {
  const normalizedCoef = normalizeDecimalString(
    input.coefficient,
    4,
    'Koefisien'
  );
  if (!normalizedCoef.ok) {
    return normalizedCoef;
  }

  try {
    await db.insert(ahspCompositions).values({
      ahspId: input.ahspId,
      resourceId: input.resourceId,
      coefficient: normalizedCoef.value,
    });
    revalidatePath('/master');
    return { ok: true, data: undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return {
        ok: false,
        error: 'Resource tersebut sudah ada di komposisi AHSP ini.',
      };
    }
    return { ok: false, error: 'Gagal menambahkan komposisi AHSP.' };
  }
}

export async function updateAhspComposition(input: {
  id: string;
  coefficient: string;
}): Promise<ActionResult> {
  const normalizedCoef = normalizeDecimalString(
    input.coefficient,
    4,
    'Koefisien'
  );
  if (!normalizedCoef.ok) {
    return normalizedCoef;
  }

  await db
    .update(ahspCompositions)
    .set({ coefficient: normalizedCoef.value, updatedAt: new Date() })
    .where(eq(ahspCompositions.id, input.id));
  revalidatePath('/master');
  return { ok: true, data: undefined };
}

export async function deleteAhspComposition(id: string): Promise<ActionResult> {
  await db.delete(ahspCompositions).where(eq(ahspCompositions.id, id));
  revalidatePath('/master');
  return { ok: true, data: undefined };
}

function cellToText(val: ExcelJS.CellValue): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'object') {
    if ('result' in val && val.result !== undefined && val.result !== null) {
      return String(val.result).trim();
    }
    if ('text' in val && typeof val.text === 'string') {
      return val.text.trim();
    }
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText.map((r) => r.text).join('').trim();
    }
  }
  return String(val).trim();
}

export async function importMasterExcelAction(
  formData: FormData
): Promise<
  ActionResult<{
    resourcesUpserted: number;
    pricesUpserted: number;
    compositionsUpserted: number;
  }>
> {
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { ok: false, error: 'Pilih file .xlsx terlebih dahulu.' };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    let resourcesUpserted = 0;
    let pricesUpserted = 0;
    let compositionsUpserted = 0;

    await db.transaction(async (tx) => {
      // 1. Sheet: Resources
      const resSheet = workbook.getWorksheet('Resources');
      if (resSheet) {
        const rows = resSheet.getSheetValues();
        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;
          const code = cellToText(row[1] as ExcelJS.CellValue);
          const name = cellToText(row[2] as ExcelJS.CellValue);
          const rawType = cellToText(row[3] as ExcelJS.CellValue).toUpperCase();
          const unit = cellToText(row[4] as ExcelJS.CellValue);
          const activeRaw = cellToText(row[5] as ExcelJS.CellValue).toUpperCase();
          if (!code || !name || !unit) continue;

          const type: ResourceType =
            rawType === 'LABOR' || rawType === 'EQUIPMENT'
              ? rawType
              : 'MATERIAL';
          const isActive = activeRaw === 'FALSE' ? false : true;

          await tx
            .insert(masterResources)
            .values({ code, name, type, unit, isActive })
            .onConflictDoUpdate({
              target: masterResources.code,
              set: { name, type, unit, isActive, updatedAt: new Date() },
            });
          resourcesUpserted += 1;
        }
      }

      // Reload resource & region maps for foreign key lookup
      const allResources = await tx.select().from(masterResources);
      const resourceByCode = new Map(allResources.map((r) => [r.code, r]));
      const allRegions = await tx.select().from(regions);
      const regionByName = new Map(allRegions.map((r) => [r.name, r]));

      // 2. Sheet: Regional_Prices
      const priceSheet = workbook.getWorksheet('Regional_Prices');
      if (priceSheet) {
        const rows = priceSheet.getSheetValues();
        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;
          const resCode = cellToText(row[1] as ExcelJS.CellValue);
          const regName = cellToText(row[2] as ExcelJS.CellValue);
          const effDate = cellToText(row[3] as ExcelJS.CellValue);
          const priceStr = cellToText(row[4] as ExcelJS.CellValue);
          if (!resCode || !regName || !effDate || !priceStr) continue;
          if (!ISO_DATE_RE.test(effDate)) {
            throw new Error(
              `Baris ${i} Regional_Prices: tanggal efektif "${effDate}" harus format YYYY-MM-DD.`
            );
          }

          const res = resourceByCode.get(resCode);
          if (!res) {
            throw new Error(
              `Baris ${i} Regional_Prices: kode resource "${resCode}" tidak ditemukan.`
            );
          }

          let reg = regionByName.get(regName);
          if (!reg) {
            const [createdReg] = await tx
              .insert(regions)
              .values({ name: regName, isActive: true })
              .returning();
            reg = createdReg;
            regionByName.set(regName, reg);
          }

          const norm = normalizeDecimalString(priceStr, 2, `Harga (${resCode})`);
          if (!norm.ok) throw new Error(norm.error);

          await tx
            .insert(resourcePrices)
            .values({
              resourceId: res.id,
              regionId: reg.id,
              effectiveDate: effDate,
              basePrice: norm.value,
            })
            .onConflictDoUpdate({
              target: [
                resourcePrices.resourceId,
                resourcePrices.regionId,
                resourcePrices.effectiveDate,
              ],
              set: { basePrice: norm.value, updatedAt: new Date() },
            });
          pricesUpserted += 1;
        }
      }

      // 3. Sheet: AHSP_Compositions
      const ahspSheet = workbook.getWorksheet('AHSP_Compositions');
      if (ahspSheet) {
        const allAhsps = await tx.select().from(masterAhsp);
        const ahspByCode = new Map(allAhsps.map((a) => [a.code, a]));
        const rows = ahspSheet.getSheetValues();
        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;
          const ahspCode = cellToText(row[1] as ExcelJS.CellValue);
          const ahspName = cellToText(row[2] as ExcelJS.CellValue);
          const ahspUnit = cellToText(row[3] as ExcelJS.CellValue);
          const resCode = cellToText(row[4] as ExcelJS.CellValue);
          const coefStr = cellToText(row[5] as ExcelJS.CellValue);
          if (!ahspCode || !ahspName || !ahspUnit || !resCode || !coefStr) {
            continue;
          }

          let ahsp = ahspByCode.get(ahspCode);
          if (!ahsp) {
            const [createdAhsp] = await tx
              .insert(masterAhsp)
              .values({
                code: ahspCode,
                name: ahspName,
                unit: ahspUnit,
                isActive: true,
              })
              .returning();
            ahsp = createdAhsp;
            ahspByCode.set(ahspCode, ahsp);
          } else {
            await tx
              .update(masterAhsp)
              .set({ name: ahspName, unit: ahspUnit, updatedAt: new Date() })
              .where(eq(masterAhsp.id, ahsp.id));
          }

          const res = resourceByCode.get(resCode);
          if (!res) {
            throw new Error(
              `Baris ${i} AHSP_Compositions: kode resource "${resCode}" tidak ditemukan.`
            );
          }

          const normCoef = normalizeDecimalString(
            coefStr,
            4,
            `Koefisien (${ahspCode} / ${resCode})`
          );
          if (!normCoef.ok) throw new Error(normCoef.error);

          await tx
            .insert(ahspCompositions)
            .values({
              ahspId: ahsp.id,
              resourceId: res.id,
              coefficient: normCoef.value,
            })
            .onConflictDoUpdate({
              target: [ahspCompositions.ahspId, ahspCompositions.resourceId],
              set: { coefficient: normCoef.value, updatedAt: new Date() },
            });
          compositionsUpserted += 1;
        }
      }
    });

    revalidatePath('/master');
    revalidatePath('/projects');
    return {
      ok: true,
      data: { resourcesUpserted, pricesUpserted, compositionsUpserted },
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Gagal mengimpor file Excel Master Data.',
    };
  }
}
