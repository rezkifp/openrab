import { describe, expect, it } from 'vitest';
import { RabValidationError, pickEffectivePrice } from './pricing';

describe('OpenRAB pricing.ts — Acuan Unit Test 5', () => {
  const rows = [
    { regionId: 'A', effectiveDate: '2026-01-01', basePrice: '750.00' },
    { regionId: 'A', effectiveDate: '2026-06-01', basePrice: '800.00' },
    { regionId: 'B', effectiveDate: '2026-03-01', basePrice: '999.00' },
  ];

  it('TEST 5.1: Region A, priceDate 2026-03-01 -> "750.00"', () => {
    expect(pickEffectivePrice(rows, 'A', '2026-03-01')).toBe('750.00');
  });

  it('TEST 5.2: Region A, priceDate 2026-06-01 (tepat sama) -> "800.00"', () => {
    expect(pickEffectivePrice(rows, 'A', '2026-06-01')).toBe('800.00');
  });

  it('TEST 5.3: Region A, priceDate 2026-12-31 -> "800.00"', () => {
    expect(pickEffectivePrice(rows, 'A', '2026-12-31')).toBe('800.00');
  });

  it('TEST 5.4: Region A, priceDate 2025-12-31 -> ERROR PRICE_NOT_FOUND', () => {
    try {
      pickEffectivePrice(rows, 'A', '2025-12-31');
      expect.unreachable('Expected PRICE_NOT_FOUND');
    } catch (err) {
      expect(err).toBeInstanceOf(RabValidationError);
      expect((err as RabValidationError).code).toBe('PRICE_NOT_FOUND');
    }
  });

  it('TEST 5.5: Region B, priceDate 2026-02-01 -> ERROR PRICE_NOT_FOUND', () => {
    try {
      pickEffectivePrice(rows, 'B', '2026-02-01');
      expect.unreachable('Expected PRICE_NOT_FOUND');
    } catch (err) {
      expect(err).toBeInstanceOf(RabValidationError);
      expect((err as RabValidationError).code).toBe('PRICE_NOT_FOUND');
    }
  });

  it('TEST 5.6: Region B, priceDate 2026-03-01 -> "999.00"', () => {
    expect(pickEffectivePrice(rows, 'B', '2026-03-01')).toBe('999.00');
  });
});
