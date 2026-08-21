import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const previewDir = path.join(root, 'apps-script-preview');

if (!fs.existsSync(previewDir)) {
  throw new Error(
    'Non se atopou apps-script-preview. Executa antes clasp pull no proxecto SCPP Script - Pruebas.'
  );
}

const codeFiles = fs.readdirSync(previewDir)
  .filter((name) => /\.(?:js|gs)$/i.test(name))
  .map((name) => path.join(previewDir, name));

if (!codeFiles.length) {
  throw new Error('Non se atoparon ficheiros .js/.gs en apps-script-preview.');
}

const readAll = () =>
  new Map(codeFiles.map((file) => [file, fs.readFileSync(file, 'utf8')]));

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function functionRange(source, name) {
  const re = new RegExp(`function\\s+${escapeRegExp(name)}\\s*\\(`, 'g');
  const matches = [...source.matchAll(re)];
  if (matches.length !== 1) return { matches: matches.length };

  const start = matches[0].index;
  const open = source.indexOf('{', start);
  if (open === -1) return { matches: 1, error: 'sen chave de apertura' };

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return { matches: 1, start, end: i + 1 };
      }
    }
  }

  return { matches: 1, error: 'sen chave de peche' };
}

function replaceUniqueFunction(files, name, replacement) {
  const found = [];
  for (const [file, source] of files) {
    const range = functionRange(source, name);
    if (range.matches === 1) found.push({ file, range });
    else if (range.matches > 1) {
      throw new Error(`Hai máis dunha definición de ${name} en ${path.basename(file)}.`);
    }
  }

  if (found.length !== 1) {
    throw new Error(
      found.length === 0
        ? `Non se atopou function ${name}() no pull de Preview.`
        : `Hai máis dunha definición de ${name} no proxecto Preview.`
    );
  }

  const { file, range } = found[0];
  if (range.error) {
    throw new Error(`Non se puido analizar ${name}: ${range.error}.`);
  }

  const source = files.get(file);
  files.set(
    file,
    source.slice(0, range.start) + replacement.trim() + source.slice(range.end)
  );
  return file;
}

const productionFunctions = {
  rexistrarAceptacion: `
function rexistrarAceptacion(datos) {
  const libroAceptacion = SpreadsheetApp.openById(
    '1gndQQ1AFQLtg2lUU8ANa5ksU3U6wZNxJI2Ye6z7Mu7k'
  );

  const follaAceptacion =
    libroAceptacion.getSheetById(974695665);

  if (!follaAceptacion) {
    throw new Error(
      'Non se atopou a pestana Aceptación'
    );
  }

  follaAceptacion.appendRow([
    Utilities.getUuid(),
    datos.email || '',
    new Date(),
    datos.version || '',
    datos.textoLegal || '',
    datos.aceptaFines === true,
    datos.persoa || '',
    datos.usuarioWeb || '',
    datos.ambito || '',
    datos.canle || '',
    datos.dataRetirada || ''
  ]);

  SpreadsheetApp.flush();

  console.log(
    'Aceptación escrita correctamente'
  );
}
`,
  tenAceptacionVixente_: `
function tenAceptacionVixente_(correo, version) {
  const libroAceptacion = SpreadsheetApp.openById(
    '1gndQQ1AFQLtg2lUU8ANa5ksU3U6wZNxJI2Ye6z7Mu7k'
  );

  const follaAceptacion =
    libroAceptacion.getSheetById(974695665);

  if (!follaAceptacion) {
    throw new Error(
      'Non se atopou a pestana Aceptación'
    );
  }

  const valores =
    follaAceptacion.getDataRange().getValues();
  if (valores.length < 2) return false;

  const cabeceiras = valores[0].map(function(valor) {
    return normalizarCabeceiraPortal_(valor);
  });

  const columnaEmail = indiceCabeceiraPortal_(
    cabeceiras,
    ['correoelectronico', 'email', 'correo']
  );
  const columnaVersion = indiceCabeceiraPortal_(
    cabeceiras,
    ['version']
  );
  const columnaAcepta = indiceCabeceiraPortal_(
    cabeceiras,
    ['aceptafines', 'acepta']
  );
  const columnaRetirada = indiceCabeceiraPortal_(
    cabeceiras,
    ['dataretirada', 'fecharetirada']
  );

  if (
    columnaEmail === -1 ||
    columnaVersion === -1 ||
    columnaAcepta === -1
  ) {
    throw new Error(
      'Faltan columnas obrigatorias na folla Aceptación'
    );
  }

  for (let i = valores.length - 1; i > 0; i -= 1) {
    const fila = valores[i];
    const mesmoCorreo =
      String(fila[columnaEmail] || '')
        .trim()
        .toLowerCase() === correo;
    const mesmaVersion =
      String(fila[columnaVersion] || '').trim() ===
      version;
    const aceptada =
      valorBooleanoPortal_(fila[columnaAcepta]);
    const retirada =
      columnaRetirada !== -1 &&
      String(fila[columnaRetirada] || '').trim() !== '';

    if (
      mesmoCorreo &&
      mesmaVersion &&
      aceptada &&
      !retirada
    ) {
      return true;
    }
  }

  return false;
}
`,
  obterTextoLegalVixente_: `
function obterTextoLegalVixente_() {
  const libro = SpreadsheetApp.openById(
    ACEPTACION_SPREADSHEET_ID_
  );
  const folla = libro.getSheetById(TEXTOS_LEGAIS_SHEET_ID_);

  if (!folla || folla.getName() !== 'TextosLegais') {
    throw new Error('Non se atopou a pestana TextosLegais configurada');
  }

  const valores = folla.getDataRange().getValues();
  if (valores.length < 2) {
    throw new Error('TextosLegais non contén ningún texto legal');
  }

  const cabeceiras = valores[0].map(function(valor) {
    return normalizarCabeceiraPortal_(valor);
  });
  const columnas = {
    id: indiceCabeceiraPortal_(cabeceiras, ['id']),
    version: indiceCabeceiraPortal_(cabeceiras, ['version']),
    titulo: indiceCabeceiraPortal_(cabeceiras, ['titulo']),
    texto: indiceCabeceiraPortal_(cabeceiras, ['texto']),
    dataVixencia: indiceCabeceiraPortal_(
      cabeceiras,
      ['datavixencia', 'fechavigencia']
    ),
    activo: indiceCabeceiraPortal_(cabeceiras, ['activo']),
    ambito: indiceCabeceiraPortal_(cabeceiras, ['ambito']),
    idTextoLegal: indiceCabeceiraPortal_(
      cabeceiras,
      ['idtextolegal']
    )
  };

  Object.keys(columnas).forEach(function(nome) {
    if (columnas[nome] === -1) {
      throw new Error(
        'Falta a columna obrigatoria ' + nome + ' en TextosLegais'
      );
    }
  });

  const agora = new Date();
  const candidatas = valores
    .slice(1)
    .map(function(fila, indice) {
      const data = normalizarDataTextoLegal_(
        fila[columnas.dataVixencia]
      );
      return { fila: fila, indice: indice, data: data };
    })
    .filter(function(candidata) {
      const fila = candidata.fila;
      return (
        String(fila[columnas.id] || '').trim() ===
          TEXTO_LEGAL_PORTAL_ID_ &&
        valorBooleanoPortal_(fila[columnas.activo]) &&
        candidata.data &&
        candidata.data.getTime() <= agora.getTime()
      );
    })
    .sort(function(a, b) {
      return (
        b.data.getTime() - a.data.getTime() ||
        b.indice - a.indice
      );
    });

  if (!candidatas.length) {
    throw new Error(
      'Non hai un texto legal activo e vixente para o portal privado'
    );
  }

  const fila = candidatas[0].fila;
  const resultado = {
    id: String(fila[columnas.id] || '').trim(),
    idTextoLegal: String(
      fila[columnas.idTextoLegal] || ''
    ).trim(),
    version: String(fila[columnas.version] || '').trim(),
    titulo: String(fila[columnas.titulo] || '').trim(),
    texto: String(fila[columnas.texto] || '').trim(),
    ambito: String(fila[columnas.ambito] || '').trim(),
    dataVixencia: Utilities.formatDate(
      candidatas[0].data,
      'Europe/Madrid',
      'yyyy-MM-dd'
    )
  };

  if (!resultado.version || !resultado.titulo || !resultado.texto) {
    throw new Error('O texto legal vixente está incompleto');
  }
  return resultado;
}
`,
  normalizarDataTextoLegal_: `
function normalizarDataTextoLegal_(valor) {
  if (
    Object.prototype.toString.call(valor) === '[object Date]' &&
    !isNaN(valor.getTime())
  ) {
    return valor;
  }

  const texto = String(valor || '').trim();
  const partes = texto.match(/^(\\d{1,2})[\\/.-](\\d{1,2})[\\/.-](\\d{4})$/);
  if (!partes) return null;

  const data = new Date(
    Number(partes[3]),
    Number(partes[2]) - 1,
    Number(partes[1])
  );
  return isNaN(data.getTime()) ? null : data;
}
`,
  comprobarAceptacionPortal_: `
function comprobarAceptacionPortal_(correo) {
  const textoLegal = obterTextoLegalVixente_();
  return {
    ok: true,
    aceptacionVixente: tenAceptacionVixente_(
      correo,
      textoLegal.version
    ),
    textoLegal: textoLegal
  };
}
`,
  rexistrarAceptacionPortal_: `
function rexistrarAceptacionPortal_(correo) {
  const usuario = obterOuCrearUsuarioWebPorEmail_(correo);
  if (!usuario) {
    return { ok: false, erro: 'Usuario non autorizado' };
  }

  const textoLegal = obterTextoLegalVixente_();
  rexistrarAceptacion({
    email: correo,
    version: textoLegal.version,
    textoLegal: textoLegal.texto,
    aceptaFines: true,
    persoa: usuario.persoa,
    usuarioWeb: usuario.usuarioWeb,
    ambito: textoLegal.ambito,
    canle: 'Web',
    dataRetirada: ''
  });

  return {
    ok: true,
    mensaxe: 'Aceptación rexistrada correctamente',
    version: textoLegal.version,
    textoLegalId: textoLegal.idTextoLegal,
    usuario: usuario
  };
}
`
};

const files = readAll();
const changedFiles = new Set();

for (const [name, replacement] of Object.entries(productionFunctions)) {
  changedFiles.add(replaceUniqueFunction(files, name, replacement));
}

const textoFile = [...files.entries()].find(([, source]) =>
  /function\s+obterTextoLegalVixente_\s*\(/.test(source)
)?.[0];

if (!textoFile) {
  throw new Error('Non se localizou o ficheiro do texto legal despois da preparación.');
}

const productionConstants = `const ACEPTACION_SPREADSHEET_ID_ =
  '1gndQQ1AFQLtg2lUU8ANa5ksU3U6wZNxJI2Ye6z7Mu7k';
const TEXTOS_LEGAIS_SHEET_ID_ = 2025412208;
const TEXTO_LEGAL_PORTAL_ID_ = 'PRIVACIDADE_WEB';`;

let textoSource = files.get(textoFile);
const constantsRe = /const\s+ACEPTACION_SPREADSHEET_ID_\s*=[\s\S]*?;\s*const\s+TEXTOS_LEGAIS_SHEET_ID_\s*=[\s\S]*?;\s*const\s+TEXTO_LEGAL_PORTAL_ID_\s*=[\s\S]*?;/m;

if (constantsRe.test(textoSource)) {
  textoSource = textoSource.replace(constantsRe, productionConstants);
} else {
  const range = functionRange(textoSource, 'obterTextoLegalVixente_');
  textoSource =
    textoSource.slice(0, range.start) +
    productionConstants +
    '\n\n' +
    textoSource.slice(range.start);
}
files.set(textoFile, textoSource);
changedFiles.add(textoFile);

const forbidden = /obterPropiedadeObrigatoria_\(\s*['"](?:ACEPTACION_SPREADSHEET_ID|ACEPTACION_SHEET_ID|TEXTOS_LEGAIS_SHEET_ID)['"]\s*\)/;

for (const name of Object.keys(productionFunctions)) {
  let checked = false;
  for (const [file, source] of files) {
    const range = functionRange(source, name);
    if (range.matches === 1) {
      checked = true;
      const block = source.slice(range.start, range.end);
      if (forbidden.test(block)) {
        throw new Error(
          `A función ${name} segue dependendo de propiedades de aceptación en ${path.basename(file)}.`
        );
      }
    }
  }
  if (!checked) throw new Error(`Non se puido verificar ${name}.`);
}

const constantsCheck = files.get(textoFile).match(constantsRe);
if (!constantsCheck || forbidden.test(constantsCheck[0])) {
  throw new Error('As constantes de aceptación non quedaron aliñadas con Produción.');
}

for (const file of changedFiles) {
  fs.writeFileSync(file, files.get(file), 'utf8');
}

console.log('Autenticación/aceptación de Preview aliñada coa lóxica que funciona en Produción.');
console.log('Ficheiros modificados:');
for (const file of changedFiles) {
  console.log('- ' + path.relative(root, file));
}
console.log('Non se modificou configuracion-entorno nin os módulos de Ensaios/Concertos.');
console.log('Revisa os cambios e só despois executa clasp push --force desde apps-script-preview.');
