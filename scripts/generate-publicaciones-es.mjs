import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const PUBLICATIONS_DIR = path.join(ROOT, 'public', 'documentos', 'publicacions');
const PDF_LIB_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';

const PUBLICATIONS = [
  {
    source: '2026-07-02_ficha_diario-mocidade-coral.pdf',
    output: '2026-07-02_ficha_diario-mocidade-coral-es.pdf',
    title: 'La juventud de la Coral toma la palabra',
    sourceLine: 'Diario de Pontevedra · Belén López · 2 de julio de 2026',
    summary: 'Siete de las voces más jóvenes de la Coral comparten su experiencia, el ambiente que encontraron y la ilusión de formar parte de una institución centenaria.',
    originalLanguage: 'gallego',
  },
  {
    source: '2026-03-28_ficha_faro-vieira-honra.pdf',
    output: '2026-03-28_ficha_faro-vieira-honra-es.pdf',
    title: 'La Polifónica recibe la Vieira de Honra y renueva la presidencia',
    sourceLine: 'Faro de Vigo · M. D. · 28 de marzo de 2026',
    summary: 'La Coral recibe en Madrid la Vieira de Honra a la Calidad Artística, un nuevo reconocimiento a su trayectoria centenaria y a la difusión de la música coral gallega.',
    originalLanguage: 'castellano',
  },
  {
    source: '2026-03-30_ficha_diario-respaldo-oficial.pdf',
    output: '2026-03-30_ficha_diario-respaldo-oficial-es.pdf',
    title: 'Recepción oficial a la nueva directiva de la Coral',
    sourceLine: 'Diario de Pontevedra · 30 de marzo de 2026',
    summary: 'La nueva directiva de la Sociedad fue recibida en el Ayuntamiento de Pontevedra en un encuentro institucional en torno a la continuidad y los nuevos proyectos de la Coral.',
    originalLanguage: 'castellano',
  },
  {
    source: '2026-04-09_ficha_diario-jose-raposeiras.pdf',
    output: '2026-04-09_ficha_diario-jose-raposeiras-es.pdf',
    title: 'José Raposeiras: «La Polifónica es cultura de Pontevedra»',
    sourceLine: 'Diario de Pontevedra · Belén López · 9 de abril de 2026',
    summary: 'José Raposeiras presenta los retos de la nueva etapa de la Sociedad: fortalecer la vida interna, recuperar vínculos institucionales y abrir la Coral a nuevas voces y públicos.',
    originalLanguage: 'gallego',
  },
  {
    source: '2026-04-29_ficha_deputacion-recepcion-directiva.pdf',
    output: '2026-04-29_ficha_deputacion-recepcion-directiva-es.pdf',
    title: 'La Diputación recibe a la nueva directiva de la Coral',
    sourceLine: 'Diputación de Pontevedra · 29 de abril de 2026',
    summary: 'La nueva directiva mantuvo un encuentro con el presidente de la Diputación, Luis López, para presentar sus proyectos y explorar nuevas vías de colaboración institucional.',
    originalLanguage: 'gallego',
  },
  {
    source: '2026-07-15_ficha_faro-agustin-bertomeu.pdf',
    output: '2026-07-15_ficha_faro-agustin-bertomeu-es.pdf',
    title: 'Fallece Agustín Bertomeu, director de la Coral entre 1968 y 1977',
    sourceLine: 'Faro de Vigo · N. D. · 15 de julio de 2026',
    summary: 'Faro de Vigo recoge el fallecimiento de Agustín Bertomeu Salazar y recuerda su etapa al frente de la Sociedad Coral Polifónica de Pontevedra.',
    originalLanguage: 'castellano',
  },
  {
    source: '2026-07-16_ficha_diario-agustin-bertomeu.pdf',
    output: '2026-07-16_ficha_diario-agustin-bertomeu-es.pdf',
    title: 'La Coral recuerda el legado de Agustín Bertomeu Salazar',
    sourceLine: 'Diario de Pontevedra · Belén López · 16 de julio de 2026',
    summary: 'La Coral despide con profundo pesar a Agustín Bertomeu Salazar, director musical entre 1968 y 1977 y autor de obras que continúan formando parte de su repertorio.',
    originalLanguage: 'gallego',
  },
  {
    source: 'bicentenario-marcial-del-adalid.pdf',
    output: 'bicentenario-marcial-del-adalid-es.pdf',
    title: 'Bicentenario de Marcial del Adalid: la memoria cantada',
    sourceLine: 'Teatro Colón · Real Academia Gallega de Bellas Artes · 31 de julio de 2026',
    summary: 'La Real Academia Gallega de Bellas Artes organiza dos conciertos extraordinarios para conmemorar el bicentenario de Marcial del Adalid, con la participación de ocho instituciones corales gallegas distinguidas con la Medalla Marcial del Adalid, entre ellas la Sociedad Coral Polifónica de Pontevedra.',
    originalLanguage: 'gallego',
  },
];

const replaceUnsupported = (value) => String(value ?? '')
  .replace(/[–—]/g, '-')
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/…/g, '...')
  .replace(/\u00a0/g, ' ');

async function loadPdfLib() {
  const response = await fetch(PDF_LIB_URL, {
    headers: { 'User-Agent': 'SCPP-publicaciones-es-build/1.0' },
  });
  if (!response.ok) {
    throw new Error(`No se pudo descargar pdf-lib (${response.status})`);
  }

  const source = await response.text();
  const load = new Function(`${source}\nreturn globalThis.PDFLib;`);
  const pdfLib = load();
  if (!pdfLib?.PDFDocument) {
    throw new Error('pdf-lib no quedó disponible tras cargar el bundle fijado.');
  }
  return pdfLib;
}

function wrapText(text, font, size, maxWidth) {
  const words = replaceUnsupported(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) lines.push(line);
    line = word;
  }

  if (line) lines.push(line);
  return lines;
}

function drawWrapped(page, text, options) {
  const { font, size, x, y, maxWidth, lineHeight, color } = options;
  const lines = wrapText(text, font, size, maxWidth);
  let cursorY = y;
  for (const line of lines) {
    page.drawText(line, { font, size, x, y: cursorY, color });
    cursorY -= lineHeight;
  }
  return cursorY;
}

async function generatePublication(pdfLib, publication) {
  const { PDFDocument, StandardFonts, rgb } = pdfLib;
  const sourcePath = path.join(PUBLICATIONS_DIR, publication.source);
  const outputPath = path.join(PUBLICATIONS_DIR, publication.output);

  const originalBytes = await fs.readFile(sourcePath);
  const originalPdf = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  const outputPdf = await PDFDocument.create();
  outputPdf.setTitle(publication.title);
  outputPdf.setAuthor('Sociedad Coral Polifónica de Pontevedra');
  outputPdf.setSubject('Archivo de publicaciones - ficha en castellano');
  outputPdf.setCreator('SCPP');

  const page = outputPdf.addPage([595.28, 841.89]);
  const regular = await outputPdf.embedFont(StandardFonts.Helvetica);
  const bold = await outputPdf.embedFont(StandardFonts.HelveticaBold);
  const wine = rgb(0.42, 0.11, 0.18);
  const gold = rgb(0.74, 0.59, 0.28);
  const ink = rgb(0.14, 0.14, 0.14);
  const muted = rgb(0.38, 0.36, 0.34);
  const soft = rgb(0.97, 0.95, 0.91);
  const width = page.getWidth();
  const margin = 56;
  const contentWidth = width - (margin * 2);

  page.drawText('SOCIEDAD CORAL POLIFÓNICA DE PONTEVEDRA', {
    x: margin,
    y: 768,
    size: 15,
    font: bold,
    color: wine,
  });
  page.drawText('Archivo de publicaciones · Ficha en castellano', {
    x: margin,
    y: 746,
    size: 9.5,
    font: regular,
    color: muted,
  });
  page.drawRectangle({ x: margin, y: 726, width: contentWidth, height: 2, color: gold });

  let y = drawWrapped(page, publication.title, {
    font: bold,
    size: 20,
    x: margin,
    y: 688,
    maxWidth: contentWidth,
    lineHeight: 24,
    color: ink,
  });

  y -= 10;
  y = drawWrapped(page, publication.sourceLine, {
    font: regular,
    size: 10.5,
    x: margin,
    y,
    maxWidth: contentWidth,
    lineHeight: 14,
    color: muted,
  });

  y -= 28;
  page.drawText('Resumen en castellano', {
    x: margin,
    y,
    size: 12,
    font: bold,
    color: wine,
  });
  y -= 22;
  y = drawWrapped(page, publication.summary, {
    font: regular,
    size: 11,
    x: margin,
    y,
    maxWidth: contentWidth,
    lineHeight: 17,
    color: ink,
  });

  y -= 36;
  const noteHeight = 118;
  page.drawRectangle({
    x: margin,
    y: y - noteHeight + 20,
    width: contentWidth,
    height: noteHeight,
    color: soft,
    borderColor: rgb(0.86, 0.82, 0.74),
    borderWidth: 0.8,
  });
  page.drawText('Sobre esta ficha', {
    x: margin + 18,
    y,
    size: 11.5,
    font: bold,
    color: wine,
  });
  y -= 23;

  const note = publication.originalLanguage === 'castellano'
    ? 'La reproducción periodística original se conserva íntegra a continuación, en castellano y sin alterar su composición, para mantener el valor documental de la fuente.'
    : 'Esta ficha ofrece en castellano la identificación y el contexto editorial de la publicación. A continuación se conserva íntegra la reproducción original en gallego, sin alterar su composición, para mantener el valor documental de la fuente.';

  drawWrapped(page, note, {
    font: regular,
    size: 10,
    x: margin + 18,
    y,
    maxWidth: contentWidth - 36,
    lineHeight: 15,
    color: ink,
  });

  page.drawText('Documento original íntegro a partir de la página siguiente.', {
    x: margin,
    y: 76,
    size: 9.5,
    font: bold,
    color: muted,
  });

  const copiedPages = await outputPdf.copyPages(originalPdf, originalPdf.getPageIndices());
  for (const copiedPage of copiedPages) outputPdf.addPage(copiedPage);

  const bytes = await outputPdf.save({ useObjectStreams: true });
  await fs.writeFile(outputPath, bytes);
  return { output: publication.output, pages: outputPdf.getPageCount(), bytes: bytes.length };
}

async function main() {
  await fs.mkdir(PUBLICATIONS_DIR, { recursive: true });
  const pdfLib = await loadPdfLib();
  const results = [];
  for (const publication of PUBLICATIONS) {
    results.push(await generatePublication(pdfLib, publication));
  }

  console.log('Fichas españolas de Actualidad generadas:');
  for (const result of results) {
    console.log(`- ${result.output} (${result.pages} páginas, ${result.bytes} bytes)`);
  }
}

main().catch((error) => {
  console.error('No se pudieron generar las fichas españolas de Actualidad:', error);
  process.exitCode = 1;
});
