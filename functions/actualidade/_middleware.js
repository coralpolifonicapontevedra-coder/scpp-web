class HeadInjector {
  element(element) {
    element.append('<script src="/js/actualidade-r2.js?v=1" defer></script>', { html: true });
  }
}

export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get('Content-Type') || '';
  if (!response.ok || !contentType.includes('text/html')) return response;

  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.delete('ETag');

  return new HTMLRewriter()
    .on('head', new HeadInjector())
    .transform(new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    }));
}
