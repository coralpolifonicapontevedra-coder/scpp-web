export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();
  const parche = `<script>
  (() => {
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input || '');

      if (!url.includes('/api/repertorio') || !init || typeof init.body !== 'string') {
        return fetchOriginal(input, init);
      }

      let corpo;
      try {
        corpo = JSON.parse(init.body);
      } catch {
        return fetchOriginal(input, init);
      }

      if (corpo?.accion !== 'listarAsistenciasConcertosPortal') {
        return fetchOriginal(input, init);
      }

      return fetchOriginal('/api/asistencias-concertos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: String(corpo.idToken || '') }),
        cache: 'no-store'
      });
    };
  })();
  </script>`;

  const body = html.includes('<head>')
    ? html.replace('<head>', `<head>${parche}`)
    : `${parche}${html}`;

  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'no-store');

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
