import Decimal from 'decimal.js';
import {
  RabValidationError,
  calcBaseTotal,
  calcBom,
  calcCostPerM2,
  calcFromSnapshotRows,
  calcHsp,
  calcProjectTotals,
  calcSCurve,
  calcSubTakeoffBreakdown,
  calcVolume,
  calcWbsRecap,
  type BomInputLine,
  type BomResultRow,
  type ProjectTotalsResult,
  type ResourceType,
  type SCurveResult,
  type SnapshotCalcRow,
  type SubTakeoffItemInput,
  type WbsRecapRow,
} from './calc';
import { pickEffectivePrice, type EffectivePriceRow } from './pricing';

export interface WorkspaceProject {
  id: string;
  name: string;
  regionId: string;
  regionName: string;
  status: 'DRAFT' | 'FINALIZED';
  priceDate: string;
  overheadProfitMargin: string;
  taxRatePpn: string;
  regionNameFrozen: string | null;
  finalizedAt: string | null;
  sourceProjectId: string | null;
  clientName: string | null;
  projectLocation: string | null;
  architectName: string | null;
  buildingAreaM2: string | null;
}

export interface WorkspaceRegion {
  id: string;
  name: string;
  isActive: boolean;
}

export interface WorkspaceWbsNode {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  startWeek: number;
  durationWeeks: number;
}

export interface WorkspaceTakeoffRow {
  id: string;
  wbsId: string;
  ahspId: string;
  description: string;
  sortOrder: number;
  length: string | null;
  width: string | null;
  height: string | null;
  count: string | null;
  deductionVolume: string;
  calculatedVolume: string;
  subItemsJson: string | null;
}

export interface WorkspaceAhspItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  isActive: boolean;
}

export interface WorkspaceCompositionItem {
  id: string;
  ahspId: string;
  resourceId: string;
  resourceCode: string;
  resourceName: string;
  resourceUnit: string;
  resourceType: ResourceType;
  coefficient: string;
}

export interface WorkspacePriceItem extends EffectivePriceRow {
  id: string;
  resourceId: string;
}

export interface ComputedTakeoffRow extends WorkspaceTakeoffRow {
  ahspCode: string;
  ahspName: string;
  ahspUnit: string;
  ahspIsActive: boolean;
  hsp: string | null;
  baseTotal: string | null;
  validationError: string | null;
  priceErrors: string[];
}

export interface ComputedWorkspaceState {
  rows: ComputedTakeoffRow[];
  wbsSubtotals: Record<string, string | null>;
  wbsWeights: Record<string, string>;
  recapRows: WbsRecapRow[];
  sCurve: SCurveResult | null;
  totals: ProjectTotalsResult | null;
  costPerM2: string | null;
  bom: BomResultRow[];
  priceErrors: string[];
  validationErrorsCount: number;
  hasAnyCalculationError: boolean;
}

function toRoman(num: number): string {
  const romans: Array<[number, string]> = [
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let n = Math.max(1, Math.trunc(num));
  let out = '';
  for (const [val, sym] of romans) {
    while (n >= val) {
      out += sym;
      n -= val;
    }
  }
  return out;
}

function computeRecapAndCurve(params: {
  wbsList: WorkspaceWbsNode[];
  rows: ComputedTakeoffRow[];
  wbsSubtotals: Record<string, string | null>;
  totals: ProjectTotalsResult | null;
  ohpPercent: string;
}): {
  wbsWeights: Record<string, string>;
  recapRows: WbsRecapRow[];
  sCurve: SCurveResult | null;
} {
  const { wbsList, rows, wbsSubtotals, totals, ohpPercent } = params;
  const wbsWeights: Record<string, string> = {};

  if (!totals || new Decimal(totals.subtotal).lte(0)) {
    for (const w of wbsList) {
      wbsWeights[w.id] = '0.00';
    }
  } else {
    const subDec = new Decimal(totals.subtotal);
    for (const w of wbsList) {
      const val = wbsSubtotals[w.id];
      if (val && new Decimal(val).gt(0)) {
        wbsWeights[w.id] = new Decimal(val)
          .div(subDec)
          .times(100)
          .toFixed(2, Decimal.ROUND_HALF_UP);
      } else {
        wbsWeights[w.id] = '0.00';
      }
    }
  }

  if (!totals) {
    return { wbsWeights, recapRows: [], sCurve: null };
  }

  const roots = wbsList
    .filter((w) => w.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  let targetNodes = roots;
  if (roots.length === 1) {
    const singleRoot = roots[0];
    const hasDirectTakeoffs = rows.some((r) => r.wbsId === singleRoot.id);
    const rootChildren = wbsList
      .filter((w) => w.parentId === singleRoot.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (!hasDirectTakeoffs && rootChildren.length > 0) {
      targetNodes = rootChildren;
    }
  }

  const recapRows = calcWbsRecap(
    targetNodes.map((n, idx) => ({
      wbsId: n.id,
      code: toRoman(idx + 1),
      name: n.name,
      subtotal: wbsSubtotals[n.id] ?? '0.00',
      startWeek: n.startWeek ?? 1,
      durationWeeks: n.durationWeeks ?? 1,
    })),
    totals.subtotal,
    ohpPercent
  );

  const sCurve = calcSCurve(recapRows, totals.subtotal);

  return { wbsWeights, recapRows, sCurve };
}

export function buildWbsPathMap(wbsList: WorkspaceWbsNode[]): Map<string, string> {
  const byId = new Map(wbsList.map((w) => [w.id, w]));
  const pathMap = new Map<string, string>();

  const resolve = (id: string, guard = 0): string => {
    const cached = pathMap.get(id);
    if (cached !== undefined) return cached;
    const node = byId.get(id);
    if (!node || guard > 10) return '';
    if (!node.parentId) {
      pathMap.set(id, node.name);
      return node.name;
    }
    const parentPath = resolve(node.parentId, guard + 1);
    const full = parentPath ? `${parentPath} > ${node.name}` : node.name;
    pathMap.set(id, full);
    return full;
  };

  for (const w of wbsList) {
    resolve(w.id);
  }
  return pathMap;
}

export function computeDraftWorkspace(params: {
  project: WorkspaceProject;
  wbsList: WorkspaceWbsNode[];
  takeoffs: WorkspaceTakeoffRow[];
  ahsps: WorkspaceAhspItem[];
  compositions: WorkspaceCompositionItem[];
  prices: WorkspacePriceItem[];
}): ComputedWorkspaceState {
  const { project, wbsList, takeoffs, ahsps, compositions, prices } = params;

  const ahspMap = new Map(ahsps.map((a) => [a.id, a]));
  const compsByAhsp = new Map<string, WorkspaceCompositionItem[]>();
  for (const c of compositions) {
    const arr = compsByAhsp.get(c.ahspId);
    if (arr) {
      arr.push(c);
    } else {
      compsByAhsp.set(c.ahspId, [c]);
    }
  }

  const pricesByResource = new Map<string, WorkspacePriceItem[]>();
  for (const p of prices) {
    const arr = pricesByResource.get(p.resourceId);
    if (arr) {
      arr.push(p);
    } else {
      pricesByResource.set(p.resourceId, [p]);
    }
  }

  const allPriceErrors = new Set<string>();
  const allBaseTotals: string[] = [];
  const bomLines: BomInputLine[] = [];
  let validationErrorsCount = 0;

  const rows: ComputedTakeoffRow[] = takeoffs.map((row) => {
    const ahsp = ahspMap.get(row.ahspId);
    const comps = compsByAhsp.get(row.ahspId) ?? [];
    const rowPriceErrors: string[] = [];

    let calculatedVolume = row.calculatedVolume;
    let validationError: string | null = null;

    try {
      if (row.subItemsJson) {
        const parsed = JSON.parse(row.subItemsJson) as SubTakeoffItemInput[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const breakdown = calcSubTakeoffBreakdown(parsed);
          calculatedVolume = breakdown.netVolume;
        } else {
          const vol = calcVolume({
            length: row.length,
            width: row.width,
            height: row.height,
            count: row.count,
            deduction: row.deductionVolume || '0',
          });
          calculatedVolume = vol.toString();
        }
      } else {
        const vol = calcVolume({
          length: row.length,
          width: row.width,
          height: row.height,
          count: row.count,
          deduction: row.deductionVolume || '0',
        });
        calculatedVolume = vol.toString();
      }
    } catch (err) {
      validationErrorsCount += 1;
      validationError =
        err instanceof RabValidationError
          ? `${err.code}: ${err.message}`
          : 'Input volume tidak valid.';
    }

    const hspLines: { coefficient: string; price: string }[] = [];
    if (comps.length === 0) {
      const msg = `AHSP "${ahsp?.name ?? row.ahspId}" belum memiliki komposisi resource.`;
      rowPriceErrors.push(msg);
      allPriceErrors.add(msg);
    } else {
      for (const comp of comps) {
        const resourcePrices = pricesByResource.get(comp.resourceId) ?? [];
        try {
          const eff = pickEffectivePrice(
            resourcePrices,
            project.regionId,
            project.priceDate
          );
          hspLines.push({ coefficient: comp.coefficient, price: eff });
        } catch {
          const msg = `harga ${comp.resourceName} tidak ada untuk wilayah/tanggal ini`;
          rowPriceErrors.push(msg);
          allPriceErrors.add(msg);
        }

        if (!validationError) {
          bomLines.push({
            resourceId: comp.resourceId,
            resourceCode: comp.resourceCode,
            resourceName: comp.resourceName,
            resourceUnit: comp.resourceUnit,
            resourceType: comp.resourceType,
            volume: calculatedVolume,
            coefficient: comp.coefficient,
          });
        }
      }
    }

    let hspStr: string | null = null;
    let baseTotalStr: string | null = null;

    if (rowPriceErrors.length === 0 && !validationError) {
      const hspDec = calcHsp(hspLines);
      const baseTotalDec = calcBaseTotal(calculatedVolume, hspDec);
      hspStr = hspDec.toString();
      baseTotalStr = baseTotalDec.toString();
      allBaseTotals.push(baseTotalStr);
    }

    return {
      ...row,
      calculatedVolume,
      ahspCode: ahsp?.code ?? '-',
      ahspName: ahsp?.name ?? 'AHSP tidak ditemukan',
      ahspUnit: ahsp?.unit ?? '-',
      ahspIsActive: ahsp?.isActive ?? false,
      hsp: hspStr,
      baseTotal: baseTotalStr,
      validationError,
      priceErrors: rowPriceErrors,
    };
  });

  // Compute rolled-up WBS subtotals (sum of own takeoffs + descendants)
  const wbsSubtotals: Record<string, string | null> = {};
  const childrenMap = new Map<string, string[]>();
  for (const w of wbsList) {
    if (w.parentId) {
      const arr = childrenMap.get(w.parentId);
      if (arr) {
        arr.push(w.id);
      } else {
        childrenMap.set(w.parentId, [w.id]);
      }
    }
  }

  const rowsByWbs = new Map<string, ComputedTakeoffRow[]>();
  for (const r of rows) {
    const arr = rowsByWbs.get(r.wbsId);
    if (arr) {
      arr.push(r);
    } else {
      rowsByWbs.set(r.wbsId, [r]);
    }
  }

  const priceErrorsArr = Array.from(allPriceErrors);

  const rollUpWbs = (wbsId: string): Decimal | null => {
    if (priceErrorsArr.length > 0) {
      return null;
    }
    let acc = new Decimal(0);
    const directRows = rowsByWbs.get(wbsId) ?? [];
    for (const r of directRows) {
      if (r.baseTotal === null) {
        return null;
      }
      acc = acc.plus(new Decimal(r.baseTotal));
    }
    const kids = childrenMap.get(wbsId) ?? [];
    for (const kidId of kids) {
      const kidSum = rollUpWbs(kidId);
      if (kidSum === null) {
        return null;
      }
      acc = acc.plus(kidSum);
    }
    return acc;
  };

  for (const w of wbsList) {
    const sum = rollUpWbs(w.id);
    wbsSubtotals[w.id] = sum === null ? null : sum.toFixed(2, Decimal.ROUND_HALF_UP);
  }

  const hasErrors = priceErrorsArr.length > 0 || validationErrorsCount > 0;
  const totals =
    !hasErrors
      ? calcProjectTotals(
          allBaseTotals,
          project.overheadProfitMargin,
          project.taxRatePpn
        )
      : null;

  const bom = calcBom(bomLines);

  const costPerM2 =
    totals !== null ? calcCostPerM2(totals.grandTotal, project.buildingAreaM2) : null;

  const { wbsWeights, recapRows, sCurve } = computeRecapAndCurve({
    wbsList,
    rows,
    wbsSubtotals,
    totals,
    ohpPercent: project.overheadProfitMargin,
  });

  return {
    rows,
    wbsSubtotals,
    wbsWeights,
    recapRows,
    sCurve,
    totals,
    costPerM2,
    bom,
    priceErrors: priceErrorsArr,
    validationErrorsCount,
    hasAnyCalculationError: hasErrors,
  };
}

export function computeFinalizedWorkspace(params: {
  project: WorkspaceProject;
  wbsList: WorkspaceWbsNode[];
  takeoffs: WorkspaceTakeoffRow[];
  snapshots: SnapshotCalcRow[];
}): ComputedWorkspaceState {
  const { project, wbsList, takeoffs, snapshots } = params;

  const calc = calcFromSnapshotRows(
    snapshots,
    project.overheadProfitMargin,
    project.taxRatePpn
  );

  const summaryByTakeoff = new Map(calc.takeoffs.map((t) => [t.takeoffId, t]));
  const takeoffInputMap = new Map(takeoffs.map((t) => [t.id, t]));

  const rows: ComputedTakeoffRow[] = calc.takeoffs.map((s) => {
    const raw = takeoffInputMap.get(s.takeoffId);
    return {
      id: s.takeoffId,
      wbsId: raw?.wbsId ?? '',
      ahspId: raw?.ahspId ?? '',
      description: s.description,
      sortOrder: s.sortOrder,
      length: raw?.length ?? null,
      width: raw?.width ?? null,
      height: raw?.height ?? null,
      count: raw?.count ?? null,
      deductionVolume: raw?.deductionVolume ?? '0.0000',
      calculatedVolume: s.volume,
      subItemsJson: raw?.subItemsJson ?? null,
      ahspCode: s.ahspCode,
      ahspName: s.ahspName,
      ahspUnit: s.ahspUnit,
      ahspIsActive: true,
      hsp: s.hsp,
      baseTotal: s.baseTotal,
      validationError: null,
      priceErrors: [],
    };
  });

  // Compute rolled-up WBS subtotals using wbsId linkage + snapshot baseTotal
  const childrenMap = new Map<string, string[]>();
  for (const w of wbsList) {
    if (w.parentId) {
      const arr = childrenMap.get(w.parentId);
      if (arr) {
        arr.push(w.id);
      } else {
        childrenMap.set(w.parentId, [w.id]);
      }
    }
  }

  const directByWbs = new Map<string, Decimal>();
  for (const t of takeoffs) {
    const snap = summaryByTakeoff.get(t.id);
    if (!snap) continue;
    const prev = directByWbs.get(t.wbsId) ?? new Decimal(0);
    directByWbs.set(t.wbsId, prev.plus(new Decimal(snap.baseTotal)));
  }

  const wbsSubtotals: Record<string, string | null> = {};
  const rollUp = (wbsId: string): Decimal => {
    let acc = directByWbs.get(wbsId) ?? new Decimal(0);
    for (const kid of childrenMap.get(wbsId) ?? []) {
      acc = acc.plus(rollUp(kid));
    }
    return acc;
  };
  for (const w of wbsList) {
    wbsSubtotals[w.id] = rollUp(w.id).toFixed(2, Decimal.ROUND_HALF_UP);
  }

  const costPerM2 = calcCostPerM2(calc.totals.grandTotal, project.buildingAreaM2);

  const { wbsWeights, recapRows, sCurve } = computeRecapAndCurve({
    wbsList,
    rows,
    wbsSubtotals,
    totals: calc.totals,
    ohpPercent: project.overheadProfitMargin,
  });

  return {
    rows,
    wbsSubtotals,
    wbsWeights,
    recapRows,
    sCurve,
    totals: calc.totals,
    costPerM2,
    bom: calc.bom,
    priceErrors: [],
    validationErrorsCount: 0,
    hasAnyCalculationError: false,
  };
}
