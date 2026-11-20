import Decimal from 'decimal.js';

/**
 * Format decimal string/Decimal to Indonesian number notation (1.234.567,89)
 * strictly via Decimal.js + string manipulation (never Number / parseFloat).
 */
export function formatIdDecimal(
  value: string | Decimal | null | undefined,
  dp?: number
): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  const dec = value instanceof Decimal ? value : new Decimal(value);
  const str =
    dp !== undefined ? dec.toFixed(dp, Decimal.ROUND_HALF_UP) : dec.toFixed();

  const isNegative = str.startsWith('-');
  const unsigned = isNegative ? str.slice(1) : str;
  const [intPart, fracPart] = unsigned.split('.');

  const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const formatted =
    fracPart !== undefined && fracPart.length > 0
      ? `${groupedInt},${fracPart}`
      : groupedInt;

  return isNegative ? `-${formatted}` : formatted;
}

export function formatRupiah(
  value: string | Decimal | null | undefined,
  dp = 2
): string {
  if (value === null || value === undefined || value === '') {
    return 'Rp -';
  }
  return `Rp ${formatIdDecimal(value, dp)}`;
}

export function isDummyText(value: string | null | undefined): boolean {
  if (!value) return false;
  return /\(DUMMY\)/i.test(value) || /-DUMMY\b/i.test(value);
}

export function hasAnyDummyMarker(values: Array<string | null | undefined>): boolean {
  return values.some((v) => isDummyText(v));
}
