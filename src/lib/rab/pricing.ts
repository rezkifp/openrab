import { RabValidationError } from './calc';

export { RabValidationError };

export interface EffectivePriceRow {
  regionId: string;
  effectiveDate: string; // ISO YYYY-MM-DD
  basePrice: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function pickEffectivePrice(
  rows: EffectivePriceRow[],
  regionId: string,
  priceDate: string
): string {
  if (!ISO_DATE_RE.test(priceDate)) {
    throw new RabValidationError(
      'INVALID_NUMBER',
      `Format tanggal harga harus YYYY-MM-DD (diterima: ${priceDate}).`
    );
  }

  let best: EffectivePriceRow | null = null;
  for (const row of rows) {
    if (row.regionId !== regionId) continue;
    if (!ISO_DATE_RE.test(row.effectiveDate)) continue;
    if (row.effectiveDate > priceDate) continue;

    if (best === null || row.effectiveDate > best.effectiveDate) {
      best = row;
    }
  }

  if (best === null) {
    throw new RabValidationError(
      'PRICE_NOT_FOUND',
      `Harga efektif tidak ditemukan untuk region ${regionId} pada tanggal ${priceDate}.`
    );
  }

  return best.basePrice;
}
