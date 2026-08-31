export const CECA_TEST_URL = 'https://tpv.ceca.es/tpvweb/tpv/compra.action';
export const CECA_PRODUCTION_URL = 'https://pgw.ceca.es/tpvweb/tpv/compra.action';
export const PAYMENT_PREFIX = 'tpv/operaciones/';

const encoder = new TextEncoder();

export function paymentKey(operation) {
  return `${PAYMENT_PREFIX}${operation}.json`;
}

export function parseAmountToCents(value) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [euros, decimals = ''] = normalized.split('.');
  const cents = Number(euros) * 100 + Number(decimals.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents >= 200 && cents <= 500_000 ? cents : null;
}

export function createOperationId(now = Date.now(), uuid = crypto.randomUUID()) {
  const random = uuid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 18).toUpperCase();
  return `SCPP${now.toString(36).toUpperCase()}${random}`.slice(0, 50);
}

export function cecaEndpoint(environment) {
  return String(environment || '').toLowerCase() === 'production'
    ? CECA_PRODUCTION_URL
    : CECA_TEST_URL;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createPaymentSignature(key, fields) {
  const source = [
    key,
    fields.MerchantID,
    fields.AcquirerBIN,
    fields.TerminalID,
    fields.Num_operacion,
    fields.Importe,
    fields.TipoMoneda,
    fields.Exponente,
    fields.Referencia || '',
    fields.Cifrado,
    fields.URL_OK,
    fields.URL_NOK,
    fields.Exencion_SCA || '',
    fields.fechaTope || ''
  ].join('');
  return sha256(source);
}

export async function createNotificationSignature(key, fields) {
  return sha256([
    key,
    fields.MerchantID,
    fields.AcquirerBIN,
    fields.TerminalID,
    fields.Num_operacion,
    fields.Importe,
    fields.TipoMoneda,
    fields.Exponente,
    fields.Referencia
  ].join(''));
}

export function safeEqual(first, second) {
  const a = String(first || '').toLowerCase();
  const b = String(second || '').toLowerCase();
  if (a.length !== b.length || a.length === 0) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

export function getConfig(env) {
  const config = {
    MerchantID: String(env.CECA_MERCHANT_ID || '').trim(),
    AcquirerBIN: String(env.CECA_ACQUIRER_BIN || '').trim(),
    TerminalID: String(env.CECA_TERMINAL_ID || '').trim(),
    key: String(env.CECA_ENCRYPTION_KEY || '').trim(),
    environment: String(env.CECA_ENVIRONMENT || 'test').trim().toLowerCase()
  };
  if (!/^\d{9}$/.test(config.MerchantID)
    || !/^\d{10}$/.test(config.AcquirerBIN)
    || !/^\d{8}$/.test(config.TerminalID)
    || !config.key) {
    return null;
  }
  return config;
}

