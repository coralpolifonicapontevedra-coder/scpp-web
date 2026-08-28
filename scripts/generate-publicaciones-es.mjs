import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const PUBLICATIONS_DIR = path.join(ROOT, 'public', 'documentos', 'publicacions');
const PDF_LIB_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';

const PUBLICATIONS = [
  {
    source: '2026-07-02_ficha_diario-mocidade-coral.pdf',
    output: '2026-07-02_ficha_diario-mocidade-coral-es.pdf',
    title: 'Cantores de la Coral Polifónica de Pontevedra menores de 30 años: estas son las nuevas voces de la agrupación',
    sourceLine: 'Diario de Pontevedra · Belén López · 2 de julio de 2026',
    originalLanguage: 'gallego',
    translation: `Justo en su centenario, la Coral Polifónica de Pontevedra empezó a incorporar nuevas voces. Seis de los cantores tienen menos de 30 años y uno los supera por poco. Cuentan que unos animaron a otros a entrar y que hoy solo hablan de lo hermoso que es formar parte del grupo.

La incorporación de nuevas voces a la Coral Polifónica de Pontevedra era un viejo deseo de la agrupación, al igual que la llegada de nuevos públicos a los conciertos. El anterior presidente, Carlos Valle, defendía que las nuevas generaciones debían acercarse a un concierto de la Polifónica y experimentar lo que se siente escuchando una agrupación centenaria. Un año después, su sucesor, José Raposeiras, destacaba la satisfacción de haber incorporado gente nueva en los últimos meses: llegan con una alegría y una ilusión fundamentales para el futuro.

Gabriel Bravo Bueno, Jorge García Moldes, Clara San Millán Miguélez, Celia Aramburu García, Laura Otero Jiménez, Mila San Millán Miguélez y Marta García Moldes son las siete voces más jóvenes de la Coral Polifónica de Pontevedra. Todos, salvo uno, tienen menos de 30 años y se fueron incorporando a lo largo de los últimos meses.

La mayoría comparten experiencias previas vinculadas al canto. Algunos pasaron por el coro infantil y juvenil Luis García Limeses, dirigido por Reyes Carballo; otros fueron alumnos de la actual directora de la agrupación, Nanette Sánchez, en el Conservatorio Profesional de Música Manuel Quiroga, donde es profesora de coro.

Jorge García, tenor, y Laura Otero, soprano, fueron dos de las primeras voces jóvenes en incorporarse. Jorge recuerda que entró el 1 de enero de 2025. Durante la Navidad anterior una cantante veterana, Chiruca, le animó a participar. Fue casi por compromiso, explica, pero le gustó tanto que se quedó. Había dejado el canto para centrarse en otras cosas y reconoce que recuperarlo le sentó de maravilla: cantar le sirve para desconectar y hasta que volvió a hacerlo no se dio cuenta de cuánto lo echaba de menos.

La buena experiencia de Jorge animó a Laura Otero, que decidió probar después de oírle hablar del grupo. Ella misma describe una especie de efecto llamada: unos atraen a otros.

Ambos coinciden en destacar el buen ambiente que se vive en los ensayos y lo mucho que se disfruta de la experiencia. Para Jorge, esto fue lo que más pesó a la hora de decidir integrarse en el coro. Esperaba una relación cordial entre los cantores, pero encontró un ambiente mucho más cercano y divertido, tanto en los ensayos como en las actuaciones y, especialmente, en las cenas y los viajes. Los veteranos le acogieron muy bien y la conexión con los compañeros fue inmediata.

Laura Otero comparte esa impresión. Dice sentirse muy incluida desde el primer momento y reconoce que enseguida quiso formar parte del grupo. Para ella, la experiencia está siendo muy buena porque le permite disfrutar de la música plenamente y en un ambiente muy divertido.

El ambiente ha terminado teniendo más peso para ambos que la propia historia centenaria de la institución a la hora de permanecer en la Coral. Jorge García señala que la trayectoria de una agrupación por la que pasaron figuras como Castelao o Bóveda, y que fue pionera en Galicia en incorporar voces femeninas, tiene un enorme valor. Sin embargo, para él no fue el factor decisivo a nivel personal: lo determinante ha sido formar parte de un grupo que se vincula a unos valores, una memoria y una convivencia que merece la pena compartir.`,
  },
  {
    source: '2026-03-28_ficha_faro-vieira-honra.pdf',
    output: '2026-03-28_ficha_faro-vieira-honra-es.pdf',
    title: 'La Polifónica recibe la Vieira de Honra y tiene nuevo presidente',
    sourceLine: 'Faro de Vigo · N. D. · 28 de marzo de 2026',
    originalLanguage: 'castellano',
  },
  {
    source: '2026-03-30_ficha_diario-respaldo-oficial.pdf',
    output: '2026-03-30_ficha_diario-respaldo-oficial-es.pdf',
    title: 'Respaldo oficial a la Coral Polifónica',
    sourceLine: 'Diario de Pontevedra · 30 de abril de 2026',
    originalLanguage: 'castellano',
  },
  {
    source: '2026-04-09_ficha_diario-jose-raposeiras.pdf',
    output: '2026-04-09_ficha_diario-jose-raposeiras-es.pdf',
    title: 'José Raposeiras: «La Polifónica es cultura de Pontevedra»',
    sourceLine: 'Diario de Pontevedra · Belén López · 10 de abril de 2026',
    originalLanguage: 'gallego',
    translation: `Tras una renovación histórica de su junta directiva, la Sociedad Coral Polifónica de Pontevedra inicia una nueva etapa con José Raposeiras en la presidencia. Con él, como ocurrió con Losada Diéguez o Castelao, vuelve un cantor a ocupar el máximo cargo de la institución. «Nunca conté con estar aquí», confiesa. «Es un honor enorme».

Raposeiras fue cantor, vocal, secretario y vicepresidente antes de llegar a la presidencia. Resume su relación con la ciudad y con la entidad con dos afirmaciones: «Pontevedra es mi ciudad soñada» y «La Polifónica es cultura de Pontevedra».

El 26 de marzo, en asamblea general ordinaria, los 55 cantores de la agrupación estaban convocados para elegir una nueva junta directiva. Asistieron 47. De ellos, 44 apoyaron la candidatura encabezada por Raposeiras y las otras tres personas votaron en blanco. El nuevo presidente asegura que nunca pensó que llegaría a ocupar el cargo y que siente una enorme responsabilidad al pensar en los siete hombres que le precedieron, aunque subraya que la nueva junta llega con ganas e ilusión.

La entrada de Raposeiras conecta también con los orígenes de la Polifónica: vuelve a presidirla un cantor, como sucedió con Losada Diéguez y Castelao. Más tarde estuvieron al frente de la institución Xosé Filgueira Valverde y Carlos Valle. Raposeiras considera a ambos fundamentales en la historia de la Coral. Con Filgueira coincidió como cantor y con Carlos Valle compartió muchos años en las juntas directivas, hasta considerarlo, más que un compañero, un amigo.

Una de las primeras decisiones del nuevo equipo fue reconocer públicamente el trabajo de Carlos Valle y de la junta anterior, especialmente por todo lo realizado en torno al centenario. Raposeiras explica que ese reconocimiento fue uno de los primeros acuerdos alcanzados en la primera reunión de la nueva directiva.

## Un equipo de «personas extraordinarias»

En esa primera reunión participaron, además de Raposeiras, la vicepresidenta María del Carmen Martínez; el secretario Joaquín Cuiñas; el tesorero Gonzalo González; la contadora Mercedes González; la vicesecretaria Marta Valbuena y los vocales Pilar García Pinal y Fernando Marín. No pudieron acudir la archivera-bibliotecaria Antía Fonseca ni los vocales Raquel Paredes y Gabriel Bravo.

Raposeiras afirma que cuenta con un equipo fantástico y que fueron precisamente sus compañeros quienes le animaron a encabezar la candidatura. Destaca que al frente de la sociedad hay personas extraordinarias y que eso supone una garantía. También celebra la incorporación de gente nueva en los últimos meses: personas que llegan con alegría e ilusión y que resultan fundamentales para el futuro.

El presidente subraya que el papel de los más jóvenes es clave para cohesionar el grupo. Define a la Coral como 55 personas diferentes, con pensamientos, vidas y opiniones distintas, unidas a través del canto coral.

## El papel de Nanette Sánchez

Raposeiras destaca especialmente la labor que viene desarrollando la directora Nanette Sánchez. La considera el pegamento del grupo y la principal artífice del buen momento de la Coral Polifónica de Pontevedra. Asegura que todos se sienten extraordinariamente bien guiados por ella.

Además de acordar un homenaje a la junta anterior y repartir tareas y áreas de responsabilidad, el nuevo equipo decidió presentarse oficialmente ante las instituciones públicas -Ayuntamiento, Diputación, Xunta de Galicia y Subdelegación del Gobierno- y contactar con los centros gallegos de dentro y fuera de España. La Coral mantuvo históricamente relación con ellos y la nueva directiva quiere recuperarla y potenciarla.

Raposeiras es licenciado en Ciencias de la Educación y doctor por la Universidad de Vigo, donde fue profesor asociado. Desarrolló una carrera profesional vinculada a la docencia, con participación en programas europeos y congresos y la publicación de varios libros.

Entró en la Polifónica en 1995 y permaneció hasta 2010. Posteriormente se apartó por compromisos profesionales y cuestiones personales. En 2024 se reincorporó de la mano de los mismos compañeros que ahora lo eligieron presidente.

## De los homenajes de primavera a Cantos de Otoño

La nueva junta asumió con orgullo y responsabilidad el calendario de actuaciones que había dejado programado su predecesora. Entre mayo y final de año se prevé una intensa actividad.

En mayo la Coral participará en un homenaje a Manuel María con tres conciertos: el 15 de mayo en el auditorio Fuxan os Ventos, en Lugo; el 29 de mayo en el Pazo da Cultura de Pontevedra; y el 30 de mayo en el Auditorio de Galicia, en Santiago. Se interpretarán poemas musicados de As rúas do vento ceibe y otros textos de Rosalía de Castro o Celso Emilio Ferreiro. En junio habrá una actuación en el Museo de Pontevedra vinculada a la exposición del cuadro A derradeira leición do mestre, de Castelao.

El 10 de septiembre la agrupación protagonizará un acto organizado por la Real Academia Galega de Belas Artes y relacionado con la concesión de la Medalla de Oro Marcial del Adalid a la Coral pontevedresa. Finalmente, el 7 de noviembre, la Polifónica tiene prevista su participación en el Festival Cantos de Otoño, en el Liceo Casino de Pontevedra, junto al Orfeão Madeirense y una coral de Ponferrada.`,
  },
  {
    source: '2026-04-29_ficha_deputacion-recepcion-directiva.pdf',
    output: '2026-04-29_ficha_deputacion-recepcion-directiva-es.pdf',
    title: 'Luis López recibe en el Pazo provincial a los dirigentes de la Coral Polifónica de Pontevedra',
    sourceLine: 'Diputación de Pontevedra · 29 de abril de 2026',
    originalLanguage: 'gallego',
    translation: `El presidente de la Diputación de Pontevedra, Luis López, mantuvo un encuentro en el Pazo provincial con el presidente de la Sociedad Coral Polifónica de Pontevedra, José Raposeiras, y otros miembros de esta entidad emblemática para la cultura de la provincia.

La reunión de trabajo sirvió para estrechar los lazos entre dos instituciones que colaboran desde hace años en la protección y difusión de la cultura gallega. Una muestra reciente de esa alianza fue la entrega del Premio Otero Pedrayo, uno de los galardones más prestigiosos de Galicia, que conceden cada año las cuatro diputaciones y la Xunta de Galicia y que la Coral Polifónica recibió ese año en el Pazo provincial.

El encuentro también permitió abordar asuntos de interés mutuo y explorar nuevas vías de colaboración entre ambas instituciones.`,
  },
  {
    source: '2026-07-15_ficha_faro-agustin-bertomeu.pdf',
    output: '2026-07-15_ficha_faro-agustin-bertomeu-es.pdf',
    title: 'Muere Agustín Bertomeu, director de la Coral entre 1968 y 1977',
    sourceLine: 'Faro de Vigo · N. D. · 15 de julio de 2026',
    originalLanguage: 'castellano',
  },
  {
    source: '2026-07-16_ficha_diario-agustin-bertomeu.pdf',
    output: '2026-07-16_ficha_diario-agustin-bertomeu-es.pdf',
    title: 'Muere el exdirector de la Coral Polifónica de Pontevedra Agustín Bertomeu Salazar',
    sourceLine: 'Diario de Pontevedra · Belén López · 16 de julio de 2026',
    originalLanguage: 'gallego',
    translation: `El exdirector de la Coral Polifónica de Pontevedra Agustín Bertomeu Salazar falleció a los 96 años en Madrid, donde residía. Según informó la institución pontevedresa, fue director musical de la entidad entre 1968 y 1977, «una etapa especialmente significativa en la historia de la institución». El funeral tuvo lugar en Majadahonda.

Nacido en Rafal (Alicante) el 23 de diciembre de 1929, estuvo nueve años al frente de la Coral Polifónica. En ese periodo desarrolló una intensa labor artística y musical que coincidió con la celebración de las bodas de oro de la sociedad en 1975. Bajo su dirección, la agrupación protagonizó numerosos conciertos y actividades culturales e incorporó también conferencias divulgativas sobre historia de la música, música tradicional gallega y la propia trayectoria de la Polifónica, contribuyendo a reforzar su prestigio como referente de la cultura popular.

Su vínculo afectivo con la institución se mantuvo a lo largo de los años. En 2001, durante un concierto en Pozuelo de Alarcón, fue homenajeado con la interpretación del romance Ábreme a portiña, en un emotivo reencuentro con la agrupación y con una etapa de la que conservaba un profundo recuerdo.

Una de las facetas que la Coral destaca especialmente de Bertomeu es la de compositor y armonizador. Entre las obras que legó a la institución figura La estrella del pastor, dedicada al secretario Leopoldo Centeno Sanmartín; Tres cantigas de Pontevedra; y los romances Aquel que saleu agora, Sal á ventana María, Ábreme a portiña y Estando cosendo. Algunas de estas piezas continúan presentes en el repertorio de la Coral y se han interpretado a lo largo de las últimas décadas.

## Currículum y galardones

Bertomeu fue también director de la Orquesta de Cámara de Juventudes Musicales de Palma de Mallorca. Recibió numerosos galardones, entre ellos el Arpa de Oro en el VI Concurso de Composición de la Confederación Española de Cajas de Ahorro, en 1980, y el VII Premio Internacional de Composición Musical Reina Sofía, en 1989.

Sus obras fueron interpretadas, entre otras formaciones, por la Orquesta Sinfónica de Galicia, la Orquesta Sinfónica de Euskadi, la Orquesta Sinfónica de Dresde (Alemania) y la Orquesta de RTVE.

La Polifónica expresó su agradecimiento por la dedicación, el compromiso y el legado musical que Agustín Bertomeu Salazar dejó en la institución y que forma parte para siempre de su historia.`,
  },
  {
    source: 'bicentenario-marcial-del-adalid.pdf',
    output: 'bicentenario-marcial-del-adalid-es.pdf',
    title: 'Bicentenario de Marcial del Adalid: la memoria cantada',
    sourceLine: 'Teatro Colón · Real Academia Gallega de Bellas Artes · septiembre de 2026',
    originalLanguage: 'gallego',
    translation: `A Coruña celebra en 2026 el bicentenario del nacimiento del compositor Marcial del Adalid, figura clave del Rexurdimento y de la identidad musical gallega.

## A quién va dirigido

Público en general.

## Cuándo

9 y 10 de septiembre de 2026.

## Horario

19:30 h.

## Dirección

Teatro Colón. Avenida de la Marina, 7 A. 15003 A Coruña.

## Precio

Entrada libre hasta completar aforo.

## Normas de acceso al recinto

- No está permitida la entrada al recinto con comida ni bebida, excepto agua.
- Están reservados todos los derechos de imagen y propiedad intelectual de los conciertos programados. No se permite tomar fotografías ni realizar grabaciones antes, durante o después del concierto sin autorización de la organización.
- Una vez comenzado el concierto no se permitirá acceder a la sala.

Se recomienda actuar con responsabilidad.

## Organización

Real Academia Gallega de Bellas Artes.

Para honrar el legado de Marcial del Adalid, la Real Academia Gallega de Bellas Artes organiza dos conciertos extraordinarios en el Teatro Colón de A Coruña los días 9 y 10 de septiembre. Participarán ocho instituciones corales gallegas que poseen la Medalla Marcial del Adalid, el máximo reconocimiento de la Academia a la excelencia polifónica.

El encuentro reivindica el papel de los coros como memoria colectiva desde el siglo XIX hasta la actualidad y reafirma el compromiso de Galicia con la excelencia artística.

El público coruñés está invitado a participar en una cita que une tradición, cultura y futuro con la presencia de las siguientes corales históricas:

- Coral Polifónica de Bergantiños.
- Agrupación Folclórica Cantigas e Agarimos.
- Real Coro Toxos e Froles.
- Coral Polifónica El Eco.
- Coral De Ruada.
- Sociedad Coral Polifónica de Pontevedra.
- Coro Galego Cántigas da Terra.
- Coral Polifónica Follas Novas.`,
  },
];

const replaceUnsupported = (value) => String(value ?? '')
  .replace(/[–—]/g, '-')
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[«»]/g, '"')
  .replace(/…/g, '...')
  .replace(/\u00a0/g, ' ');

async function loadPdfLib() {
  const response = await fetch(PDF_LIB_URL, {
    headers: { 'User-Agent': 'SCPP-publicaciones-es-build/1.1' },
  });
  if (!response.ok) throw new Error(`No se pudo descargar pdf-lib (${response.status})`);
  const source = await response.text();
  const load = new Function(`${source}\nreturn globalThis.PDFLib;`);
  const pdfLib = load();
  if (!pdfLib?.PDFDocument) throw new Error('pdf-lib no quedó disponible tras cargar el bundle fijado.');
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
    } else {
      if (line) lines.push(line);
      line = word;
    }
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

function drawPageHeader(page, fonts, colors, pageNumber) {
  const { regular, bold } = fonts;
  const { wine, gold, muted } = colors;
  const margin = 54;
  const width = page.getWidth();
  page.drawText('SOCIEDAD CORAL POLIFÓNICA DE PONTEVEDRA', { x: margin, y: 790, size: 11.5, font: bold, color: wine });
  page.drawText('Archivo de publicaciones · Versión en castellano', { x: margin, y: 773, size: 8.8, font: regular, color: muted });
  page.drawRectangle({ x: margin, y: 759, width: width - margin * 2, height: 1.5, color: gold });
  page.drawText(`Página ${pageNumber}`, { x: width - margin - 42, y: 36, size: 8.5, font: regular, color: muted });
}

function addTranslationPages(outputPdf, publication, fonts, colors) {
  const { regular, bold } = fonts;
  const { wine, ink, muted } = colors;
  const margin = 54;
  const maxWidth = 595.28 - margin * 2;
  const paragraphs = publication.translation
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  let page = outputPdf.addPage([595.28, 841.89]);
  let pageNumber = 1;
  drawPageHeader(page, fonts, colors, pageNumber);
  let y = 720;

  y = drawWrapped(page, publication.title, { font: bold, size: 18, x: margin, y, maxWidth, lineHeight: 22, color: ink });
  y -= 10;
  y = drawWrapped(page, publication.sourceLine, { font: regular, size: 9.5, x: margin, y, maxWidth, lineHeight: 13, color: muted });
  y -= 24;
  page.drawText('Traducción al castellano para lectura', { x: margin, y, size: 11, font: bold, color: wine });
  y -= 24;

  for (const paragraph of paragraphs) {
    const isHeading = paragraph.startsWith('## ');
    const text = isHeading ? paragraph.slice(3) : paragraph;
    const font = isHeading ? bold : regular;
    const size = isHeading ? 13 : 10.3;
    const lineHeight = isHeading ? 17 : 15.2;
    const lines = wrapText(text, font, size, maxWidth);
    const needed = lines.length * lineHeight + (isHeading ? 18 : 14);

    if (y - needed < 62) {
      pageNumber += 1;
      page = outputPdf.addPage([595.28, 841.89]);
      drawPageHeader(page, fonts, colors, pageNumber);
      y = 720;
    }

    y = drawWrapped(page, text, { font, size, x: margin, y, maxWidth, lineHeight, color: isHeading ? wine : ink });
    y -= isHeading ? 12 : 14;
  }
}

function addIntroPage(outputPdf, publication, fonts, colors) {
  const { regular, bold } = fonts;
  const { wine, gold, ink, muted, soft } = colors;
  const page = outputPdf.addPage([595.28, 841.89]);
  const margin = 56;
  const contentWidth = page.getWidth() - margin * 2;

  page.drawText('SOCIEDAD CORAL POLIFÓNICA DE PONTEVEDRA', { x: margin, y: 768, size: 15, font: bold, color: wine });
  page.drawText('Archivo de publicaciones · Ficha en castellano', { x: margin, y: 746, size: 9.5, font: regular, color: muted });
  page.drawRectangle({ x: margin, y: 726, width: contentWidth, height: 2, color: gold });
  let y = drawWrapped(page, publication.title, { font: bold, size: 20, x: margin, y: 688, maxWidth: contentWidth, lineHeight: 24, color: ink });
  y -= 10;
  y = drawWrapped(page, publication.sourceLine, { font: regular, size: 10.5, x: margin, y, maxWidth: contentWidth, lineHeight: 14, color: muted });
  y -= 36;

  page.drawRectangle({ x: margin, y: y - 132, width: contentWidth, height: 132, color: soft });
  page.drawText('Documento original en castellano', { x: margin + 18, y: y - 25, size: 12, font: bold, color: wine });
  drawWrapped(page,
    'La publicación original ya está redactada en castellano. A continuación se reproduce íntegramente, manteniendo su composición periodística y su valor documental.',
    { font: regular, size: 10.5, x: margin + 18, y: y - 50, maxWidth: contentWidth - 36, lineHeight: 16, color: ink },
  );
}

function addOriginalSeparator(outputPdf, fonts, colors, originalLanguage) {
  const { regular, bold } = fonts;
  const { wine, ink, muted } = colors;
  const page = outputPdf.addPage([595.28, 841.89]);
  const margin = 64;
  page.drawText('DOCUMENTO ORIGINAL', { x: margin, y: 650, size: 18, font: bold, color: wine });
  const note = originalLanguage === 'gallego'
    ? 'A partir de la página siguiente se conserva la reproducción íntegra de la publicación en su idioma original (gallego). Esta sección se mantiene sin alteraciones para preservar el documento histórico.'
    : 'A partir de la página siguiente se conserva la reproducción íntegra de la publicación original en castellano.';
  drawWrapped(page, note, { font: regular, size: 11, x: margin, y: 615, maxWidth: 467, lineHeight: 17, color: ink });
  page.drawText('Sociedad Coral Polifónica de Pontevedra', { x: margin, y: 90, size: 9, font: regular, color: muted });
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
  outputPdf.setSubject('Archivo de publicaciones - versión en castellano');
  outputPdf.setCreator('SCPP');

  const fonts = {
    regular: await outputPdf.embedFont(StandardFonts.Helvetica),
    bold: await outputPdf.embedFont(StandardFonts.HelveticaBold),
  };
  const colors = {
    wine: rgb(0.42, 0.11, 0.18),
    gold: rgb(0.74, 0.59, 0.28),
    ink: rgb(0.14, 0.14, 0.14),
    muted: rgb(0.38, 0.36, 0.34),
    soft: rgb(0.97, 0.95, 0.91),
  };

  if (publication.translation) addTranslationPages(outputPdf, publication, fonts, colors);
  else addIntroPage(outputPdf, publication, fonts, colors);

  addOriginalSeparator(outputPdf, fonts, colors, publication.originalLanguage);
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
  for (const publication of PUBLICATIONS) results.push(await generatePublication(pdfLib, publication));
  console.log('Fichas españolas de Actualidad generadas:');
  for (const result of results) console.log(`- ${result.output} (${result.pages} páginas, ${result.bytes} bytes)`);
}

main().catch((error) => {
  console.error('No se pudieron generar las fichas españolas de Actualidad:', error);
  process.exitCode = 1;
});
