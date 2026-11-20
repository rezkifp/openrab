import Decimal from 'decimal.js';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP, precision: 40 });

export type RabErrorCode =
  | 'ALL_DIMENSIONS_NULL'
  | 'NEGATIVE_VOLUME'
  | 'NEGATIVE_INPUT'
  | 'PRICE_NOT_FOUND'
  | 'INVALID_NUMBER';

export class RabValidationError extends Error {
  public readonly code: RabErrorCode;

  constructor(code: RabErrorCode, message: string) {
    super(message);
    this.name = 'RabValidationError';
    this.code = code;
  }
}

export type ResourceType = 'MATERIAL' | 'LABOR' | 'EQUIPMENT';

export interface VolumeInput {
  length: string | null;
  width: string | null;
  height: string | null;
  count: string | null;
  deduction?: string | null;
}

export interface HspLineInput {
  coefficient: string;
  price: string;
}

export interface ProjectTotalsResult {
  subtotal: string;
  ohp: string;
  dpp: string;
  ppn: string;
  grandTotal: string;
}

export interface BomInputLine {
  resourceId: string;
  resourceCode: string;
  resourceName: string;
  resourceUnit: string;
  resourceType: ResourceType;
  volume: string;
  coefficient: string;
}

export interface BomResultRow {
  resourceId: string;
  resourceCode: string;
  resourceName: string;
  resourceUnit: string;
  resourceType: ResourceType;
  quantity: string;
}

export interface SnapshotCalcRow {
  takeoffId: string;
  wbsPath: string;
  description: string;
  sortOrder: number;
  volume: string;
  ahspCode: string;
  ahspName: string;
  ahspUnit: string;
  resourceId?: string;
  resourceCode: string;
  resourceName: string;
  resourceUnit: string;
  resourceType: ResourceType;
  coefficient: string;
  frozenPrice: string;
}

export interface SnapshotTakeoffSummary {
  takeoffId: string;
  wbsPath: string;
  description: string;
  sortOrder: number;
  volume: string;
  ahspCode: string;
  ahspName: string;
  ahspUnit: string;
  hsp: string;
  baseTotal: string;
}

function parseStrictDecimal(raw: string | Decimal, label: string): Decimal {
  if (raw instanceof Decimal) {
    if (!raw.isFinite()) {
      throw new RabValidationError('INVALID_NUMBER', `${label} tidak valid.`);
    }
    return raw;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new RabValidationError('INVALID_NUMBER', `${label} tidak boleh kosong.`);
  }

  try {
    const parsed = new Decimal(trimmed);
    if (!parsed.isFinite()) {
      throw new RabValidationError('INVALID_NUMBER', `${label} tidak valid.`);
    }
    return parsed;
  } catch (err) {
    if (err instanceof RabValidationError) {
      throw err;
    }
    throw new RabValidationError('INVALID_NUMBER', `${label} bukan angka desimal valid.`);
  }
}

function fixedDecimal(value: Decimal, dp: number): Decimal {
  const rounded = value.toDecimalPlaces(dp, Decimal.ROUND_HALF_UP);
  const formatted = rounded.toFixed(dp, Decimal.ROUND_HALF_UP);
  Object.defineProperty(rounded, 'toString', {
    value: () => formatted,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(rounded, 'toJSON', {
    value: () => formatted,
    enumerable: false,
    configurable: true,
  });
  return rounded;
}

export function calcVolume(input: VolumeInput): Decimal {
  const { length, width, height, count, deduction = '0' } = input;

  if (length === null && width === null && height === null && count === null) {
    throw new RabValidationError(
      'ALL_DIMENSIONS_NULL',
      'Minimal satu dimensi (P, L, T) atau Jumlah harus diisi.'
    );
  }

  const l = length === null ? new Decimal(1) : parseStrictDecimal(length, 'Panjang');
  const w = width === null ? new Decimal(1) : parseStrictDecimal(width, 'Lebar');
  const h = height === null ? new Decimal(1) : parseStrictDecimal(height, 'Tinggi');
  const c = count === null ? new Decimal(1) : parseStrictDecimal(count, 'Jumlah');
  const d =
    deduction === null || deduction === undefined
      ? new Decimal(0)
      : parseStrictDecimal(deduction, 'Pengurang');

  if (l.lt(0) || w.lt(0) || h.lt(0) || c.lt(0) || d.lt(0)) {
    throw new RabValidationError(
      'NEGATIVE_INPUT',
      'Dimensi, jumlah, dan volume pengurang tidak boleh bernilai negatif.'
    );
  }

  if (count !== null && !c.isInteger()) {
    throw new RabValidationError(
      'NEGATIVE_INPUT',
      'Jumlah (count) harus berupa bilangan bulat >= 0.'
    );
  }

  const rawVolume = l.times(w).times(h).times(c).minus(d);
  if (rawVolume.lt(0)) {
    throw new RabValidationError(
      'NEGATIVE_VOLUME',
      'Volume hasil tidak boleh kurang dari 0 setelah pengurangan.'
    );
  }

  return fixedDecimal(rawVolume, 4);
}

export function calcHsp(lines: HspLineInput[]): Decimal {
  let sum = new Decimal(0);
  for (const line of lines) {
    const coef = parseStrictDecimal(line.coefficient, 'Koefisien');
    const price = parseStrictDecimal(line.price, 'Harga');
    if (coef.lt(0) || price.lt(0)) {
      throw new RabValidationError(
        'NEGATIVE_INPUT',
        'Koefisien dan harga tidak boleh negatif.'
      );
    }
    sum = sum.plus(coef.times(price));
  }
  return sum;
}

export function calcBaseTotal(volume: Decimal | string, hsp: Decimal | string): Decimal {
  const vol = parseStrictDecimal(volume, 'Volume');
  const unitPrice = parseStrictDecimal(hsp, 'HSP');
  return fixedDecimal(vol.times(unitPrice), 2);
}

export function calcPpn(dpp: Decimal | string, ratePercent: Decimal | string): Decimal {
  const base = parseStrictDecimal(dpp, 'DPP');
  const rate = parseStrictDecimal(ratePercent, 'Tarif PPN');
  if (rate.lt(0)) {
    throw new RabValidationError('NEGATIVE_INPUT', 'Tarif PPN tidak boleh negatif.');
  }
  return fixedDecimal(base.times(rate).div(100), 2);
}

export function calcProjectTotals(
  baseTotals: (string | Decimal)[],
  ohpPercent: string | Decimal,
  ppnPercent: string | Decimal
): ProjectTotalsResult {
  let subtotalRaw = new Decimal(0);
  for (const item of baseTotals) {
    const val = parseStrictDecimal(item, 'Base Total');
    subtotalRaw = subtotalRaw.plus(val.toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  }

  const ohpRate = parseStrictDecimal(ohpPercent, 'Margin OHP');
  if (ohpRate.lt(0)) {
    throw new RabValidationError('NEGATIVE_INPUT', 'Margin OHP tidak boleh negatif.');
  }

  const subtotal = fixedDecimal(subtotalRaw, 2);
  const ohp = fixedDecimal(subtotal.times(ohpRate).div(100), 2);
  const dpp = fixedDecimal(subtotal.plus(ohp), 2);
  const ppn = calcPpn(dpp, ppnPercent);
  const grandTotal = fixedDecimal(dpp.plus(ppn), 2);

  return {
    subtotal: subtotal.toString(),
    ohp: ohp.toString(),
    dpp: dpp.toString(),
    ppn: ppn.toString(),
    grandTotal: grandTotal.toString(),
  };
}

export function calcBom(lines: BomInputLine[]): BomResultRow[] {
  const grouped = new Map<
    string,
    {
      resourceId: string;
      resourceCode: string;
      resourceName: string;
      resourceUnit: string;
      resourceType: ResourceType;
      acc: Decimal;
    }
  >();

  for (const line of lines) {
    const vol = parseStrictDecimal(line.volume, 'Volume');
    const coef = parseStrictDecimal(line.coefficient, 'Koefisien');
    const qty = vol.times(coef);

    const existing = grouped.get(line.resourceId);
    if (existing) {
      existing.acc = existing.acc.plus(qty);
    } else {
      grouped.set(line.resourceId, {
        resourceId: line.resourceId,
        resourceCode: line.resourceCode,
        resourceName: line.resourceName,
        resourceUnit: line.resourceUnit,
        resourceType: line.resourceType,
        acc: qty,
      });
    }
  }

  const order: Record<ResourceType, number> = {
    MATERIAL: 0,
    LABOR: 1,
    EQUIPMENT: 2,
  };

  return Array.from(grouped.values())
    .map((entry) => ({
      resourceId: entry.resourceId,
      resourceCode: entry.resourceCode,
      resourceName: entry.resourceName,
      resourceUnit: entry.resourceUnit,
      resourceType: entry.resourceType,
      quantity: fixedDecimal(entry.acc, 4).toString(),
    }))
    .sort((a, b) => {
      const typeDiff = order[a.resourceType] - order[b.resourceType];
      if (typeDiff !== 0) return typeDiff;
      return a.resourceCode.localeCompare(b.resourceCode);
    });
}

export function calcFromSnapshotRows(
  rows: SnapshotCalcRow[],
  ohpPercent: string | Decimal,
  ppnPercent: string | Decimal
): {
  takeoffs: SnapshotTakeoffSummary[];
  totals: ProjectTotalsResult;
  bom: BomResultRow[];
} {
  const byTakeoff = new Map<string, SnapshotCalcRow[]>();
  for (const row of rows) {
    const list = byTakeoff.get(row.takeoffId);
    if (list) {
      list.push(row);
    } else {
      byTakeoff.set(row.takeoffId, [row]);
    }
  }

  const takeoffs: SnapshotTakeoffSummary[] = [];
  const baseTotals: string[] = [];

  for (const [takeoffId, group] of byTakeoff.entries()) {
    const first = group[0];
    const hsp = calcHsp(
      group.map((g) => ({ coefficient: g.coefficient, price: g.frozenPrice }))
    );
    const baseTotal = calcBaseTotal(first.volume, hsp);
    baseTotals.push(baseTotal.toString());

    takeoffs.push({
      takeoffId,
      wbsPath: first.wbsPath,
      description: first.description,
      sortOrder: first.sortOrder,
      volume: parseStrictDecimal(first.volume, 'Volume')
        .toFixed(4, Decimal.ROUND_HALF_UP),
      ahspCode: first.ahspCode,
      ahspName: first.ahspName,
      ahspUnit: first.ahspUnit,
      hsp: hsp.toString(),
      baseTotal: baseTotal.toString(),
    });
  }

  takeoffs.sort((a, b) => {
    const pathCmp = a.wbsPath.localeCompare(b.wbsPath);
    if (pathCmp !== 0) return pathCmp;
    return a.sortOrder - b.sortOrder;
  });

  const totals = calcProjectTotals(baseTotals, ohpPercent, ppnPercent);

  const bom = calcBom(
    rows.map((r) => ({
      resourceId: r.resourceId ?? r.resourceCode,
      resourceCode: r.resourceCode,
      resourceName: r.resourceName,
      resourceUnit: r.resourceUnit,
      resourceType: r.resourceType,
      volume: r.volume,
      coefficient: r.coefficient,
    }))
  );

  return { takeoffs, totals, bom };
}

export function calcCostPerM2(
  grandTotal: string | Decimal,
  buildingAreaM2: string | Decimal | null | undefined
): string | null {
  if (buildingAreaM2 === null || buildingAreaM2 === undefined) {
    return null;
  }
  if (typeof buildingAreaM2 === 'string' && buildingAreaM2.trim() === '') {
    return null;
  }
  const area = parseStrictDecimal(buildingAreaM2, 'Luas Bangunan');
  if (area.lte(0)) {
    return null;
  }
  const total = parseStrictDecimal(grandTotal, 'Grand Total');
  return fixedDecimal(total.div(area), 2).toString();
}

export type SubTakeoffFormula = 'RECT' | 'TRAPEZOID' | 'GABLE_ROOF' | 'REBAR_KG';

export interface SubTakeoffItemInput {
  id: string;
  label: string;
  op: 'ADD' | 'DEDUCT';
  formula: SubTakeoffFormula;
  length: string | null;
  width: string | null;
  height: string | null;
  count: string | null;
  topWidth?: string | null;
  bottomWidth?: string | null;
  span?: string | null;
  rise?: string | null;
  diameterMm?: string | null;
}

export interface SubTakeoffBreakdownResult {
  items: Array<SubTakeoffItemInput & { volume: string }>;
  totalAdd: string;
  totalDeduct: string;
  netVolume: string;
}

export function calcSubTakeoffItemVolume(item: SubTakeoffItemInput): Decimal {
  if (item.formula === 'RECT') {
    return calcVolume({
      length: item.length,
      width: item.width,
      height: item.height,
      count: item.count,
      deduction: '0',
    });
  }

  const c =
    item.count === null || item.count === undefined
      ? new Decimal(1)
      : parseStrictDecimal(item.count, 'Jumlah');
  if (c.lt(0) || (item.count !== null && item.count !== undefined && !c.isInteger())) {
    throw new RabValidationError(
      'NEGATIVE_INPUT',
      'Jumlah harus berupa bilangan bulat >= 0.'
    );
  }

  if (item.formula === 'TRAPEZOID') {
    const topW = parseStrictDecimal(item.topWidth ?? '', 'Lebar Atas');
    const botW = parseStrictDecimal(item.bottomWidth ?? '', 'Lebar Bawah');
    const h = parseStrictDecimal(item.height ?? '', 'Tinggi');
    const l = parseStrictDecimal(item.length ?? '', 'Panjang');
    if (topW.lt(0) || botW.lt(0) || h.lt(0) || l.lt(0)) {
      throw new RabValidationError(
        'NEGATIVE_INPUT',
        'Dimensi trapesium tidak boleh negatif.'
      );
    }
    const raw = topW.plus(botW).div(2).times(h).times(l).times(c);
    return fixedDecimal(raw, 4);
  }

  if (item.formula === 'GABLE_ROOF') {
    const l = parseStrictDecimal(item.length ?? '', 'Panjang Atap');
    const span = parseStrictDecimal(item.span ?? '', 'Bentang Atap');
    const rise = parseStrictDecimal(item.rise ?? '', 'Tinggi Puncak');
    if (l.lt(0) || span.lte(0) || rise.lt(0)) {
      throw new RabValidationError(
        'NEGATIVE_INPUT',
        'Dimensi atap miring harus valid (bentang > 0, panjang & tinggi >= 0).'
      );
    }
    const halfSpan = span.div(2);
    const slopeFactor = new Decimal(1).plus(rise.div(halfSpan).pow(2)).sqrt();
    const area = l.times(span).times(slopeFactor).times(c);
    return fixedDecimal(area, 4);
  }

  // REBAR_KG: 0.006165 * d(mm)^2 * length(m) * count
  const d = parseStrictDecimal(item.diameterMm ?? '', 'Diameter Besi (mm)');
  const l = parseStrictDecimal(item.length ?? '', 'Panjang Batang (m)');
  if (d.lte(0) || l.lt(0)) {
    throw new RabValidationError(
      'NEGATIVE_INPUT',
      'Diameter besi harus > 0 dan panjang >= 0.'
    );
  }
  const weight = new Decimal('0.006165').times(d.pow(2)).times(l).times(c);
  return fixedDecimal(weight, 4);
}

export function calcSubTakeoffBreakdown(
  items: SubTakeoffItemInput[]
): SubTakeoffBreakdownResult {
  if (items.length === 0) {
    throw new RabValidationError(
      'ALL_DIMENSIONS_NULL',
      'Minimal harus ada 1 rincian sub-takeoff.'
    );
  }

  let addAcc = new Decimal(0);
  let deductAcc = new Decimal(0);
  let hasAdd = false;

  const computedItems = items.map((item) => {
    const vol = calcSubTakeoffItemVolume(item);
    if (item.op === 'ADD') {
      hasAdd = true;
      addAcc = addAcc.plus(vol);
    } else {
      deductAcc = deductAcc.plus(vol);
    }
    return {
      ...item,
      volume: vol.toString(),
    };
  });

  if (!hasAdd) {
    throw new RabValidationError(
      'NEGATIVE_VOLUME',
      'Harus ada minimal 1 baris penambah (ADD) pada rincian takeoff.'
    );
  }

  const totalAdd = fixedDecimal(addAcc, 4).toString();
  const totalDeduct = fixedDecimal(deductAcc, 4).toString();
  const netVolume = calcVolume({
    length: totalAdd,
    width: null,
    height: null,
    count: null,
    deduction: totalDeduct,
  }).toString();

  return {
    items: computedItems,
    totalAdd,
    totalDeduct,
    netVolume,
  };
}

// =============================================================================
// ARCHITECT WORKFLOW v1.2: Feasibility, WBS Recap & Weight, S-Curve, VE / VO
// =============================================================================

export type FinishingGrade = 'STANDARD' | 'MEDIUM' | 'LUXURY';

export interface FeasibilityInput {
  buildingAreaM2: string;
  floors: number;
  grade: FinishingGrade;
  customBaseRatePerM2?: string | null;
  ohpPercent: string;
  ppnPercent: string;
}

export interface FeasibilityDivisionRow {
  code: string;
  name: string;
  weightPercent: string;
  estimatedBaseCost: string;
  startWeek: number;
  durationWeeks: number;
}

export interface FeasibilityEstimateResult {
  areaM2: string;
  floors: number;
  grade: FinishingGrade;
  unitRatePerM2: string;
  subtotal: string;
  ohp: string;
  dpp: string;
  ppn: string;
  grandTotal: string;
  costPerM2Final: string;
  divisions: FeasibilityDivisionRow[];
}

export const FEASIBILITY_BASE_RATES: Record<FinishingGrade, string> = {
  STANDARD: '4500000.00',
  MEDIUM: '6500000.00',
  LUXURY: '9500000.00',
};

const FEASIBILITY_DIVISION_TEMPLATES: ReadonlyArray<{
  code: string;
  name: string;
  weightPercent: string;
  startWeek: number;
  durationWeeks: number;
}> = [
  {
    code: 'DIV-01',
    name: 'Pekerjaan Persiapan & Bouwplank',
    weightPercent: '3.00',
    startWeek: 1,
    durationWeeks: 2,
  },
  {
    code: 'DIV-02',
    name: 'Pekerjaan Tanah & Pondasi',
    weightPercent: '10.00',
    startWeek: 2,
    durationWeeks: 3,
  },
  {
    code: 'DIV-03',
    name: 'Pekerjaan Struktur Beton Bertulang',
    weightPercent: '32.00',
    startWeek: 4,
    durationWeeks: 6,
  },
  {
    code: 'DIV-04',
    name: 'Pekerjaan Pasangan & Plesteran Dinding',
    weightPercent: '18.00',
    startWeek: 7,
    durationWeeks: 5,
  },
  {
    code: 'DIV-05',
    name: 'Pekerjaan Rangka & Penutup Atap',
    weightPercent: '11.00',
    startWeek: 10,
    durationWeeks: 3,
  },
  {
    code: 'DIV-06',
    name: 'Pekerjaan Penutup Lantai & Plafon',
    weightPercent: '14.00',
    startWeek: 12,
    durationWeeks: 4,
  },
  {
    code: 'DIV-07',
    name: 'Pekerjaan Pengecatan, Finishing & MEP',
    weightPercent: '12.00',
    startWeek: 14,
    durationWeeks: 3,
  },
];

export function calcFeasibilityEstimate(
  input: FeasibilityInput
): FeasibilityEstimateResult {
  const area = parseStrictDecimal(input.buildingAreaM2, 'Luas Bangunan (m2)');
  if (area.lte(0)) {
    throw new RabValidationError(
      'NEGATIVE_INPUT',
      'Luas bangunan harus lebih besar dari 0 m2.'
    );
  }

  const floorsDec = parseStrictDecimal(String(input.floors), 'Jumlah Lantai');
  if (!floorsDec.isInteger() || floorsDec.lt(1)) {
    throw new RabValidationError(
      'NEGATIVE_INPUT',
      'Jumlah lantai harus berupa bilangan bulat >= 1.'
    );
  }
  const floorsInt = floorsDec.toNumber();

  let effectiveRate: Decimal;
  if (
    input.customBaseRatePerM2 !== undefined &&
    input.customBaseRatePerM2 !== null &&
    input.customBaseRatePerM2.trim() !== ''
  ) {
    effectiveRate = parseStrictDecimal(
      input.customBaseRatePerM2,
      'Harga Satuan per m2'
    );
    if (effectiveRate.lte(0)) {
      throw new RabValidationError(
        'NEGATIVE_INPUT',
        'Harga satuan per m2 harus lebih besar dari 0.'
      );
    }
  } else {
    const baseRate = new Decimal(FEASIBILITY_BASE_RATES[input.grade]);
    const floorMultiplier = new Decimal(1).plus(
      new Decimal(floorsInt - 1).times('0.08')
    );
    effectiveRate = baseRate.times(floorMultiplier);
  }

  const unitRate = fixedDecimal(effectiveRate, 2);
  const rawSubtotal = fixedDecimal(area.times(unitRate), 2);
  const totals = calcProjectTotals(
    [rawSubtotal.toString()],
    input.ohpPercent,
    input.ppnPercent
  );

  const subtotalDec = new Decimal(totals.subtotal);
  let allocated = new Decimal(0);
  const divisions: FeasibilityDivisionRow[] = FEASIBILITY_DIVISION_TEMPLATES.map(
    (tpl, idx) => {
      const isLast = idx === FEASIBILITY_DIVISION_TEMPLATES.length - 1;
      const costDec = isLast
        ? fixedDecimal(subtotalDec.minus(allocated), 2)
        : fixedDecimal(subtotalDec.times(tpl.weightPercent).div(100), 2);
      allocated = allocated.plus(costDec);

      return {
        code: tpl.code,
        name: tpl.name,
        weightPercent: tpl.weightPercent,
        estimatedBaseCost: costDec.toString(),
        startWeek: tpl.startWeek,
        durationWeeks: tpl.durationWeeks,
      };
    }
  );

  const costPerM2Final = calcCostPerM2(totals.grandTotal, area) ?? '0.00';

  return {
    areaM2: fixedDecimal(area, 2).toString(),
    floors: floorsInt,
    grade: input.grade,
    unitRatePerM2: unitRate.toString(),
    subtotal: totals.subtotal,
    ohp: totals.ohp,
    dpp: totals.dpp,
    ppn: totals.ppn,
    grandTotal: totals.grandTotal,
    costPerM2Final,
    divisions,
  };
}

export interface WbsRecapInputItem {
  wbsId: string;
  code: string;
  name: string;
  subtotal: string; // 2 dp baseTotal sum
  startWeek: number;
  durationWeeks: number;
}

export interface WbsRecapRow extends WbsRecapInputItem {
  weightPercent: string; // 2 dp, sum = 100.00 when totalSubtotal > 0
  clientSubtotalWithOhp: string; // 2 dp, subtotal * (1 + ohpPercent/100)
}

export function calcWbsRecap(
  items: WbsRecapInputItem[],
  projectSubtotal: string | Decimal,
  ohpPercent: string | Decimal
): WbsRecapRow[] {
  if (items.length === 0) return [];

  const totalSub = parseStrictDecimal(projectSubtotal, 'Subtotal Proyek');
  const ohpRate = parseStrictDecimal(ohpPercent, 'Margin OHP');
  if (ohpRate.lt(0)) {
    throw new RabValidationError('NEGATIVE_INPUT', 'Margin OHP tidak boleh negatif.');
  }

  const ohpMultiplier = new Decimal(1).plus(ohpRate.div(100));
  const ohpAmount = fixedDecimal(totalSub.times(ohpRate).div(100), 2);
  const dpp = fixedDecimal(totalSub.plus(ohpAmount), 2);

  const parsedSubs = items.map((item) =>
    fixedDecimal(parseStrictDecimal(item.subtotal, `Subtotal ${item.name}`), 2)
  );
  const sumItemsSub = parsedSubs.reduce((acc, s) => acc.plus(s), new Decimal(0));
  const shouldReconcileTotal = totalSub.gt(0) && sumItemsSub.eq(totalSub);

  let lastPositiveIdx = -1;
  parsedSubs.forEach((s, i) => {
    if (s.gt(0)) lastPositiveIdx = i;
  });

  let sumWeight = new Decimal(0);
  let sumClient = new Decimal(0);

  return items.map((item, idx) => {
    const subDec = parsedSubs[idx];
    const startWeek = Math.max(1, Math.min(104, Math.trunc(item.startWeek || 1)));
    const durationWeeks = Math.max(
      1,
      Math.min(104, Math.trunc(item.durationWeeks || 1))
    );

    if (totalSub.lte(0) || subDec.lte(0)) {
      return {
        ...item,
        subtotal: subDec.toString(),
        startWeek,
        durationWeeks,
        weightPercent: '0.00',
        clientSubtotalWithOhp: '0.00',
      };
    }

    let weightDec: Decimal;
    let clientDec: Decimal;

    if (shouldReconcileTotal && idx === lastPositiveIdx) {
      weightDec = fixedDecimal(new Decimal(100).minus(sumWeight), 2);
      clientDec = fixedDecimal(dpp.minus(sumClient), 2);
    } else {
      weightDec = fixedDecimal(subDec.div(totalSub).times(100), 2);
      clientDec = fixedDecimal(subDec.times(ohpMultiplier), 2);
      sumWeight = sumWeight.plus(weightDec);
      sumClient = sumClient.plus(clientDec);
    }

    return {
      ...item,
      subtotal: subDec.toString(),
      startWeek,
      durationWeeks,
      weightPercent: weightDec.toString(),
      clientSubtotalWithOhp: clientDec.toString(),
    };
  });
}

export interface SCurveRowAllocation {
  wbsId: string;
  wbsName: string;
  subtotal: string;
  weightPercent: string;
  startWeek: number;
  durationWeeks: number;
  weeklyWeights: Record<number, string>;
}

export interface SCurveWeekPoint {
  week: number;
  weeklyWeight: string;
  cumulativeWeight: string;
  weeklyCost: string;
  cumulativeCost: string;
}

export interface SCurveResult {
  totalWeeks: number;
  rows: SCurveRowAllocation[];
  weeks: SCurveWeekPoint[];
}

export function calcSCurve(
  recapRows: WbsRecapRow[],
  projectSubtotal: string | Decimal
): SCurveResult {
  const totalSub = parseStrictDecimal(projectSubtotal, 'Subtotal Proyek');
  if (recapRows.length === 0) {
    return { totalWeeks: 1, rows: [], weeks: [] };
  }

  let maxEndWeek = 1;
  const rows: SCurveRowAllocation[] = recapRows.map((row) => {
    const startWeek = Math.max(1, Math.min(104, Math.trunc(row.startWeek || 1)));
    const rawDuration = Math.max(1, Math.min(104, Math.trunc(row.durationWeeks || 1)));
    const endWeek = Math.min(104, startWeek + rawDuration - 1);
    const effectiveDuration = endWeek - startWeek + 1;

    if (endWeek > maxEndWeek) maxEndWeek = endWeek;

    const wRow = parseStrictDecimal(row.weightPercent, `Bobot ${row.name}`);
    const weeklyWeights: Record<number, string> = {};

    if (wRow.eq(0)) {
      for (let wk = startWeek; wk <= endWeek; wk += 1) {
        weeklyWeights[wk] = '0.00';
      }
    } else {
      const perWeek = fixedDecimal(wRow.div(effectiveDuration), 2);
      let acc = new Decimal(0);
      for (let wk = startWeek; wk < endWeek; wk += 1) {
        weeklyWeights[wk] = perWeek.toString();
        acc = acc.plus(perWeek);
      }
      weeklyWeights[endWeek] = fixedDecimal(wRow.minus(acc), 2).toString();
    }

    return {
      wbsId: row.wbsId,
      wbsName: row.name,
      subtotal: row.subtotal,
      weightPercent: row.weightPercent,
      startWeek,
      durationWeeks: effectiveDuration,
      weeklyWeights,
    };
  });

  const weeklyWeightMap = new Map<number, Decimal>();
  let lastActiveWeek = 0;
  for (let wk = 1; wk <= maxEndWeek; wk += 1) {
    let sumWk = new Decimal(0);
    for (const r of rows) {
      const cell = r.weeklyWeights[wk];
      if (cell) {
        sumWk = sumWk.plus(new Decimal(cell));
      }
    }
    const roundedWk = fixedDecimal(sumWk, 2);
    weeklyWeightMap.set(wk, roundedWk);
    if (roundedWk.gt(0)) {
      lastActiveWeek = wk;
    }
  }

  let cumWeight = new Decimal(0);
  let cumCost = new Decimal(0);
  const weeks: SCurveWeekPoint[] = [];

  for (let wk = 1; wk <= maxEndWeek; wk += 1) {
    const wkWeight = weeklyWeightMap.get(wk) ?? new Decimal(0);
    cumWeight = fixedDecimal(cumWeight.plus(wkWeight), 2);

    let wkCost: Decimal;
    if (totalSub.lte(0) || lastActiveWeek === 0 || wkWeight.eq(0)) {
      wkCost = fixedDecimal(new Decimal(0), 2);
    } else if (wk === lastActiveWeek) {
      wkCost = fixedDecimal(totalSub.minus(cumCost), 2);
      cumCost = fixedDecimal(totalSub, 2);
    } else {
      wkCost = fixedDecimal(totalSub.times(wkWeight).div(100), 2);
      cumCost = fixedDecimal(cumCost.plus(wkCost), 2);
    }

    weeks.push({
      week: wk,
      weeklyWeight: wkWeight.toString(),
      cumulativeWeight: cumWeight.toString(),
      weeklyCost: wkCost.toString(),
      cumulativeCost: fixedDecimal(cumCost, 2).toString(),
    });
  }

  return {
    totalWeeks: maxEndWeek,
    rows,
    weeks,
  };
}

export type VariationStatus =
  | 'ADDED'
  | 'REMOVED'
  | 'MODIFIED_VOLUME'
  | 'MODIFIED_SPEC'
  | 'MODIFIED_BOTH'
  | 'UNCHANGED';

export interface ComparisonRowInput {
  id: string;
  wbsPath: string;
  description: string;
  ahspCode: string;
  ahspName: string;
  unit: string;
  volume: string;
  hsp: string;
  baseTotal: string;
}

export interface VariationItemRow {
  key: string;
  wbsPath: string;
  description: string;
  unit: string;
  status: VariationStatus;
  baseAhspCode: string | null;
  revisedAhspCode: string | null;
  baseVolume: string;
  revisedVolume: string;
  deltaVolume: string;
  baseHsp: string;
  revisedHsp: string;
  baseTotal: string;
  revisedTotal: string;
  deltaTotal: string;
}

export interface ProjectComparisonResult {
  items: VariationItemRow[];
  baseSubtotal: string;
  revisedSubtotal: string;
  totalAddition: string;
  totalDeduction: string;
  netDeltaSubtotal: string;
  baseGrandTotal: string;
  revisedGrandTotal: string;
  netDeltaGrandTotal: string;
  deltaPercent: string;
}

function buildComparisonKeyedMap(rows: ComparisonRowInput[]) {
  const counts = new Map<string, number>();
  const ordered: Array<{ key: string; row: ComparisonRowInput }> = [];
  const byKey = new Map<string, ComparisonRowInput>();

  for (const r of rows) {
    const baseKey = `${r.wbsPath.trim().toLowerCase()}||${r.description
      .trim()
      .toLowerCase()}`;
    const occ = (counts.get(baseKey) ?? 0) + 1;
    counts.set(baseKey, occ);
    const key = `${baseKey}#${occ}`;
    ordered.push({ key, row: r });
    byKey.set(key, r);
  }

  return { ordered, byKey };
}

export function calcProjectComparison(params: {
  baseRows: ComparisonRowInput[];
  revisedRows: ComparisonRowInput[];
  baseTotals: ProjectTotalsResult;
  revisedTotals: ProjectTotalsResult;
}): ProjectComparisonResult {
  const baseIndexed = buildComparisonKeyedMap(params.baseRows);
  const revIndexed = buildComparisonKeyedMap(params.revisedRows);

  const items: VariationItemRow[] = [];
  const seenKeys = new Set<string>();

  const pushPair = (
    key: string,
    b: ComparisonRowInput | undefined,
    r: ComparisonRowInput | undefined
  ) => {
    if (!b && r) {
      const rVol = fixedDecimal(parseStrictDecimal(r.volume, 'Vol Revisi'), 4);
      const rHsp = parseStrictDecimal(r.hsp, 'HSP Revisi');
      const rTot = fixedDecimal(parseStrictDecimal(r.baseTotal, 'Total Revisi'), 2);
      items.push({
        key,
        wbsPath: r.wbsPath,
        description: r.description,
        unit: r.unit,
        status: 'ADDED',
        baseAhspCode: null,
        revisedAhspCode: r.ahspCode,
        baseVolume: '0.0000',
        revisedVolume: rVol.toString(),
        deltaVolume: rVol.toString(),
        baseHsp: '0.00',
        revisedHsp: rHsp.toString(),
        baseTotal: '0.00',
        revisedTotal: rTot.toString(),
        deltaTotal: rTot.toString(),
      });
      return;
    }

    if (b && !r) {
      const bVol = fixedDecimal(parseStrictDecimal(b.volume, 'Vol Awal'), 4);
      const bHsp = parseStrictDecimal(b.hsp, 'HSP Awal');
      const bTot = fixedDecimal(parseStrictDecimal(b.baseTotal, 'Total Awal'), 2);
      const dVol = fixedDecimal(new Decimal(0).minus(bVol), 4);
      const dTot = fixedDecimal(new Decimal(0).minus(bTot), 2);
      items.push({
        key,
        wbsPath: b.wbsPath,
        description: b.description,
        unit: b.unit,
        status: 'REMOVED',
        baseAhspCode: b.ahspCode,
        revisedAhspCode: null,
        baseVolume: bVol.toString(),
        revisedVolume: '0.0000',
        deltaVolume: dVol.toString(),
        baseHsp: bHsp.toString(),
        revisedHsp: '0.00',
        baseTotal: bTot.toString(),
        revisedTotal: '0.00',
        deltaTotal: dTot.toString(),
      });
      return;
    }

    if (b && r) {
      const bVol = fixedDecimal(parseStrictDecimal(b.volume, 'Vol Awal'), 4);
      const rVol = fixedDecimal(parseStrictDecimal(r.volume, 'Vol Revisi'), 4);
      const bHsp = parseStrictDecimal(b.hsp, 'HSP Awal');
      const rHsp = parseStrictDecimal(r.hsp, 'HSP Revisi');
      const bTot = fixedDecimal(parseStrictDecimal(b.baseTotal, 'Total Awal'), 2);
      const rTot = fixedDecimal(parseStrictDecimal(r.baseTotal, 'Total Revisi'), 2);

      const volChanged = !bVol.eq(rVol);
      const specChanged = b.ahspCode !== r.ahspCode || !bHsp.eq(rHsp);

      let status: VariationStatus = 'UNCHANGED';
      if (volChanged && specChanged) status = 'MODIFIED_BOTH';
      else if (volChanged) status = 'MODIFIED_VOLUME';
      else if (specChanged) status = 'MODIFIED_SPEC';

      const dVol = fixedDecimal(rVol.minus(bVol), 4);
      const dTot = fixedDecimal(rTot.minus(bTot), 2);

      items.push({
        key,
        wbsPath: r.wbsPath,
        description: r.description,
        unit: r.unit,
        status,
        baseAhspCode: b.ahspCode,
        revisedAhspCode: r.ahspCode,
        baseVolume: bVol.toString(),
        revisedVolume: rVol.toString(),
        deltaVolume: dVol.toString(),
        baseHsp: bHsp.toString(),
        revisedHsp: rHsp.toString(),
        baseTotal: bTot.toString(),
        revisedTotal: rTot.toString(),
        deltaTotal: dTot.toString(),
      });
    }
  };

  for (const entry of baseIndexed.ordered) {
    seenKeys.add(entry.key);
    pushPair(entry.key, entry.row, revIndexed.byKey.get(entry.key));
  }
  for (const entry of revIndexed.ordered) {
    if (!seenKeys.has(entry.key)) {
      pushPair(entry.key, undefined, entry.row);
    }
  }

  let addAcc = new Decimal(0);
  let dedAcc = new Decimal(0);
  for (const item of items) {
    const d = new Decimal(item.deltaTotal);
    if (d.gt(0)) addAcc = addAcc.plus(d);
    else if (d.lt(0)) dedAcc = dedAcc.plus(d.abs());
  }

  const baseSub = fixedDecimal(
    parseStrictDecimal(params.baseTotals.subtotal, 'Base Subtotal'),
    2
  );
  const revSub = fixedDecimal(
    parseStrictDecimal(params.revisedTotals.subtotal, 'Revised Subtotal'),
    2
  );
  const netDeltaSub = fixedDecimal(revSub.minus(baseSub), 2);

  const baseGrand = fixedDecimal(
    parseStrictDecimal(params.baseTotals.grandTotal, 'Base Grand Total'),
    2
  );
  const revGrand = fixedDecimal(
    parseStrictDecimal(params.revisedTotals.grandTotal, 'Revised Grand Total'),
    2
  );
  const netDeltaGrand = fixedDecimal(revGrand.minus(baseGrand), 2);

  const deltaPercent = baseGrand.gt(0)
    ? fixedDecimal(netDeltaGrand.div(baseGrand).times(100), 2)
    : fixedDecimal(new Decimal(0), 2);

  return {
    items,
    baseSubtotal: baseSub.toString(),
    revisedSubtotal: revSub.toString(),
    totalAddition: fixedDecimal(addAcc, 2).toString(),
    totalDeduction: fixedDecimal(dedAcc, 2).toString(),
    netDeltaSubtotal: netDeltaSub.toString(),
    baseGrandTotal: baseGrand.toString(),
    revisedGrandTotal: revGrand.toString(),
    netDeltaGrandTotal: netDeltaGrand.toString(),
    deltaPercent: deltaPercent.toString(),
  };
}
