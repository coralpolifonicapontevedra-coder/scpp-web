import { onRequestFotosDeleteV4 } from '../_lib/fotos-delete-v4.js';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

export async function onRequest(context) {
  const habilitado = String(context.env?.FOTOS_DELETE_PRODUCTION_ENABLED || '').trim().toLowerCase() === 'true';
  if (!habilitado) {
    return json(403, {
      ok: false,
      codigo: 'PRODUCTION_DELETE_DISABLED',
      erro: 'Eliminar definitivamente está bloqueado en Producción ata completar as probas de posta en marcha.'
    });
  }
  return onRequestFotosDeleteV4(context);
}
