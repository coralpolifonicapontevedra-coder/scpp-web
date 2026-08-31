import { describe, expect, it } from 'vitest';
import {
  CECA_PRODUCTION_URL,
  CECA_TEST_URL,
  cecaEndpoint,
  createNotificationSignature,
  createOperationId,
  createPaymentSignature,
  parseAmountToCents,
  safeEqual
} from '../functions/_lib/ceca-tpv.js';

describe('CECA TPV integration', () => {
  it('parses and bounds contribution amounts', () => {
    expect(parseAmountToCents('25')).toBe(2500);
    expect(parseAmountToCents('25,50')).toBe(2550);
    expect(parseAmountToCents('1.99')).toBeNull();
    expect(parseAmountToCents('5000.01')).toBeNull();
    expect(parseAmountToCents('20.999')).toBeNull();
  });

  it('uses unique CECA-safe operation identifiers', () => {
    const id = createOperationId(1_725_000_000_000, '12345678-1234-1234-1234-123456789abc');
    expect(id).toMatch(/^[A-Z0-9]{1,50}$/);
  });

  it('selects only the official test and production endpoints', () => {
    expect(cecaEndpoint('test')).toBe(CECA_TEST_URL);
    expect(cecaEndpoint('production')).toBe(CECA_PRODUCTION_URL);
    expect(cecaEndpoint('unexpected')).toBe(CECA_TEST_URL);
  });

  it('matches the SHA2 example from the CECA manual', async () => {
    const signature = await createPaymentSignature('99888888', {
      MerchantID: '111950028',
      AcquirerBIN: '0000554052',
      TerminalID: '00000003',
      Num_operacion: '123',
      Importe: '500',
      TipoMoneda: '978',
      Exponente: '2',
      Cifrado: 'SHA2',
      URL_OK: 'http://www.ceca.es',
      URL_NOK: 'http://www.ceca.es'
    });
    expect(signature).toBe('2b7f686593f1a424c510321e4bc354d21924e02e980a90f4d46c41f92a06f5a9');
  });

  it('verifies notification signatures without timing-sensitive equality', async () => {
    const signature = await createNotificationSignature('secret', {
      MerchantID: '123456789', AcquirerBIN: '0000000001', TerminalID: '00000003',
      Num_operacion: 'SCPP1', Importe: '000000002500', TipoMoneda: '978',
      Exponente: '2', Referencia: 'REF1'
    });
    expect(safeEqual(signature, signature.toUpperCase())).toBe(true);
    expect(safeEqual(signature, `${signature.slice(0, -1)}0`)).toBe(false);
  });
});
