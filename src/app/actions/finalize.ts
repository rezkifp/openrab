'use server';

import { revalidatePath } from 'next/cache';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import {
  ahspCompositions,
  db,
  masterAhsp,
  masterResources,
  projects,
  projectTakeoffs,
  projectWbs,
  regions,
  resourcePrices,
  takeoffSnapshots,
} from '@/db';
import { calcVolume } from '@/lib/rab/calc';
import { pickEffectivePrice } from '@/lib/rab/pricing';
import { buildWbsPathMap } from '@/lib/rab/workspace-calc';

export type FinalizeActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function finalizeProject(
  projectId: string
): Promise<FinalizeActionResult> {
  try {
    await db.transaction(async (tx) => {
      // Lock row FOR UPDATE inside single transaction
      const locked = await tx.execute(
        sql`SELECT id, name, region_id, status, price_date
            FROM openrab.projects
            WHERE id = ${projectId}
            FOR UPDATE`
      );

      if (locked.rows.length === 0) {
        throw new Error('Proyek tidak ditemukan.');
      }

      const projRow = locked.rows[0] as {
        id: string;
        name: string;
        region_id: string;
        status: string;
        price_date: string;
      };

      if (projRow.status !== 'DRAFT') {
        throw new Error(
          'PROYEK_TERKUNCI: Proyek sudah berstatus FINALIZED dan tidak dapat difinalisasi ulang.'
        );
      }

      const [region] = await tx
        .select()
        .from(regions)
        .where(eq(regions.id, projRow.region_id));

      if (!region) {
        throw new Error('Wilayah proyek tidak ditemukan.');
      }

      const wbsRows = await tx
        .select()
        .from(projectWbs)
        .where(eq(projectWbs.projectId, projectId))
        .orderBy(asc(projectWbs.sortOrder), asc(projectWbs.createdAt));

      if (wbsRows.length === 0) {
        throw new Error('Minimal harus ada 1 WBS dan 1 baris takeoff sebelum finalisasi.');
      }

      const wbsIds = wbsRows.map((w) => w.id);
      const takeoffRows = await tx
        .select()
        .from(projectTakeoffs)
        .where(inArray(projectTakeoffs.wbsId, wbsIds))
        .orderBy(asc(projectTakeoffs.sortOrder), asc(projectTakeoffs.createdAt));

      if (takeoffRows.length === 0) {
        throw new Error(
          'Gagal Finalize: Proyek harus memiliki minimal 1 baris takeoff.'
        );
      }

      const ahspIds = Array.from(new Set(takeoffRows.map((t) => t.ahspId)));
      const [ahspRows, compRows] = await Promise.all([
        tx.select().from(masterAhsp).where(inArray(masterAhsp.id, ahspIds)),
        tx
          .select()
          .from(ahspCompositions)
          .where(inArray(ahspCompositions.ahspId, ahspIds)),
      ]);

      const ahspMap = new Map(ahspRows.map((a) => [a.id, a]));
      const compsByAhsp = new Map<string, typeof compRows>();
      for (const c of compRows) {
        const arr = compsByAhsp.get(c.ahspId);
        if (arr) arr.push(c);
        else compsByAhsp.set(c.ahspId, [c]);
      }

      const resourceIds = Array.from(new Set(compRows.map((c) => c.resourceId)));
      const [resourceRows, priceRows] =
        resourceIds.length > 0
          ? await Promise.all([
              tx
                .select()
                .from(masterResources)
                .where(inArray(masterResources.id, resourceIds)),
              tx
                .select()
                .from(resourcePrices)
                .where(inArray(resourcePrices.resourceId, resourceIds)),
            ])
          : [[], []];

      const resourceMap = new Map(resourceRows.map((r) => [r.id, r]));
      const pricesByResource = new Map<string, typeof priceRows>();
      for (const p of priceRows) {
        const arr = pricesByResource.get(p.resourceId);
        if (arr) arr.push(p);
        else pricesByResource.set(p.resourceId, [p]);
      }

      const wbsPathMap = buildWbsPathMap(wbsRows);
      const priceDateStr = String(projRow.price_date).slice(0, 10);

      const snapshotValues: Array<typeof takeoffSnapshots.$inferInsert> = [];

      for (const t of takeoffRows) {
        // Re-validate volume strictly
        const volDec = calcVolume({
          length: t.length,
          width: t.width,
          height: t.height,
          count: t.count === null ? null : String(t.count),
          deduction: t.deductionVolume,
        });
        const volStr = volDec.toString();

        const ahsp = ahspMap.get(t.ahspId);
        if (!ahsp) {
          throw new Error(`AHSP untuk item "${t.description}" tidak ditemukan.`);
        }

        const comps = compsByAhsp.get(t.ahspId) ?? [];
        if (comps.length === 0) {
          throw new Error(
            `Gagal Finalize: AHSP "${ahsp.name}" harus memiliki minimal 1 komposisi resource.`
          );
        }

        const wbsPath = wbsPathMap.get(t.wbsId) ?? 'WBS';

        for (const comp of comps) {
          const res = resourceMap.get(comp.resourceId);
          if (!res) {
            throw new Error(`Resource pada komposisi AHSP "${ahsp.name}" tidak ditemukan.`);
          }

          const resPrices = pricesByResource.get(comp.resourceId) ?? [];
          let effectivePrice: string;
          try {
            effectivePrice = pickEffectivePrice(
              resPrices,
              projRow.region_id,
              priceDateStr
            );
          } catch {
            throw new Error(
              `Gagal Finalize: harga ${res.name} tidak ada untuk wilayah/tanggal ini (${priceDateStr}).`
            );
          }

          snapshotValues.push({
            takeoffId: t.id,
            wbsPath,
            description: t.description,
            sortOrder: t.sortOrder,
            volume: volStr,
            ahspCode: ahsp.code,
            ahspName: ahsp.name,
            ahspUnit: ahsp.unit,
            resourceCode: res.code,
            resourceName: res.name,
            resourceUnit: res.unit,
            resourceType: res.type,
            coefficient: comp.coefficient,
            frozenPrice: effectivePrice,
          });
        }
      }

      await tx.insert(takeoffSnapshots).values(snapshotValues);

      await tx
        .update(projects)
        .set({
          status: 'FINALIZED',
          regionNameFrozen: region.name,
          finalizedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));
    });

    revalidatePath('/projects');
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Gagal memfinalisasi proyek.',
    };
  }
}

export async function duplicateProjectAsDraft(
  sourceProjectId: string,
  customSuffix?: string
): Promise<FinalizeActionResult<{ id: string }>> {
  try {
    const newProjectId = await db.transaction(async (tx) => {
      const [source] = await tx
        .select()
        .from(projects)
        .where(eq(projects.id, sourceProjectId));

      if (!source) {
        throw new Error('Proyek sumber tidak ditemukan.');
      }

      const todayIso = new Date().toISOString().slice(0, 10);
      const suffix =
        customSuffix && customSuffix.trim().length > 0
          ? customSuffix.trim()
          : '(salinan)';

      const [newProj] = await tx
        .insert(projects)
        .values({
          name: `${source.name} ${suffix}`,
          regionId: source.regionId,
          status: 'DRAFT',
          priceDate: todayIso,
          overheadProfitMargin: source.overheadProfitMargin,
          taxRatePpn: source.taxRatePpn,
          regionNameFrozen: null,
          finalizedAt: null,
          sourceProjectId: source.id,
          clientName: source.clientName,
          projectLocation: source.projectLocation,
          architectName: source.architectName,
          buildingAreaM2: source.buildingAreaM2,
        })
        .returning({ id: projects.id });

      const wbsRows = await tx
        .select()
        .from(projectWbs)
        .where(eq(projectWbs.projectId, sourceProjectId))
        .orderBy(asc(projectWbs.sortOrder), asc(projectWbs.createdAt));

      // Insert WBS parents before children via BFS levels
      const oldToNewWbs = new Map<string, string>();
      const remaining = [...wbsRows];
      let guard = 0;

      while (remaining.length > 0 && guard < 10) {
        guard += 1;
        const batch = remaining.filter(
          (w) => w.parentId === null || oldToNewWbs.has(w.parentId)
        );
        if (batch.length === 0) break;

        for (const w of batch) {
          const newParentId = w.parentId ? oldToNewWbs.get(w.parentId) ?? null : null;
          const [insertedWbs] = await tx
            .insert(projectWbs)
            .values({
              projectId: newProj.id,
              parentId: newParentId,
              name: w.name,
              sortOrder: w.sortOrder,
              startWeek: w.startWeek,
              durationWeeks: w.durationWeeks,
            })
            .returning({ id: projectWbs.id });
          oldToNewWbs.set(w.id, insertedWbs.id);
        }

        for (const b of batch) {
          const idx = remaining.indexOf(b);
          if (idx >= 0) remaining.splice(idx, 1);
        }
      }

      const sourceWbsIds = wbsRows.map((w) => w.id);
      const takeoffRows =
        sourceWbsIds.length > 0
          ? await tx
              .select()
              .from(projectTakeoffs)
              .where(inArray(projectTakeoffs.wbsId, sourceWbsIds))
              .orderBy(asc(projectTakeoffs.sortOrder), asc(projectTakeoffs.createdAt))
          : [];

      const takeoffIds = takeoffRows.map((t) => t.id);
      const snapRows =
        source.status === 'FINALIZED' && takeoffIds.length > 0
          ? await tx
              .select()
              .from(takeoffSnapshots)
              .where(inArray(takeoffSnapshots.takeoffId, takeoffIds))
          : [];

      const snapByTakeoff = new Map(snapRows.map((s) => [s.takeoffId, s]));

      for (const t of takeoffRows) {
        const targetWbsId = oldToNewWbs.get(t.wbsId);
        if (!targetWbsId) continue;

        const snap = snapByTakeoff.get(t.id);
        const description =
          source.status === 'FINALIZED' && snap ? snap.description : t.description;
        const sortOrder =
          source.status === 'FINALIZED' && snap ? snap.sortOrder : t.sortOrder;

        const recalculatedVol = calcVolume({
          length: t.length,
          width: t.width,
          height: t.height,
          count: t.count === null ? null : String(t.count),
          deduction: t.deductionVolume,
        }).toString();

        await tx.insert(projectTakeoffs).values({
          wbsId: targetWbsId,
          ahspId: t.ahspId,
          description,
          sortOrder,
          length: t.length,
          width: t.width,
          height: t.height,
          count: t.count,
          deductionVolume: t.deductionVolume,
          calculatedVolume: recalculatedVol,
          subItemsJson: t.subItemsJson,
        });
      }

      return newProj.id;
    });

    revalidatePath('/projects');
    return { ok: true, data: { id: newProjectId } };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : 'Gagal menduplikasi proyek sebagai DRAFT.',
    };
  }
}
