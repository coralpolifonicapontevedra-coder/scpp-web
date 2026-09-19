export async function onRequest(context) {
  const resposta = await context.next();
  const tipo = String(resposta.headers.get('Content-Type') || '');
  if (!resposta.ok || !tipo.includes('text/html')) return resposta;

  const headers = new Headers(resposta.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.delete('ETag');
  headers.set('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400');

  return new Response(await resposta.text(), {
    status: resposta.status,
    statusText: resposta.statusText,
    headers
  });
}
