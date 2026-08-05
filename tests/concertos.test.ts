import { describe, expect, it } from 'vitest';

import { dataISO } from '../src/lib/concertos';

describe('dataISO', () => {
  it('conserva unha data ISO', () => {
    expect(dataISO('2026-08-05')).toBe('2026-08-05');
  });

  it('converte datas con día primeiro e barras', () => {
    expect(dataISO('05/08/2026')).toBe('2026-08-05');
  });

  it('converte datas con día primeiro e guións', () => {
    expect(dataISO('5-8-2026')).toBe('2026-08-05');
  });

  it('devolve sen cambios un valor que non ten tres partes', () => {
    expect(dataISO('agosto de 2026')).toBe('agosto de 2026');
  });
});
