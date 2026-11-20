'use server';

import Decimal from 'decimal.js';
import { revalidatePath } from 'next/cache';
import { asc, desc, eq, inArray, ne } from 'drizzle-orm';
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
import {
  RabValidationError,
  calcFeasibilityEstimate,
  calcProjectComparison,
  calcSubTakeoffBreakdown,
  calcVolume,
  type ComparisonRowInput,
  type FinishingGrade,
  type ProjectComparisonResult,
  type SnapshotCalcRow,
  type SubTakeoffItemInput,
} from '@/lib/rab/calc';
import { hasAnyDummyMarker } from '@/lib/rab/format';
import {
  buildWbsPathMap,
  computeDraftWorkspace,
  computeFinalizedWorkspace,
  type ComputedWorkspaceState,
  type WorkspaceAhspItem,
  type WorkspaceCompositionItem,
  type WorkspacePriceItem,
  type WorkspaceProject,
  type WorkspaceRegion,
  type WorkspaceTakeoffRow,
  type WorkspaceWbsNode,
} from '@/lib/rab/workspace-calc';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP, precision: 40 });

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Single server-side guard enforcing immutability of FINALIZED projects.
 * Must be called at the start of every mutation on projects, project_wbs, and project_takeoffs.
 */
export async function assertDraft(projectId: string, dbConn = db): Promise<void> {
  const [proj] = await dbConn
    .select({ id: projects.id, status: projects.status })
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!proj) {
    throw new Error('Proyek tidak ditemukan.');
  }

  if (proj.status === 'FINALIZED') {
    throw new Error(
      'PROYEK_TERKUNCI: Proyek berstatus FINALIZED tidak dapat diubah. Gunakan fitur "Duplicate as DRAFT" untuk membuat salinan revisi.'
    );
  }
}

function normalizeDimInput(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeRatePercent(
  raw: string,
  label: string
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: `${label} wajib diisi.` };
  }
  try {
    const d = new Decimal(trimmed);
    if (!d.isFinite() || d.lt(0)) {
      return { ok: false, error: `${label} tidak boleh bernilai negatif.` };
    }
    return { ok: true, value: d.toFixed(2, Decimal.ROUND_HALF_UP) };
  } catch {
    return { ok: false, error: `${label} harus berupa angka yang valid.` };
  }
}

export interface ProjectListItem {
  id: string;
  name: string;
  regionName: string;
  status: 'DRAFT' | 'FINALIZED';
  priceDate: string;
  overheadProfitMargin: string;
  taxRatePpn: string;
  grandTotal: string | null;
  hasMissingPrice: boolean;
  takeoffCount: number;
  sourceProjectId: string | null;
  isDummy: boolean;
}

export interface PeerProjectSummary {
  id: string;
  name: string;
  status: 'DRAFT' | 'FINALIZED';
  priceDate: string;
  grandTotal: string | null;
}

export interface WorkspacePayload {
  project: WorkspaceProject;
  regions: WorkspaceRegion[];
  wbsList: WorkspaceWbsNode[];
  takeoffs: WorkspaceTakeoffRow[];
  ahsps: WorkspaceAhspItem[];
  compositions: WorkspaceCompositionItem[];
  prices: WorkspacePriceItem[];
  snapshots: SnapshotCalcRow[];
  computed: ComputedWorkspaceState;
  peerProjects: PeerProjectSummary[];
  hasDummy: boolean;
}

export async function getProjectsList(): Promise<{
  projects: ProjectListItem[];
  regions: WorkspaceRegion[];
  hasDummy: boolean;
}> {
  const [projRows, regionRows, wbsRows, takeoffRows, ahspRows, compRows, priceRows, resourceRows] =
    await Promise.all([
      db.select().from(projects).orderBy(desc(projects.createdAt)),
      db.select().from(regions).orderBy(asc(regions.name)),
      db.select().from(projectWbs),
      db.select().from(projectTakeoffs),
      db.select().from(masterAhsp),
      db.select().from(ahspCompositions),
      db.select().from(resourcePrices),
      db.select().from(masterResources),
    ]);

  const regionMap = new Map(regionRows.map((r) => [r.id, r]));
  const resourceMap = new Map(resourceRows.map((r) => [r.id, r]));
  const wbsToProject = new Map(wbsRows.map((w) => [w.id, w.projectId]));

  const takeoffsByProject = new Map<string, WorkspaceTakeoffRow[]>();
  const allTakeoffIds: string[] = [];
  for (const t of takeoffRows) {
    allTakeoffIds.push(t.id);
    const pid = wbsToProject.get(t.wbsId);
    if (!pid) continue;
    const item: WorkspaceTakeoffRow = {
      id: t.id,
      wbsId: t.wbsId,
      ahspId: t.ahspId,
      description: t.description,
      sortOrder: t.sortOrder,
      length: t.length,
      width: t.width,
      height: t.height,
      count: t.count === null ? null : String(t.count),
      deductionVolume: t.deductionVolume,
      calculatedVolume: t.calculatedVolume,
      subItemsJson: t.subItemsJson,
    };
    const arr = takeoffsByProject.get(pid);
    if (arr) arr.push(item);
    else takeoffsByProject.set(pid, [item]);
  }

  const snapRows =
    allTakeoffIds.length > 0
      ? await db
          .select()
          .from(takeoffSnapshots)
          .where(inArray(takeoffSnapshots.takeoffId, allTakeoffIds))
      : [];

  const snapsByProject = new Map<string, SnapshotCalcRow[]>();
  for (const s of snapRows) {
    const t = takeoffRows.find((row) => row.id === s.takeoffId);
    const pid = t ? wbsToProject.get(t.wbsId) : undefined;
    if (!pid) continue;
    const item: SnapshotCalcRow = {
      takeoffId: s.takeoffId,
      wbsPath: s.wbsPath,
      description: s.description,
      sortOrder: s.sortOrder,
      volume: s.volume,
      ahspCode: s.ahspCode,
      ahspName: s.ahspName,
      ahspUnit: s.ahspUnit,
      resourceCode: s.resourceCode,
      resourceName: s.resourceName,
      resourceUnit: s.resourceUnit,
      resourceType: s.resourceType,
      coefficient: s.coefficient,
      frozenPrice: s.frozenPrice,
    };
    const arr = snapsByProject.get(pid);
    if (arr) arr.push(item);
    else snapsByProject.set(pid, [item]);
  }

  const compItems: WorkspaceCompositionItem[] = compRows.map((c) => {
    const res = resourceMap.get(c.resourceId);
    return {
      id: c.id,
      ahspId: c.ahspId,
      resourceId: c.resourceId,
      resourceCode: res?.code ?? '',
      resourceName: res?.name ?? 'Unknown Resource',
      resourceUnit: res?.unit ?? '',
      resourceType: res?.type ?? 'MATERIAL',
      coefficient: c.coefficient,
    };
  });

  const list: ProjectListItem[] = projRows.map((p) => {
    const reg = regionMap.get(p.regionId);
    const regionName =
      p.status === 'FINALIZED' && p.regionNameFrozen
        ? p.regionNameFrozen
        : reg?.name ?? '-';
    const projWbs: WorkspaceWbsNode[] = wbsRows
      .filter((w) => w.projectId === p.id)
      .map((w) => ({
        id: w.id,
        projectId: w.projectId,
        parentId: w.parentId,
        name: w.name,
        sortOrder: w.sortOrder,
        startWeek: w.startWeek,
        durationWeeks: w.durationWeeks,
      }));
    const projTakeoffs = takeoffsByProject.get(p.id) ?? [];

    const wsProj: WorkspaceProject = {
      id: p.id,
      name: p.name,
      regionId: p.regionId,
      regionName,
      status: p.status,
      priceDate: p.priceDate,
      overheadProfitMargin: p.overheadProfitMargin,
      taxRatePpn: p.taxRatePpn,
      regionNameFrozen: p.regionNameFrozen,
      finalizedAt: p.finalizedAt ? p.finalizedAt.toISOString() : null,
      sourceProjectId: p.sourceProjectId,
      clientName: p.clientName,
      projectLocation: p.projectLocation,
      architectName: p.architectName,
      buildingAreaM2: p.buildingAreaM2,
    };

    const computed =
      p.status === 'FINALIZED'
        ? computeFinalizedWorkspace({
            project: wsProj,
            wbsList: projWbs,
            takeoffs: projTakeoffs,
            snapshots: snapsByProject.get(p.id) ?? [],
          })
        : computeDraftWorkspace({
            project: wsProj,
            wbsList: projWbs,
            takeoffs: projTakeoffs,
            ahsps: ahspRows,
            compositions: compItems,
            prices: priceRows,
          });

    const isDummy = hasAnyDummyMarker([p.name, regionName]);

    return {
      id: p.id,
      name: p.name,
      regionName,
      status: p.status,
      priceDate: p.priceDate,
      overheadProfitMargin: p.overheadProfitMargin,
      taxRatePpn: p.taxRatePpn,
      grandTotal: computed.totals?.grandTotal ?? null,
      hasMissingPrice: computed.priceErrors.length > 0,
      takeoffCount: projTakeoffs.length,
      sourceProjectId: p.sourceProjectId,
      isDummy,
    };
  });

  const hasDummy = hasAnyDummyMarker([
    ...regionRows.filter((r) => r.isActive).map((r) => r.name),
    ...resourceRows.filter((r) => r.isActive).flatMap((r) => [r.code, r.name]),
    ...ahspRows.filter((a) => a.isActive).flatMap((a) => [a.code, a.name]),
  ]);

  return {
    projects: list,
    regions: regionRows.map((r) => ({
      id: r.id,
      name: r.name,
      isActive: r.isActive,
    })),
    hasDummy,
  };
}

export async function getProjectWorkspace(
  projectId: string
): Promise<WorkspacePayload | null> {
  const [projRow] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!projRow) {
    return null;
  }

  const [regionRows, wbsRows, ahspRows, compRows, priceRows, resourceRows, peerProjRows] =
    await Promise.all([
      db.select().from(regions).orderBy(asc(regions.name)),
      db
        .select()
        .from(projectWbs)
        .where(eq(projectWbs.projectId, projectId))
        .orderBy(asc(projectWbs.sortOrder), asc(projectWbs.createdAt)),
      db.select().from(masterAhsp).orderBy(asc(masterAhsp.code)),
      db.select().from(ahspCompositions),
      db.select().from(resourcePrices),
      db.select().from(masterResources),
      db
        .select()
        .from(projects)
        .where(ne(projects.id, projectId))
        .orderBy(desc(projects.createdAt)),
    ]);

  const wbsIds = wbsRows.map((w) => w.id);
  const takeoffRows =
    wbsIds.length > 0
      ? await db
          .select()
          .from(projectTakeoffs)
          .where(inArray(projectTakeoffs.wbsId, wbsIds))
          .orderBy(asc(projectTakeoffs.sortOrder), asc(projectTakeoffs.createdAt))
      : [];

  const takeoffIds = takeoffRows.map((t) => t.id);
  const snapRows =
    projRow.status === 'FINALIZED' && takeoffIds.length > 0
      ? await db
          .select()
          .from(takeoffSnapshots)
          .where(inArray(takeoffSnapshots.takeoffId, takeoffIds))
          .orderBy(asc(takeoffSnapshots.sortOrder))
      : [];

  const regionMap = new Map(regionRows.map((r) => [r.id, r]));
  const resourceMap = new Map(resourceRows.map((r) => [r.id, r]));
  const reg = regionMap.get(projRow.regionId);
  const regionName =
    projRow.status === 'FINALIZED' && projRow.regionNameFrozen
      ? projRow.regionNameFrozen
      : reg?.name ?? '-';

  const project: WorkspaceProject = {
    id: projRow.id,
    name: projRow.name,
    regionId: projRow.regionId,
    regionName,
    status: projRow.status,
    priceDate: projRow.priceDate,
    overheadProfitMargin: projRow.overheadProfitMargin,
    taxRatePpn: projRow.taxRatePpn,
    regionNameFrozen: projRow.regionNameFrozen,
    finalizedAt: projRow.finalizedAt ? projRow.finalizedAt.toISOString() : null,
    sourceProjectId: projRow.sourceProjectId,
    clientName: projRow.clientName,
    projectLocation: projRow.projectLocation,
    architectName: projRow.architectName,
    buildingAreaM2: projRow.buildingAreaM2,
  };

  const wbsList: WorkspaceWbsNode[] = wbsRows.map((w) => ({
    id: w.id,
    projectId: w.projectId,
    parentId: w.parentId,
    name: w.name,
    sortOrder: w.sortOrder,
    startWeek: w.startWeek,
    durationWeeks: w.durationWeeks,
  }));

  const takeoffs: WorkspaceTakeoffRow[] = takeoffRows.map((t) => ({
    id: t.id,
    wbsId: t.wbsId,
    ahspId: t.ahspId,
    description: t.description,
    sortOrder: t.sortOrder,
    length: t.length,
    width: t.width,
    height: t.height,
    count: t.count === null ? null : String(t.count),
    deductionVolume: t.deductionVolume,
    calculatedVolume: t.calculatedVolume,
    subItemsJson: t.subItemsJson,
  }));

  const compositions: WorkspaceCompositionItem[] = compRows.map((c) => {
    const res = resourceMap.get(c.resourceId);
    return {
      id: c.id,
      ahspId: c.ahspId,
      resourceId: c.resourceId,
      resourceCode: res?.code ?? '',
      resourceName: res?.name ?? 'Unknown Resource',
      resourceUnit: res?.unit ?? '',
      resourceType: res?.type ?? 'MATERIAL',
      coefficient: c.coefficient,
    };
  });

  const snapshots: SnapshotCalcRow[] = snapRows.map((s) => ({
    takeoffId: s.takeoffId,
    wbsPath: s.wbsPath,
    description: s.description,
    sortOrder: s.sortOrder,
    volume: s.volume,
    ahspCode: s.ahspCode,
    ahspName: s.ahspName,
    ahspUnit: s.ahspUnit,
    resourceCode: s.resourceCode,
    resourceName: s.resourceName,
    resourceUnit: s.resourceUnit,
    resourceType: s.resourceType,
    coefficient: s.coefficient,
    frozenPrice: s.frozenPrice,
  }));

  const computed =
    project.status === 'FINALIZED'
      ? computeFinalizedWorkspace({
          project,
          wbsList,
          takeoffs,
          snapshots,
        })
      : computeDraftWorkspace({
          project,
          wbsList,
          takeoffs,
          ahsps: ahspRows,
          compositions,
          prices: priceRows,
        });

  const hasDummy =
    project.status === 'FINALIZED'
      ? hasAnyDummyMarker([
          project.name,
          project.regionName,
          ...snapshots.flatMap((s) => [
            s.description,
            s.ahspCode,
            s.ahspName,
            s.resourceCode,
            s.resourceName,
          ]),
        ])
      : hasAnyDummyMarker([
          project.name,
          project.regionName,
          ...takeoffs.map((t) => t.description),
          ...ahspRows
            .filter((a) => takeoffs.some((t) => t.ahspId === a.id))
            .flatMap((a) => [a.code, a.name]),
          ...compositions
            .filter((c) => takeoffs.some((t) => t.ahspId === c.ahspId))
            .flatMap((c) => [c.resourceCode, c.resourceName]),
        ]);

  // Compute lightweight peerProjects summaries for Value Engineering & Addendum comparison
  const peerIds = peerProjRows.map((p) => p.id);
  const peerWbsRows =
    peerIds.length > 0
      ? await db
          .select()
          .from(projectWbs)
          .where(inArray(projectWbs.projectId, peerIds))
      : [];
  const peerWbsIds = peerWbsRows.map((w) => w.id);
  const peerTakeoffRows =
    peerWbsIds.length > 0
      ? await db
          .select()
          .from(projectTakeoffs)
          .where(inArray(projectTakeoffs.wbsId, peerWbsIds))
      : [];
  const peerTakeoffIds = peerTakeoffRows.map((t) => t.id);
  const peerSnapRows =
    peerTakeoffIds.length > 0
      ? await db
          .select()
          .from(takeoffSnapshots)
          .where(inArray(takeoffSnapshots.takeoffId, peerTakeoffIds))
      : [];

  const peerWbsToProject = new Map(peerWbsRows.map((w) => [w.id, w.projectId]));
  const peerTakeoffsByProj = new Map<string, WorkspaceTakeoffRow[]>();
  for (const t of peerTakeoffRows) {
    const pid = peerWbsToProject.get(t.wbsId);
    if (!pid) continue;
    const item: WorkspaceTakeoffRow = {
      id: t.id,
      wbsId: t.wbsId,
      ahspId: t.ahspId,
      description: t.description,
      sortOrder: t.sortOrder,
      length: t.length,
      width: t.width,
      height: t.height,
      count: t.count === null ? null : String(t.count),
      deductionVolume: t.deductionVolume,
      calculatedVolume: t.calculatedVolume,
      subItemsJson: t.subItemsJson,
    };
    const arr = peerTakeoffsByProj.get(pid);
    if (arr) arr.push(item);
    else peerTakeoffsByProj.set(pid, [item]);
  }
  const peerSnapsByProj = new Map<string, SnapshotCalcRow[]>();
  const peerTakeoffToWbs = new Map(peerTakeoffRows.map((t) => [t.id, t.wbsId]));
  for (const s of peerSnapRows) {
    const wId = peerTakeoffToWbs.get(s.takeoffId);
    const pid = wId ? peerWbsToProject.get(wId) : undefined;
    if (!pid) continue;
    const item: SnapshotCalcRow = {
      takeoffId: s.takeoffId,
      wbsPath: s.wbsPath,
      description: s.description,
      sortOrder: s.sortOrder,
      volume: s.volume,
      ahspCode: s.ahspCode,
      ahspName: s.ahspName,
      ahspUnit: s.ahspUnit,
      resourceCode: s.resourceCode,
      resourceName: s.resourceName,
      resourceUnit: s.resourceUnit,
      resourceType: s.resourceType,
      coefficient: s.coefficient,
      frozenPrice: s.frozenPrice,
    };
    const arr = peerSnapsByProj.get(pid);
    if (arr) arr.push(item);
    else peerSnapsByProj.set(pid, [item]);
  }

  const peerProjects: PeerProjectSummary[] = peerProjRows.map((p) => {
    const pWbs: WorkspaceWbsNode[] = peerWbsRows
      .filter((w) => w.projectId === p.id)
      .map((w) => ({
        id: w.id,
        projectId: w.projectId,
        parentId: w.parentId,
        name: w.name,
        sortOrder: w.sortOrder,
        startWeek: w.startWeek,
        durationWeeks: w.durationWeeks,
      }));
    const pTakeoffs = peerTakeoffsByProj.get(p.id) ?? [];
    const pReg = regionMap.get(p.regionId);
    const pRegName =
      p.status === 'FINALIZED' && p.regionNameFrozen
        ? p.regionNameFrozen
        : pReg?.name ?? '-';
    const pWsProj: WorkspaceProject = {
      id: p.id,
      name: p.name,
      regionId: p.regionId,
      regionName: pRegName,
      status: p.status,
      priceDate: p.priceDate,
      overheadProfitMargin: p.overheadProfitMargin,
      taxRatePpn: p.taxRatePpn,
      regionNameFrozen: p.regionNameFrozen,
      finalizedAt: p.finalizedAt ? p.finalizedAt.toISOString() : null,
      sourceProjectId: p.sourceProjectId,
      clientName: p.clientName,
      projectLocation: p.projectLocation,
      architectName: p.architectName,
      buildingAreaM2: p.buildingAreaM2,
    };
    const pComp =
      p.status === 'FINALIZED'
        ? computeFinalizedWorkspace({
            project: pWsProj,
            wbsList: pWbs,
            takeoffs: pTakeoffs,
            snapshots: peerSnapsByProj.get(p.id) ?? [],
          })
        : computeDraftWorkspace({
            project: pWsProj,
            wbsList: pWbs,
            takeoffs: pTakeoffs,
            ahsps: ahspRows,
            compositions,
            prices: priceRows,
          });
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      priceDate: p.priceDate,
      grandTotal: pComp.totals?.grandTotal ?? null,
    };
  });

  return {
    project,
    regions: regionRows.map((r) => ({
      id: r.id,
      name: r.name,
      isActive: r.isActive,
    })),
    wbsList,
    takeoffs,
    ahsps: ahspRows.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      unit: a.unit,
      isActive: a.isActive,
    })),
    compositions,
    prices: priceRows.map((p) => ({
      id: p.id,
      resourceId: p.resourceId,
      regionId: p.regionId,
      basePrice: p.basePrice,
      effectiveDate: p.effectiveDate,
    })),
    snapshots,
    computed,
    peerProjects,
    hasDummy,
  };
}

export async function createProject(input: {
  name: string;
  regionId: string;
  priceDate: string;
  overheadProfitMargin: string;
  taxRatePpn: string;
  clientName?: string | null;
  projectLocation?: string | null;
  architectName?: string | null;
  buildingAreaM2?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: 'Nama proyek wajib diisi.' };
  }
  if (!ISO_DATE_RE.test(input.priceDate)) {
    return { ok: false, error: 'Tanggal harga harus berformat YYYY-MM-DD.' };
  }

  const ohp = normalizeRatePercent(input.overheadProfitMargin, 'Margin OHP');
  if (!ohp.ok) return ohp;
  const ppn = normalizeRatePercent(input.taxRatePpn, 'Tarif PPN');
  if (!ppn.ok) return ppn;

  let areaM2: string | null = null;
  if (input.buildingAreaM2 && input.buildingAreaM2.trim() !== '') {
    const areaCheck = normalizeRatePercent(input.buildingAreaM2, 'Luas Bangunan');
    if (!areaCheck.ok) return areaCheck;
    areaM2 = areaCheck.value;
  }

  const created = await db.transaction(async (tx) => {
    const [proj] = await tx
      .insert(projects)
      .values({
        name,
        regionId: input.regionId,
        status: 'DRAFT',
        priceDate: input.priceDate,
        overheadProfitMargin: ohp.value,
        taxRatePpn: ppn.value,
        clientName: input.clientName?.trim() || null,
        projectLocation: input.projectLocation?.trim() || null,
        architectName: input.architectName?.trim() || null,
        buildingAreaM2: areaM2,
      })
      .returning({ id: projects.id });

    await tx.insert(projectWbs).values({
      projectId: proj.id,
      parentId: null,
      name: 'Pekerjaan Utama',
      sortOrder: 1,
    });

    return proj;
  });

  revalidatePath('/projects');
  return { ok: true, data: { id: created.id } };
}

export async function updateProjectMeta(input: {
  projectId: string;
  name: string;
  regionId: string;
  priceDate: string;
  overheadProfitMargin: string;
  taxRatePpn: string;
  clientName?: string | null;
  projectLocation?: string | null;
  architectName?: string | null;
  buildingAreaM2?: string | null;
}): Promise<ActionResult> {
  try {
    await assertDraft(input.projectId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Proyek terkunci.',
    };
  }

  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: 'Nama proyek wajib diisi.' };
  }
  if (!ISO_DATE_RE.test(input.priceDate)) {
    return { ok: false, error: 'Tanggal harga harus berformat YYYY-MM-DD.' };
  }

  const ohp = normalizeRatePercent(input.overheadProfitMargin, 'Margin OHP');
  if (!ohp.ok) return ohp;
  const ppn = normalizeRatePercent(input.taxRatePpn, 'Tarif PPN');
  if (!ppn.ok) return ppn;

  let areaM2: string | null = null;
  if (input.buildingAreaM2 && input.buildingAreaM2.trim() !== '') {
    const areaCheck = normalizeRatePercent(input.buildingAreaM2, 'Luas Bangunan');
    if (!areaCheck.ok) return areaCheck;
    areaM2 = areaCheck.value;
  }

  await db
    .update(projects)
    .set({
      name,
      regionId: input.regionId,
      priceDate: input.priceDate,
      overheadProfitMargin: ohp.value,
      taxRatePpn: ppn.value,
      clientName: input.clientName?.trim() || null,
      projectLocation: input.projectLocation?.trim() || null,
      architectName: input.architectName?.trim() || null,
      buildingAreaM2: areaM2,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, input.projectId));

  revalidatePath('/projects');
  revalidatePath(`/projects/${input.projectId}`);
  return { ok: true, data: undefined };
}

export async function deleteDraftProject(
  projectId: string
): Promise<ActionResult> {
  try {
    await assertDraft(projectId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Proyek terkunci.',
    };
  }

  await db.delete(projects).where(eq(projects.id, projectId));
  revalidatePath('/projects');
  return { ok: true, data: undefined };
}

export async function createWbsNode(input: {
  projectId: string;
  parentId: string | null;
  name: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    await assertDraft(input.projectId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Proyek terkunci.',
    };
  }

  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: 'Nama node WBS wajib diisi.' };
  }

  const allNodes = await db
    .select()
    .from(projectWbs)
    .where(eq(projectWbs.projectId, input.projectId));

  const byId = new Map(allNodes.map((n) => [n.id, n]));

  // Compute depth (root = 1)
  let depth = 1;
  let cursor = input.parentId;
  while (cursor) {
    const parent = byId.get(cursor);
    if (!parent) {
      return { ok: false, error: 'Parent WBS tidak ditemukan di proyek ini.' };
    }
    depth += 1;
    cursor = parent.parentId;
    if (depth > 6) break;
  }

  if (depth > 5) {
    return {
      ok: false,
      error: 'Kedalaman WBS maksimal 5 level.',
    };
  }

  const siblings = allNodes.filter((n) => n.parentId === input.parentId);
  const maxOrder = siblings.reduce(
    (max, s) => (s.sortOrder > max ? s.sortOrder : max),
    0
  );

  const [created] = await db
    .insert(projectWbs)
    .values({
      projectId: input.projectId,
      parentId: input.parentId,
      name,
      sortOrder: maxOrder + 1,
    })
    .returning({ id: projectWbs.id });

  revalidatePath(`/projects/${input.projectId}`);
  return { ok: true, data: { id: created.id } };
}

export async function renameWbsNode(input: {
  wbsId: string;
  name: string;
}): Promise<ActionResult> {
  const [node] = await db
    .select()
    .from(projectWbs)
    .where(eq(projectWbs.id, input.wbsId));

  if (!node) {
    return { ok: false, error: 'Node WBS tidak ditemukan.' };
  }

  try {
    await assertDraft(node.projectId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Proyek terkunci.',
    };
  }

  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: 'Nama node WBS wajib diisi.' };
  }

  await db
    .update(projectWbs)
    .set({ name, updatedAt: new Date() })
    .where(eq(projectWbs.id, input.wbsId));

  revalidatePath(`/projects/${node.projectId}`);
  return { ok: true, data: undefined };
}

export async function moveWbsNode(input: {
  wbsId: string;
  direction: 'UP' | 'DOWN';
}): Promise<ActionResult> {
  const [node] = await db
    .select()
    .from(projectWbs)
    .where(eq(projectWbs.id, input.wbsId));

  if (!node) {
    return { ok: false, error: 'Node WBS tidak ditemukan.' };
  }

  try {
    await assertDraft(node.projectId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Proyek terkunci.',
    };
  }

  const allNodes = await db
    .select()
    .from(projectWbs)
    .where(eq(projectWbs.projectId, node.projectId))
    .orderBy(asc(projectWbs.sortOrder), asc(projectWbs.createdAt));

  const siblings = allNodes.filter((n) => n.parentId === node.parentId);
  const idx = siblings.findIndex((s) => s.id === node.id);
  if (idx === -1) {
    return { ok: false, error: 'Node tidak ditemukan di daftar saudara.' };
  }

  const swapIdx = input.direction === 'UP' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= siblings.length) {
    return { ok: true, data: undefined };
  }

  // Re-normalize sequential sortOrders then swap cleanly
  await db.transaction(async (tx) => {
    const normalized = siblings.map((s, i) => ({ id: s.id, order: i + 1 }));
    const a = normalized[idx];
    const b = normalized[swapIdx];
    const tmp = a.order;
    a.order = b.order;
    b.order = tmp;

    for (const item of normalized) {
      await tx
        .update(projectWbs)
        .set({ sortOrder: item.order, updatedAt: new Date() })
        .where(eq(projectWbs.id, item.id));
    }
  });

  revalidatePath(`/projects/${node.projectId}`);
  return { ok: true, data: undefined };
}

export async function deleteWbsNode(wbsId: string): Promise<ActionResult> {
  const [node] = await db
    .select()
    .from(projectWbs)
    .where(eq(projectWbs.id, wbsId));

  if (!node) {
    return { ok: false, error: 'Node WBS tidak ditemukan.' };
  }

  try {
    await assertDraft(node.projectId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Proyek terkunci.',
    };
  }

  const childNodes = await db
    .select({ id: projectWbs.id })
    .from(projectWbs)
    .where(eq(projectWbs.parentId, wbsId));

  const takeoffs = await db
    .select({ id: projectTakeoffs.id })
    .from(projectTakeoffs)
    .where(eq(projectTakeoffs.wbsId, wbsId));

  if (childNodes.length > 0 || takeoffs.length > 0) {
    return {
      ok: false,
      error:
        'Node WBS tidak dapat dihapus karena masih memiliki sub-WBS atau item takeoff. Kosongkan terlebih dahulu.',
    };
  }

  await db.delete(projectWbs).where(eq(projectWbs.id, wbsId));
  revalidatePath(`/projects/${node.projectId}`);
  return { ok: true, data: undefined };
}

export async function saveTakeoffRow(input: {
  id?: string;
  wbsId: string;
  ahspId: string;
  description: string;
  length: string | null;
  width: string | null;
  height: string | null;
  count: string | null;
  deductionVolume: string | null;
  subItemsJson?: string | null;
}): Promise<ActionResult<WorkspaceTakeoffRow>> {
  const [wbs] = await db
    .select()
    .from(projectWbs)
    .where(eq(projectWbs.id, input.wbsId));

  if (!wbs) {
    return { ok: false, error: 'Node WBS tidak ditemukan.' };
  }

  try {
    await assertDraft(wbs.projectId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Proyek terkunci.',
    };
  }

  const description = input.description.trim();
  if (!description) {
    return { ok: false, error: 'Deskripsi pekerjaan wajib diisi.' };
  }

  const [ahsp] = await db
    .select()
    .from(masterAhsp)
    .where(eq(masterAhsp.id, input.ahspId));

  if (!ahsp) {
    return { ok: false, error: 'Master AHSP tidak ditemukan.' };
  }

  let l = normalizeDimInput(input.length);
  let w = normalizeDimInput(input.width);
  let h = normalizeDimInput(input.height);
  let c = normalizeDimInput(input.count);
  let ded = normalizeDimInput(input.deductionVolume) ?? '0';
  let subItemsJsonToSave: string | null = null;
  let calculatedVolStr: string;

  try {
    if (input.subItemsJson && input.subItemsJson.trim() !== '') {
      const parsed = JSON.parse(input.subItemsJson) as SubTakeoffItemInput[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const breakdown = calcSubTakeoffBreakdown(parsed);
        l = breakdown.totalAdd;
        w = null;
        h = null;
        c = null;
        ded = breakdown.totalDeduct;
        calculatedVolStr = breakdown.netVolume;
        subItemsJsonToSave = JSON.stringify(parsed);
      } else {
        calculatedVolStr = calcVolume({
          length: l,
          width: w,
          height: h,
          count: c,
          deduction: ded,
        }).toString();
      }
    } else {
      calculatedVolStr = calcVolume({
        length: l,
        width: w,
        height: h,
        count: c,
        deduction: ded,
      }).toString();
    }
  } catch (err) {
    if (err instanceof RabValidationError) {
      return { ok: false, error: `${err.code}: ${err.message}` };
    }
    return { ok: false, error: 'Dimensi volume atau rincian sub-takeoff tidak valid.' };
  }

  const fmtDim = (v: string | null): string | null =>
    v === null ? null : new Decimal(v).toFixed(4, Decimal.ROUND_HALF_UP);
  const fmtDed = new Decimal(ded).toFixed(4, Decimal.ROUND_HALF_UP);
  const intCount = c === null ? null : parseInt(c, 10);

  if (input.id) {
    const [existing] = await db
      .select()
      .from(projectTakeoffs)
      .where(eq(projectTakeoffs.id, input.id));

    if (!existing) {
      return { ok: false, error: 'Baris takeoff tidak ditemukan.' };
    }

    const [updated] = await db
      .update(projectTakeoffs)
      .set({
        wbsId: input.wbsId,
        ahspId: input.ahspId,
        description,
        length: fmtDim(l),
        width: fmtDim(w),
        height: fmtDim(h),
        count: intCount,
        deductionVolume: fmtDed,
        calculatedVolume: calculatedVolStr,
        subItemsJson: subItemsJsonToSave,
        updatedAt: new Date(),
      })
      .where(eq(projectTakeoffs.id, input.id))
      .returning();

    revalidatePath(`/projects/${wbs.projectId}`);
    revalidatePath('/projects');
    return {
      ok: true,
      data: {
        id: updated.id,
        wbsId: updated.wbsId,
        ahspId: updated.ahspId,
        description: updated.description,
        sortOrder: updated.sortOrder,
        length: updated.length,
        width: updated.width,
        height: updated.height,
        count: updated.count === null ? null : String(updated.count),
        deductionVolume: updated.deductionVolume,
        calculatedVolume: updated.calculatedVolume,
        subItemsJson: updated.subItemsJson,
      },
    };
  }

  const existingInWbs = await db
    .select({ sortOrder: projectTakeoffs.sortOrder })
    .from(projectTakeoffs)
    .where(eq(projectTakeoffs.wbsId, input.wbsId));

  const nextOrder =
    existingInWbs.reduce((m, r) => (r.sortOrder > m ? r.sortOrder : m), 0) + 1;

  const [inserted] = await db
    .insert(projectTakeoffs)
    .values({
      wbsId: input.wbsId,
      ahspId: input.ahspId,
      description,
      sortOrder: nextOrder,
      length: fmtDim(l),
      width: fmtDim(w),
      height: fmtDim(h),
      count: intCount,
      deductionVolume: fmtDed,
      calculatedVolume: calculatedVolStr,
      subItemsJson: subItemsJsonToSave,
    })
    .returning();

  revalidatePath(`/projects/${wbs.projectId}`);
  revalidatePath('/projects');
  return {
    ok: true,
    data: {
      id: inserted.id,
      wbsId: inserted.wbsId,
      ahspId: inserted.ahspId,
      description: inserted.description,
      sortOrder: inserted.sortOrder,
      length: inserted.length,
      width: inserted.width,
      height: inserted.height,
      count: inserted.count === null ? null : String(inserted.count),
      deductionVolume: inserted.deductionVolume,
      calculatedVolume: inserted.calculatedVolume,
      subItemsJson: inserted.subItemsJson,
    },
  };
}

export async function moveTakeoffRow(input: {
  takeoffId: string;
  direction: 'UP' | 'DOWN';
}): Promise<ActionResult> {
  const [row] = await db
    .select()
    .from(projectTakeoffs)
    .where(eq(projectTakeoffs.id, input.takeoffId));

  if (!row) {
    return { ok: false, error: 'Baris takeoff tidak ditemukan.' };
  }

  const [wbs] = await db
    .select()
    .from(projectWbs)
    .where(eq(projectWbs.id, row.wbsId));

  if (!wbs) {
    return { ok: false, error: 'WBS induk tidak ditemukan.' };
  }

  try {
    await assertDraft(wbs.projectId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Proyek terkunci.',
    };
  }

  const siblings = await db
    .select()
    .from(projectTakeoffs)
    .where(eq(projectTakeoffs.wbsId, row.wbsId))
    .orderBy(asc(projectTakeoffs.sortOrder), asc(projectTakeoffs.createdAt));

  const idx = siblings.findIndex((s) => s.id === row.id);
  const swapIdx = input.direction === 'UP' ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= siblings.length) {
    return { ok: true, data: undefined };
  }

  await db.transaction(async (tx) => {
    const normalized = siblings.map((s, i) => ({ id: s.id, order: i + 1 }));
    const a = normalized[idx];
    const b = normalized[swapIdx];
    const tmp = a.order;
    a.order = b.order;
    b.order = tmp;

    for (const item of normalized) {
      await tx
        .update(projectTakeoffs)
        .set({ sortOrder: item.order, updatedAt: new Date() })
        .where(eq(projectTakeoffs.id, item.id));
    }
  });

  revalidatePath(`/projects/${wbs.projectId}`);
  return { ok: true, data: undefined };
}

export async function duplicateTakeoffRow(
  takeoffId: string
): Promise<ActionResult<WorkspaceTakeoffRow>> {
  const [row] = await db
    .select()
    .from(projectTakeoffs)
    .where(eq(projectTakeoffs.id, takeoffId));

  if (!row) {
    return { ok: false, error: 'Baris takeoff tidak ditemukan.' };
  }

  const [wbs] = await db
    .select()
    .from(projectWbs)
    .where(eq(projectWbs.id, row.wbsId));

  if (!wbs) {
    return { ok: false, error: 'WBS induk tidak ditemukan.' };
  }

  try {
    await assertDraft(wbs.projectId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Proyek terkunci.',
    };
  }

  const existingInWbs = await db
    .select({ sortOrder: projectTakeoffs.sortOrder })
    .from(projectTakeoffs)
    .where(eq(projectTakeoffs.wbsId, row.wbsId));
  const nextOrder =
    existingInWbs.reduce((m, r) => (r.sortOrder > m ? r.sortOrder : m), 0) + 1;

  const [inserted] = await db
    .insert(projectTakeoffs)
    .values({
      wbsId: row.wbsId,
      ahspId: row.ahspId,
      description: `${row.description} (salinan)`,
      sortOrder: nextOrder,
      length: row.length,
      width: row.width,
      height: row.height,
      count: row.count,
      deductionVolume: row.deductionVolume,
      calculatedVolume: row.calculatedVolume,
      subItemsJson: row.subItemsJson,
    })
    .returning();

  revalidatePath(`/projects/${wbs.projectId}`);
  revalidatePath('/projects');
  return {
    ok: true,
    data: {
      id: inserted.id,
      wbsId: inserted.wbsId,
      ahspId: inserted.ahspId,
      description: inserted.description,
      sortOrder: inserted.sortOrder,
      length: inserted.length,
      width: inserted.width,
      height: inserted.height,
      count: inserted.count === null ? null : String(inserted.count),
      deductionVolume: inserted.deductionVolume,
      calculatedVolume: inserted.calculatedVolume,
      subItemsJson: inserted.subItemsJson,
    },
  };
}

export async function deleteTakeoffRow(
  takeoffId: string
): Promise<ActionResult> {
  const [row] = await db
    .select()
    .from(projectTakeoffs)
    .where(eq(projectTakeoffs.id, takeoffId));

  if (!row) {
    return { ok: false, error: 'Baris takeoff tidak ditemukan.' };
  }

  const [wbs] = await db
    .select()
    .from(projectWbs)
    .where(eq(projectWbs.id, row.wbsId));

  if (!wbs) {
    return { ok: false, error: 'WBS induk tidak ditemukan.' };
  }

  try {
    await assertDraft(wbs.projectId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Proyek terkunci.',
    };
  }

  await db.delete(projectTakeoffs).where(eq(projectTakeoffs.id, takeoffId));
  revalidatePath(`/projects/${wbs.projectId}`);
  revalidatePath('/projects');
  return { ok: true, data: undefined };
}

export async function updateWbsSchedule(input: {
  wbsId: string;
  startWeek: number;
  durationWeeks: number;
}): Promise<ActionResult> {
  const [node] = await db
    .select()
    .from(projectWbs)
    .where(eq(projectWbs.id, input.wbsId));

  if (!node) {
    return { ok: false, error: 'Node WBS tidak ditemukan.' };
  }

  try {
    await assertDraft(node.projectId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Proyek terkunci.',
    };
  }

  const startWeek = Math.trunc(Number(input.startWeek));
  const durationWeeks = Math.trunc(Number(input.durationWeeks));
  if (
    !Number.isFinite(startWeek) ||
    startWeek < 1 ||
    startWeek > 104 ||
    !Number.isFinite(durationWeeks) ||
    durationWeeks < 1 ||
    durationWeeks > 104
  ) {
    return {
      ok: false,
      error: 'Minggu mulai dan durasi harus berupa angka antara 1 sampai 104 minggu.',
    };
  }

  await db
    .update(projectWbs)
    .set({
      startWeek,
      durationWeeks,
      updatedAt: new Date(),
    })
    .where(eq(projectWbs.id, input.wbsId));

  revalidatePath(`/projects/${node.projectId}`);
  return { ok: true, data: undefined };
}

export async function createProjectFromFeasibility(input: {
  name: string;
  regionId: string;
  priceDate: string;
  overheadProfitMargin: string;
  taxRatePpn: string;
  clientName?: string;
  projectLocation?: string;
  architectName?: string;
  buildingAreaM2: string;
  floors: number;
  grade: FinishingGrade;
}): Promise<ActionResult<{ id: string }>> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: 'Nama proyek wajib diisi.' };
  }
  if (!ISO_DATE_RE.test(input.priceDate)) {
    return { ok: false, error: 'Tanggal harga harus berformat YYYY-MM-DD.' };
  }

  const ohp = normalizeRatePercent(input.overheadProfitMargin, 'Margin OHP');
  if (!ohp.ok) return ohp;
  const ppn = normalizeRatePercent(input.taxRatePpn, 'Tarif PPN');
  if (!ppn.ok) return ppn;

  let feasibility;
  try {
    feasibility = calcFeasibilityEstimate({
      buildingAreaM2: input.buildingAreaM2,
      floors: input.floors,
      grade: input.grade,
      ohpPercent: ohp.value,
      ppnPercent: ppn.value,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Parameter feasibility tidak valid.',
    };
  }

  const activeAhsps = await db
    .select()
    .from(masterAhsp)
    .where(eq(masterAhsp.isActive, true));
  const ahspByCode = new Map(activeAhsps.map((a) => [a.code, a]));

  const area = new Decimal(feasibility.areaM2);
  const floors = new Decimal(feasibility.floors);
  const footprint = area.div(floors);
  const perimeterEst = footprint.sqrt().times(4);
  const wallLen = perimeterEst.times(floors).times('1.35');
  const wallOpeningDed1 = wallLen.times('3.5').times('0.12');
  const wallOpeningDed2 = wallOpeningDed1.times(2);

  const fmt2 = (d: Decimal) => d.toFixed(2, Decimal.ROUND_HALF_UP);
  const fmt4 = (d: Decimal) => d.toFixed(4, Decimal.ROUND_HALF_UP);

  type TakeoffSeedSpec = {
    divCode: string;
    ahspCode: string;
    description: string;
    length: string | null;
    width: string | null;
    height: string | null;
    count: number | null;
    deductionVolume: string;
  };

  const takeoffSpecs: TakeoffSeedSpec[] = [
    {
      divCode: 'DIV-01',
      ahspCode: 'AHSP-03',
      description: 'Pengukuran & Pemasangan Bouwplank Keliling',
      length: fmt4(perimeterEst),
      width: null,
      height: null,
      count: 1,
      deductionVolume: '0.0000',
    },
    {
      divCode: 'DIV-02',
      ahspCode: 'AHSP-04',
      description: 'Galian Tanah Pondasi Menerus',
      length: fmt4(perimeterEst),
      width: '0.8000',
      height: '1.0000',
      count: 1,
      deductionVolume: '0.0000',
    },
    {
      divCode: 'DIV-02',
      ahspCode: 'AHSP-05',
      description: 'Pasangan Pondasi Batu Kali 1SP : 4PP',
      length: fmt4(perimeterEst),
      width: '0.5000',
      height: '0.8000',
      count: 1,
      deductionVolume: '0.0000',
    },
    {
      divCode: 'DIV-03',
      ahspCode: 'AHSP-06',
      description: 'Pekerjaan Beton Struktur K-225 (Kolom, Balok & Sloof)',
      length: fmt4(area.times('0.18')),
      width: null,
      height: null,
      count: 1,
      deductionVolume: '0.0000',
    },
    {
      divCode: 'DIV-03',
      ahspCode: 'AHSP-07',
      description: 'Pembesian Struktur Polos / Ulir',
      length: fmt4(area.times('25.2')),
      width: null,
      height: null,
      count: 1,
      deductionVolume: '0.0000',
    },
    {
      divCode: 'DIV-03',
      ahspCode: 'AHSP-08',
      description: 'Pemasangan Bekisting Struktur Beton',
      length: fmt4(area.times('1.4')),
      width: null,
      height: null,
      count: 1,
      deductionVolume: '0.0000',
    },
    {
      divCode: 'DIV-04',
      ahspCode: 'AHSP-01',
      description: 'Pasangan Dinding Bata Merah 1/2 Bata (1SP : 4PP)',
      length: fmt4(wallLen),
      width: null,
      height: '3.5000',
      count: 1,
      deductionVolume: fmt4(wallOpeningDed1),
    },
    {
      divCode: 'DIV-04',
      ahspCode: 'AHSP-02',
      description: 'Plesteran Dinding 2 Sisi (1SP : 4PP t=15mm)',
      length: fmt4(wallLen),
      width: null,
      height: '3.5000',
      count: 2,
      deductionVolume: fmt4(wallOpeningDed2),
    },
    {
      divCode: 'DIV-04',
      ahspCode: 'AHSP-09',
      description: 'Acian Permukaan Dinding 2 Sisi',
      length: fmt4(wallLen),
      width: null,
      height: '3.5000',
      count: 2,
      deductionVolume: fmt4(wallOpeningDed2),
    },
    {
      divCode: 'DIV-05',
      ahspCode: 'AHSP-12',
      description: 'Pemasangan Rangka Atap Baja Ringan C75',
      length: fmt4(footprint.times('1.30')),
      width: null,
      height: null,
      count: 1,
      deductionVolume: '0.0000',
    },
    {
      divCode: 'DIV-05',
      ahspCode: 'AHSP-13',
      description: `Penutup Atap Genteng Metal (${input.grade})`,
      length: fmt4(footprint.times('1.30')),
      width: null,
      height: null,
      count: 1,
      deductionVolume: '0.0000',
    },
    {
      divCode: 'DIV-06',
      ahspCode: 'AHSP-10',
      description: `Pasangan Lantai Utama Homogeneous Tile 60x60 (${input.grade})`,
      length: fmt4(area.times('0.90')),
      width: null,
      height: null,
      count: 1,
      deductionVolume: '0.0000',
    },
    {
      divCode: 'DIV-06',
      ahspCode: 'AHSP-11',
      description: 'Pemasangan Plafon Gypsumboard 9mm + Rangka Hollow',
      length: fmt4(area.times('0.92')),
      width: null,
      height: null,
      count: 1,
      deductionVolume: '0.0000',
    },
    {
      divCode: 'DIV-07',
      ahspCode: 'AHSP-14',
      description: `Pengecatan Dinding Interior & Eksterior (${input.grade})`,
      length: fmt4(wallLen),
      width: null,
      height: '3.5000',
      count: 2,
      deductionVolume: fmt4(wallOpeningDed2),
    },
    {
      divCode: 'DIV-07',
      ahspCode: 'AHSP-15',
      description: 'Instalasi Titik Lampu & Stop Kontak',
      length: null,
      width: null,
      height: null,
      count: Math.max(8, Math.round(area.div(6).toNumber())),
      deductionVolume: '0.0000',
    },
    {
      divCode: 'DIV-07',
      ahspCode: 'AHSP-16',
      description: 'Instalasi Pipa Air Bersih PVC AW dia. 3/4"',
      length: fmt4(perimeterEst.times(floors).times('1.2')),
      width: null,
      height: null,
      count: 1,
      deductionVolume: '0.0000',
    },
  ];

  const created = await db.transaction(async (tx) => {
    const [proj] = await tx
      .insert(projects)
      .values({
        name,
        regionId: input.regionId,
        status: 'DRAFT',
        priceDate: input.priceDate,
        overheadProfitMargin: ohp.value,
        taxRatePpn: ppn.value,
        clientName: input.clientName?.trim() || null,
        projectLocation: input.projectLocation?.trim() || null,
        architectName: input.architectName?.trim() || null,
        buildingAreaM2: fmt2(area),
      })
      .returning({ id: projects.id });

    const wbsByDivCode = new Map<string, string>();
    for (let i = 0; i < feasibility.divisions.length; i += 1) {
      const div = feasibility.divisions[i];
      const [insertedWbs] = await tx
        .insert(projectWbs)
        .values({
          projectId: proj.id,
          parentId: null,
          name: div.name,
          sortOrder: i + 1,
          startWeek: div.startWeek,
          durationWeeks: div.durationWeeks,
        })
        .returning({ id: projectWbs.id });
      wbsByDivCode.set(div.code, insertedWbs.id);
    }

    const orderByWbs = new Map<string, number>();
    for (const spec of takeoffSpecs) {
      const targetWbsId = wbsByDivCode.get(spec.divCode);
      const ahsp = ahspByCode.get(spec.ahspCode);
      if (!targetWbsId || !ahsp) continue;

      const vol = calcVolume({
        length: spec.length,
        width: spec.width,
        height: spec.height,
        count: spec.count === null ? null : String(spec.count),
        deduction: spec.deductionVolume,
      }).toString();

      const nextOrder = (orderByWbs.get(targetWbsId) ?? 0) + 1;
      orderByWbs.set(targetWbsId, nextOrder);

      await tx.insert(projectTakeoffs).values({
        wbsId: targetWbsId,
        ahspId: ahsp.id,
        description: spec.description,
        sortOrder: nextOrder,
        length: spec.length,
        width: spec.width,
        height: spec.height,
        count: spec.count,
        deductionVolume: spec.deductionVolume,
        calculatedVolume: vol,
      });
    }

    return proj;
  });

  revalidatePath('/projects');
  return { ok: true, data: { id: created.id } };
}

export async function getProjectComparisonData(
  baseProjectId: string,
  revisedProjectId: string
): Promise<
  ActionResult<
    ProjectComparisonResult & {
      baseProject: WorkspaceProject;
      revisedProject: WorkspaceProject;
    }
  >
> {
  const [baseWs, revWs] = await Promise.all([
    getProjectWorkspace(baseProjectId),
    getProjectWorkspace(revisedProjectId),
  ]);

  if (!baseWs || !revWs) {
    return {
      ok: false,
      error: 'Salah satu proyek pembanding tidak ditemukan.',
    };
  }

  if (!baseWs.computed.totals || !revWs.computed.totals) {
    return {
      ok: false,
      error:
        'Kedua proyek harus memiliki hitungan RAB yang valid (tidak ada error harga atau volume) sebelum dapat dibandingkan.',
    };
  }

  const toComparisonRows = (ws: WorkspacePayload): ComparisonRowInput[] => {
    const wbsPathMap = buildWbsPathMap(ws.wbsList);
    const snapPathByTakeoff = new Map(
      ws.snapshots.map((s) => [s.takeoffId, s.wbsPath])
    );

    return ws.computed.rows.map((r) => ({
      id: r.id,
      wbsPath:
        ws.project.status === 'FINALIZED'
          ? snapPathByTakeoff.get(r.id) ?? wbsPathMap.get(r.wbsId) ?? 'WBS'
          : wbsPathMap.get(r.wbsId) ?? 'WBS',
      description: r.description,
      ahspCode: r.ahspCode,
      ahspName: r.ahspName,
      unit: r.ahspUnit,
      volume: r.calculatedVolume,
      hsp: r.hsp ?? '0',
      baseTotal: r.baseTotal ?? '0.00',
    }));
  };

  const result = calcProjectComparison({
    baseRows: toComparisonRows(baseWs),
    revisedRows: toComparisonRows(revWs),
    baseTotals: baseWs.computed.totals,
    revisedTotals: revWs.computed.totals,
  });

  return {
    ok: true,
    data: {
      ...result,
      baseProject: baseWs.project,
      revisedProject: revWs.project,
    },
  };
}
