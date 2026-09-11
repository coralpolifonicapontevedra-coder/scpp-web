class CentenarioDateRewriter {
  text(text) {
    if (!text.text.includes('22 de maio de 2025')) return;
    text.replace(text.text.replaceAll('22 de maio de 2025', '22 de outubro de 2025'));
  }
}

export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return response;

  return new HTMLRewriter()
    .on('body', new CentenarioDateRewriter())
    .transform(response);
}
