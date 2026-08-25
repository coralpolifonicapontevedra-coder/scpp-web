const PREVIEW_HOSTS = new Set([
  'preview.coralpolifonicapontevedra.org'
]);

export function entornoFotosR2(request) {
  let hostname = '';
  try { hostname = new URL(request.url).hostname.toLowerCase(); } catch {}
  const preview = PREVIEW_HOSTS.has(hostname) || hostname.startsWith('preview.');
  return {
    preview,
    nome: preview ? 'preview' : 'production',
    prefixo: preview ? 'preview/' : ''
  };
}

export function claveFotosR2(request, clave) {
  const limpa = String(clave || '').trim().replace(/^\/+/, '');
  return `${entornoFotosR2(request).prefixo}${limpa}`;
}
