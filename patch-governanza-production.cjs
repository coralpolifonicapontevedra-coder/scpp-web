const fs = require('fs');

function localizarFuncion(texto, nombre) {
  const marca = 'function ' + nombre + '(';
  const inicio = texto.indexOf(marca);

  if (inicio < 0) {
    throw new Error('No se encontró ' + nombre);
  }

  const llaveInicial = texto.indexOf('{', inicio);
  if (llaveInicial < 0) {
    throw new Error('No se encontró { de ' + nombre);
  }

  let nivel = 0;

  for (let i = llaveInicial; i < texto.length; i++) {
    if (texto[i] === '{') nivel++;
    if (texto[i] === '}') {
      nivel--;
      if (nivel === 0) {
        return { inicio, fin: i + 1 };
      }
    }
  }

  throw new Error('No se encontró cierre de ' + nombre);
}

function extraerFuncion(ruta, nombre) {
  const texto = fs.readFileSync(ruta, 'utf8');
  const pos = localizarFuncion(texto, nombre);
  return texto.slice(pos.inicio, pos.fin);
}

function sustituirFuncion(destino, origen, nombre) {
  const actual = fs.readFileSync(destino, 'utf8');
  const nueva = extraerFuncion(origen, nombre);
  const pos = localizarFuncion(actual, nombre);

  const resultado =
    actual.slice(0, pos.inicio) +
    nueva +
    actual.slice(pos.fin);

  fs.writeFileSync(destino, resultado, 'utf8');
  console.log('PATCH_OK ' + nombre);
}

sustituirFuncion(
  'apps-script-production/ensaios-administracion.js',
  'apps-script/ensaios-administracion.gs',
  'permisoEnsaiosAdministracionPortal_'
);

sustituirFuncion(
  'apps-script-production/ensaios-portal.js',
  'apps-script/ensaios-portal.gs',
  'permisoEnsaiosPortal_'
);

sustituirFuncion(
  'apps-script-production/persoas-administracion.js',
  'apps-script/persoas-administracion.gs',
  'obterAdministradorPersoasAdmin_'
);

fs.copyFileSync(
  'apps-script/permisos-portal.gs',
  'apps-script-production/permisos-portal.js'
);

console.log('COPY_OK permisos-portal.js');
