import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  RabValidationError,
  calcBaseTotal,
  calcBom,
  calcCostPerM2,
  calcFeasibilityEstimate,
  calcFromSnapshotRows,
  calcHsp,
  calcPpn,
  calcProjectComparison,
  calcProjectTotals,
  calcSCurve,
  calcSubTakeoffBreakdown,
  calcVolume,
  calcWbsRecap,
} from './calc';

describe('OpenRAB calc.ts — Acuan Unit Test 1–4, 6–7', () => {
  it('TEST 1: Angka bulat (Grand Total 3094014.00)', () => {
    const volume = calcVolume({
      length: '10',
      width: null,
      height: '2',
      count: null,
      deduction: '0',
    });
    expect(volume.toString()).toBe('20.0000');

    const hsp = calcHsp([
      { coefficient: '70.00', price: '800' },
      { coefficient: '11.50', price: '1300' },
      { coefficient: '0.043', price: '250000' },
      { coefficient: '0.30', price: '150000' },
    ]);
    expect(hsp.toString()).toBe('126700');

    const baseTotal = calcBaseTotal(volume, hsp);
    expect(baseTotal.toString()).toBe('2534000.00');

    const totals = calcProjectTotals([baseTotal.toString()], '10', '11');
    expect(totals.subtotal).toBe('2534000.00');
    expect(totals.ohp).toBe('253400.00');
    expect(totals.dpp).toBe('2787400.00');
    expect(totals.ppn).toBe('306614.00');
    expect(totals.grandTotal).toBe('3094014.00');
  });

  it('TEST 2: Pecahan, pengurang, null, pembulatan (HSP tidak dibulatkan dulu)', () => {
    const volume = calcVolume({
      length: '5.25',
      width: null,
      height: '3',
      count: null,
      deduction: '2.15',
    });
    expect(volume.toString()).toBe('13.6000');

    const hsp = calcHsp([
      { coefficient: '70.00', price: '850.50' },
      { coefficient: '11.50', price: '1350.25' },
    ]);
    expect(hsp.toString()).toBe('75062.875');

    const baseTotal = calcBaseTotal(volume, hsp);
    expect(baseTotal.toString()).toBe('1020855.10');

    const totals = calcProjectTotals([baseTotal.toString()], '10', '11');
    expect(totals.ohp).toBe('102085.51');
    expect(totals.dpp).toBe('1122940.61');
    expect(totals.ppn).toBe('123523.47');
    expect(totals.grandTotal).toBe('1246464.08');
  });

  it('TEST 3: HALF_UP pada titik .xx5', () => {
    const ppn = calcPpn('1001.50', '11');
    expect(ppn.toString()).toBe('110.17');

    const totals = calcProjectTotals(['1001.50'], '0', '11');
    expect(totals.ppn).toBe('110.17');
  });

  it('TEST 4: Validasi volume (0 vs null)', () => {
    // 1. P=5.25, L=0, T=3, deduction 0 -> volume 0.0000 (BUKAN error)
    expect(
      calcVolume({
        length: '5.25',
        width: '0',
        height: '3',
        count: null,
        deduction: '0',
      }).toString()
    ).toBe('0.0000');

    // 2. P=5.25, L=0, T=3, deduction 2.15 -> ERROR NEGATIVE_VOLUME
    try {
      calcVolume({
        length: '5.25',
        width: '0',
        height: '3',
        count: null,
        deduction: '2.15',
      });
      expect.unreachable('Expected NEGATIVE_VOLUME');
    } catch (err) {
      expect(err).toBeInstanceOf(RabValidationError);
      expect((err as RabValidationError).code).toBe('NEGATIVE_VOLUME');
    }

    // 3. P, L, T, Count semuanya null -> ERROR ALL_DIMENSIONS_NULL
    try {
      calcVolume({
        length: null,
        width: null,
        height: null,
        count: null,
        deduction: '0',
      });
      expect.unreachable('Expected ALL_DIMENSIONS_NULL');
    } catch (err) {
      expect(err).toBeInstanceOf(RabValidationError);
      expect((err as RabValidationError).code).toBe('ALL_DIMENSIONS_NULL');
    }

    // 4. P=5.25, T=3, deduction 20 -> ERROR NEGATIVE_VOLUME
    try {
      calcVolume({
        length: '5.25',
        width: null,
        height: '3',
        count: null,
        deduction: '20',
      });
      expect.unreachable('Expected NEGATIVE_VOLUME');
    } catch (err) {
      expect(err).toBeInstanceOf(RabValidationError);
      expect((err as RabValidationError).code).toBe('NEGATIVE_VOLUME');
    }

    // 5. Count=0, P=5 -> volume 0.0000 (valid)
    expect(
      calcVolume({
        length: '5',
        width: null,
        height: null,
        count: '0',
        deduction: '0',
      }).toString()
    ).toBe('0.0000');

    // 6. P=-1 -> ERROR NEGATIVE_INPUT
    try {
      calcVolume({
        length: '-1',
        width: null,
        height: null,
        count: null,
        deduction: '0',
      });
      expect.unreachable('Expected NEGATIVE_INPUT');
    } catch (err) {
      expect(err).toBeInstanceOf(RabValidationError);
      expect((err as RabValidationError).code).toBe('NEGATIVE_INPUT');
    }

    // 7. Presisi: P=0.125, L=1, T=1, Count=3 -> 0.3750
    expect(
      calcVolume({
        length: '0.125',
        width: '1',
        height: '1',
        count: '3',
        deduction: '0',
      }).toString()
    ).toBe('0.3750');
  });

  it('TEST 6: BOM aggregation 4 desimal HALF_UP', () => {
    const bom = calcBom([
      {
        resourceId: 'res-bata',
        resourceCode: 'MAT-BATA',
        resourceName: 'Bata Merah',
        resourceUnit: 'bh',
        resourceType: 'MATERIAL',
        volume: '20.0000',
        coefficient: '70.00',
      },
      {
        resourceId: 'res-semen',
        resourceCode: 'MAT-SEMEN',
        resourceName: 'Semen PC',
        resourceUnit: 'kg',
        resourceType: 'MATERIAL',
        volume: '20.0000',
        coefficient: '11.50',
      },
      {
        resourceId: 'res-bata',
        resourceCode: 'MAT-BATA',
        resourceName: 'Bata Merah',
        resourceUnit: 'bh',
        resourceType: 'MATERIAL',
        volume: '13.6000',
        coefficient: '70.00',
      },
      {
        resourceId: 'res-semen',
        resourceCode: 'MAT-SEMEN',
        resourceName: 'Semen PC',
        resourceUnit: 'kg',
        resourceType: 'MATERIAL',
        volume: '13.6000',
        coefficient: '11.50',
      },
    ]);

    const bata = bom.find((b) => b.resourceId === 'res-bata');
    const semen = bom.find((b) => b.resourceId === 'res-semen');
    expect(bata?.quantity).toBe('2352.0000');
    expect(semen?.quantity).toBe('386.4000');
  });

  it('TEST 7: Paritas Snapshot identik dengan jalur draft (Grand Total 3094014.00)', () => {
    const result = calcFromSnapshotRows(
      [
        {
          takeoffId: 'to-1',
          wbsPath: 'Struktur > Dinding',
          description: 'Pasangan dinding bata merah',
          sortOrder: 1,
          volume: '20.0000',
          ahspCode: 'AHSP-DINDING',
          ahspName: 'Pasangan dinding bata merah 1 m2',
          ahspUnit: 'm2',
          resourceCode: 'MAT-BATA',
          resourceName: 'Bata',
          resourceUnit: 'bh',
          resourceType: 'MATERIAL',
          coefficient: '70.0000',
          frozenPrice: '800.00',
        },
        {
          takeoffId: 'to-1',
          wbsPath: 'Struktur > Dinding',
          description: 'Pasangan dinding bata merah',
          sortOrder: 1,
          volume: '20.0000',
          ahspCode: 'AHSP-DINDING',
          ahspName: 'Pasangan dinding bata merah 1 m2',
          ahspUnit: 'm2',
          resourceCode: 'MAT-SEMEN',
          resourceName: 'Semen',
          resourceUnit: 'kg',
          resourceType: 'MATERIAL',
          coefficient: '11.5000',
          frozenPrice: '1300.00',
        },
        {
          takeoffId: 'to-1',
          wbsPath: 'Struktur > Dinding',
          description: 'Pasangan dinding bata merah',
          sortOrder: 1,
          volume: '20.0000',
          ahspCode: 'AHSP-DINDING',
          ahspName: 'Pasangan dinding bata merah 1 m2',
          ahspUnit: 'm2',
          resourceCode: 'MAT-PASIR',
          resourceName: 'Pasir',
          resourceUnit: 'm3',
          resourceType: 'MATERIAL',
          coefficient: '0.0430',
          frozenPrice: '250000.00',
        },
        {
          takeoffId: 'to-1',
          wbsPath: 'Struktur > Dinding',
          description: 'Pasangan dinding bata merah',
          sortOrder: 1,
          volume: '20.0000',
          ahspCode: 'AHSP-DINDING',
          ahspName: 'Pasangan dinding bata merah 1 m2',
          ahspUnit: 'm2',
          resourceCode: 'LBR-TUKANG',
          resourceName: 'Tukang',
          resourceUnit: 'OH',
          resourceType: 'LABOR',
          coefficient: '0.3000',
          frozenPrice: '150000.00',
        },
      ],
      '10.00',
      '11.00'
    );

    expect(result.totals.subtotal).toBe('2534000.00');
    expect(result.totals.ohp).toBe('253400.00');
    expect(result.totals.dpp).toBe('2787400.00');
    expect(result.totals.ppn).toBe('306614.00');
    expect(result.totals.grandTotal).toBe('3094014.00');
  });

  it('TEST 8: Golden Test — Validasi Hitungan RAB Riil (Dinding Bata + Plesteran 2 Sisi)', () => {
    // AHSP-01: Pemasangan 1 m2 dinding bata merah (1/2 bata) campuran 1 SP : 4 PP
    const hsp1 = calcHsp([
      { coefficient: '70.000', price: '900.00' },
      { coefficient: '11.500', price: '1600.00' },
      { coefficient: '0.043', price: '300000.00' },
      { coefficient: '0.300', price: '150000.00' },
      { coefficient: '0.100', price: '200000.00' },
      { coefficient: '0.010', price: '220000.00' },
      { coefficient: '0.015', price: '250000.00' },
    ]);
    expect(hsp1.toString()).toBe('165250');
    expect(hsp1.toFixed(2)).toBe('165250.00');

    // AHSP-02: Pemasangan 1 m2 plesteran 1 SP : 4 PP tebal 15 mm
    const hsp2 = calcHsp([
      { coefficient: '6.240', price: '1600.00' },
      { coefficient: '0.024', price: '300000.00' },
      { coefficient: '0.300', price: '150000.00' },
      { coefficient: '0.150', price: '200000.00' },
      { coefficient: '0.015', price: '220000.00' },
      { coefficient: '0.015', price: '250000.00' },
    ]);
    expect(hsp2.toString()).toBe('99234');
    expect(hsp2.toFixed(2)).toBe('99234.00');

    // Baris 1 (Takeoff): Pekerjaan Dinding Bata (AHSP-01)
    const vol1 = calcVolume({
      length: '10',
      width: null,
      height: '3.5',
      count: '1',
      deduction: '1.80',
    });
    expect(vol1.toString()).toBe('33.2000');

    const base1 = calcBaseTotal(vol1, hsp1);
    expect(base1.toString()).toBe('5486300.00');

    // Baris 2 (Takeoff): Pekerjaan Plesteran (AHSP-02, 2 sisi)
    const vol2 = calcVolume({
      length: '10',
      width: null,
      height: '3.5',
      count: '2',
      deduction: '3.60',
    });
    expect(vol2.toString()).toBe('66.4000');

    const base2 = calcBaseTotal(vol2, hsp2);
    expect(base2.toString()).toBe('6589137.60');

    // Rekapitulasi Proyek (Margin OHP 10.00%, PPN 11.00%)
    const totals = calcProjectTotals(
      [base1.toString(), base2.toString()],
      '10.00',
      '11.00'
    );
    expect(totals.subtotal).toBe('12075437.60');
    expect(totals.ohp).toBe('1207543.76');
    expect(totals.dpp).toBe('13282981.36');
    expect(totals.ppn).toBe('1461127.95');
    expect(totals.grandTotal).toBe('14744109.31');
  });

  it('Architect Helpers: calcCostPerM2 & Sub-Takeoff Formulas (RECT, TRAPEZOID, GABLE_ROOF, REBAR_KG)', () => {
    // Biaya per m2 bangunan (Rp 14.744.109,31 / 72 m2 = 204779.2959... -> 204779.30)
    expect(calcCostPerM2('14744109.31', '72.00')).toBe('204779.30');
    expect(calcCostPerM2('14744109.31', null)).toBeNull();
    expect(calcCostPerM2('14744109.31', '0')).toBeNull();

    // Multi-ruangan RECT + multi-bukaan DEDUCT
    const wallBreakdown = calcSubTakeoffBreakdown([
      {
        id: '1',
        label: 'Dinding As A-B',
        op: 'ADD',
        formula: 'RECT',
        length: '6',
        width: null,
        height: '3.5',
        count: '1',
      },
      {
        id: '2',
        label: 'Dinding Kamar Tidur',
        op: 'ADD',
        formula: 'RECT',
        length: '4',
        width: null,
        height: '3.5',
        count: '1',
      },
      {
        id: '3',
        label: 'Bukaan Pintu P1',
        op: 'DEDUCT',
        formula: 'RECT',
        length: '0.9',
        width: null,
        height: '2.0',
        count: '1',
      },
    ]);
    expect(wallBreakdown.totalAdd).toBe('35.0000');
    expect(wallBreakdown.totalDeduct).toBe('1.8000');
    expect(wallBreakdown.netVolume).toBe('33.2000');

    // Trapesium Pondasi Batu Kali: ((0.3 + 0.7)/2) * 0.8 * 20 * 1 = 8.0000
    const trap = calcSubTakeoffBreakdown([
      {
        id: 't1',
        label: 'Pondasi Menerus',
        op: 'ADD',
        formula: 'TRAPEZOID',
        topWidth: '0.30',
        bottomWidth: '0.70',
        height: '0.80',
        length: '20',
        width: null,
        count: '1',
      },
    ]);
    expect(trap.netVolume).toBe('8.0000');

    // Atap Miring Gable (segitiga 3-4-5): span=8, rise=3 => halfSpan=4, slopeFactor=1.25, area = 10 * 8 * 1.25 = 100.0000
    const roof = calcSubTakeoffBreakdown([
      {
        id: 'r1',
        label: 'Atap Pelana Utama',
        op: 'ADD',
        formula: 'GABLE_ROOF',
        length: '10',
        span: '8',
        rise: '3',
        width: null,
        height: null,
        count: '1',
      },
    ]);
    expect(roof.netVolume).toBe('100.0000');

    // Pembesian D12: 0.006165 * 12^2 * 12 * 1 = 10.65312 -> 10.6531 kg
    const rebar = calcSubTakeoffBreakdown([
      {
        id: 'b1',
        label: 'Tulangan Utama D12',
        op: 'ADD',
        formula: 'REBAR_KG',
        diameterMm: '12',
        length: '12',
        width: null,
        height: null,
        count: '1',
      },
    ]);
    expect(rebar.netVolume).toBe('10.6531');
  });

  it('Workflow v1.2 — Feasibility Estimator (Standard & Multi-Floor Medium)', () => {
    // 1 lantai 100 m2 STANDARD (4.500.000/m2): subtotal = 450.000.000.00, OHP 10% = 45jt, DPP = 495jt, PPN 11% = 54.45jt, Grand = 549.45jt
    const est1 = calcFeasibilityEstimate({
      buildingAreaM2: '100',
      floors: 1,
      grade: 'STANDARD',
      ohpPercent: '10',
      ppnPercent: '11',
    });
    expect(est1.unitRatePerM2).toBe('4500000.00');
    expect(est1.subtotal).toBe('450000000.00');
    expect(est1.ohp).toBe('45000000.00');
    expect(est1.dpp).toBe('495000000.00');
    expect(est1.ppn).toBe('54450000.00');
    expect(est1.grandTotal).toBe('549450000.00');
    expect(est1.divisions).toHaveLength(7);

    const divSum = est1.divisions.reduce(
      (acc, d) => acc.plus(new Decimal(d.estimatedBaseCost)),
      new Decimal(0)
    );
    expect(divSum.toFixed(2)).toBe(est1.subtotal);

    // 2 lantai 133.33 m2 MEDIUM (6.500.000 * 1.08 = 7.020.000/m2)
    const est2 = calcFeasibilityEstimate({
      buildingAreaM2: '133.33',
      floors: 2,
      grade: 'MEDIUM',
      ohpPercent: '10',
      ppnPercent: '11',
    });
    expect(est2.unitRatePerM2).toBe('7020000.00');
    const divSum2 = est2.divisions.reduce(
      (acc, d) => acc.plus(new Decimal(d.estimatedBaseCost)),
      new Decimal(0)
    );
    expect(divSum2.toFixed(2)).toBe(est2.subtotal);
  });

  it('Workflow v1.2 — WBS Recap Weights (100.00%) & S-Curve Cashflow', () => {
    // Three equal items of 1000.00 => total 3000.00 => 33.33% + 33.33% + 33.34% = 100.00%
    const recap = calcWbsRecap(
      [
        { wbsId: 'w1', code: 'I', name: 'Persiapan', subtotal: '1000.00', startWeek: 1, durationWeeks: 3 },
        { wbsId: 'w2', code: 'II', name: 'Struktur', subtotal: '1000.00', startWeek: 2, durationWeeks: 4 },
        { wbsId: 'w3', code: 'III', name: 'Arsitektur', subtotal: '1000.00', startWeek: 4, durationWeeks: 3 },
      ],
      '3000.00',
      '10.00'
    );

    expect(recap[0].weightPercent).toBe('33.33');
    expect(recap[1].weightPercent).toBe('33.33');
    expect(recap[2].weightPercent).toBe('33.34');

    const totalClientOhp = recap.reduce(
      (acc, r) => acc.plus(new Decimal(r.clientSubtotalWithOhp)),
      new Decimal(0)
    );
    expect(totalClientOhp.toFixed(2)).toBe('3300.00'); // 3000 + 10% OHP

    const sCurve = calcSCurve(recap, '3000.00');
    expect(sCurve.totalWeeks).toBe(6); // w3 starts week 4 + duration 3 => ends week 6
    expect(sCurve.weeks).toHaveLength(6);

    const lastWeek = sCurve.weeks[sCurve.weeks.length - 1];
    expect(lastWeek.cumulativeWeight).toBe('100.00');
    expect(lastWeek.cumulativeCost).toBe('3000.00');

    // Check individual row weekly weight sum equals row.weightPercent
    for (const row of sCurve.rows) {
      const rowSum = Object.values(row.weeklyWeights).reduce(
        (acc, v) => acc.plus(new Decimal(v)),
        new Decimal(0)
      );
      expect(rowSum.toFixed(2)).toBe(row.weightPercent);
    }
  });

  it('Workflow v1.2 — Value Engineering & Variation Order Comparison (BAPTK)', () => {
    const baseTotals = calcProjectTotals(['5000000.00', '3000000.00'], '10', '11');
    const revTotals = calcProjectTotals(['5000000.00', '2200000.00', '1500000.00'], '10', '11');

    const cmp = calcProjectComparison({
      baseRows: [
        {
          id: 'b1',
          wbsPath: 'Arsitektur > Dinding',
          description: 'Pasangan Dinding Bata',
          ahspCode: 'AHSP-01',
          ahspName: 'Dinding Bata',
          unit: 'm2',
          volume: '50.0000',
          hsp: '100000',
          baseTotal: '5000000.00',
        },
        {
          id: 'b2',
          wbsPath: 'Arsitektur > Lantai',
          description: 'Pasang Lantai Utama',
          ahspCode: 'AHSP-MARMER',
          ahspName: 'Marmer Import',
          unit: 'm2',
          volume: '30.0000',
          hsp: '100000',
          baseTotal: '3000000.00',
        },
        {
          id: 'b3',
          wbsPath: 'Arsitektur > Plafon',
          description: 'Plafon Drop Ceiling',
          ahspCode: 'AHSP-11',
          ahspName: 'Plafon Gypsum',
          unit: 'm2',
          volume: '20.0000',
          hsp: '50000',
          baseTotal: '1000000.00',
        },
      ],
      revisedRows: [
        {
          id: 'r1',
          wbsPath: 'Arsitektur > Dinding',
          description: 'Pasangan Dinding Bata',
          ahspCode: 'AHSP-01',
          ahspName: 'Dinding Bata',
          unit: 'm2',
          volume: '50.0000',
          hsp: '100000',
          baseTotal: '5000000.00',
        },
        {
          id: 'r2',
          wbsPath: 'Arsitektur > Lantai',
          description: 'Pasang Lantai Utama',
          ahspCode: 'AHSP-GRANIT',
          ahspName: 'Granit 60x60',
          unit: 'm2',
          volume: '44.0000',
          hsp: '50000',
          baseTotal: '2200000.00',
        },
        {
          id: 'r4',
          wbsPath: 'Arsitektur > Finishing',
          description: 'Cat Dinding Eksterior',
          ahspCode: 'AHSP-14',
          ahspName: 'Cat Dinding',
          unit: 'm2',
          volume: '30.0000',
          hsp: '50000',
          baseTotal: '1500000.00',
        },
      ],
      baseTotals,
      revisedTotals: revTotals,
    });

    expect(cmp.items).toHaveLength(4);
    expect(cmp.items[0].status).toBe('UNCHANGED');
    expect(cmp.items[1].status).toBe('MODIFIED_BOTH');
    expect(cmp.items[1].deltaTotal).toBe('-800000.00');
    expect(cmp.items[2].status).toBe('REMOVED');
    expect(cmp.items[2].deltaTotal).toBe('-1000000.00');
    expect(cmp.items[3].status).toBe('ADDED');
    expect(cmp.items[3].deltaTotal).toBe('1500000.00');

    expect(cmp.totalAddition).toBe('1500000.00');
    expect(cmp.totalDeduction).toBe('1800000.00');
  });
});
