import { onRequestFotosDeleteV5Fast } from '../_lib/fotos-delete-v5-fast.js';

const PRODUCTION_ALIAS = 'produccion.coralpolifonicapontevedra.org';
const PRODUCTION_CANONICAL_HOST = 'scpp-web.pages.dev';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname.toLowerCase() !== PRODUCTION_ALIAS) {
    return onRequestFotosDeleteV5Fast(context);
  }

  // O dominio estable de traballo en Producción é un alias de Cloudflare Pages.
  // Canonízase só este host exacto; Preview non pasa por esta normalización.
  url.hostname = PRODUCTION_CANONICAL_HOST;
  const request = new Request(url.toString(), context.request);
  return onRequestFotosDeleteV5Fast({ ...context, request });
}
