import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const productionDir = path.join(root, 'apps-script-production');
const claspPath = path.join(productionDir, '.clasp.json');
const codigoPath = path.join(productionDir, 'Código.js');

const SCRIPT_ID_PRODUCION = '1LeJ91m62gdfm8i1XX9EvtxFMvvhhQhMCN_13iUWgvOHaq7q9LUo-nciV';

const fontes = [
  {
    source: path.join(root, 'apps-script', 'concertos-administracion.gs'),
    target: path.join(productionDir, 'concertos-administracion.js'),
    label: 'concertos-administracion'
  },
  {
    source: path.join(root, 'apps-script', 'concertos-eliminar.gs'),
    target: path.join(productionDir, 'concertos-eliminar.js'),
    label: 'concertos-eliminar'
  },
  {
    source: path.join(root, 'apps-script', 'canonical-2026-08-03', 'asistencias-concertos.gs'),
    target: path.join(productionDir, 'asistencias-concertos-portal.js'),
    label: 'asistencias-concertos'
  }
];

for (const [file, message] of [
  [claspPath, 'Non se atopou apps-script-production/.clasp.json. Clona ou actualiza primeiro SCPP Script de Produción.'],
  [codigoPath, 'Non se atopou apps-script-production/Código.js. Executa antes clasp pull no proxecto de Produción.']
]) {
  if (!fs.existsSync(file)) throw new Error(message);
}

for (const fonte of fontes) {
  if (!fs.existsSync(fonte.source)) {
    throw new Error(`Non se atopou a fonte ${fonte.label}. Operación cancelada.`);
  }
}

let clasp;
try {
  clasp = JSON.parse(fs.readFileSync(claspPath, 'utf8'));
} catch {
  throw new Error('apps-script-production/.clasp.json non é un JSON válido. Operación cancelada.');
}

if (String(clasp?.scriptId || '').trim() !== SCRIPT_ID_PRODUCION) {
  throw new Error(
    `SEGURIDADE: apps-script-production non apunta a SCPP Script de Produción. Esperado: ${SCRIPT_ID_PRODUCION}. Non se modificou ningún ficheiro.`
  );
}

let codigo = fs.readFileSync(codigoPath, 'utf8');
const anchor = "    if (accion === 'gardarAsistenciaEnsaioPortal') {";
if (!codigo.includes(anchor)) {
  throw new Error('Non se atopou o punto seguro de integración no doPost de Produción. Non se modificou Código.js.');
}

const bloques = [
  {
    marker: "accion === 'listarConcertosAdministracionPortal'",
    code: `    if (accion === 'listarConcertosAdministracionPortal') {\n      try {\n        return respostaJSON(listarConcertosAdministracionPortal_(datos));\n      } catch (erroConcertosLista) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_CONCERTOS_LIST_EXCEPTION', erro:String(erroConcertosLista && erroConcertosLista.message ? erroConcertosLista.message : erroConcertosLista) });\n      }\n    }\n\n`
  },
  {
    marker: "accion === 'actualizarConcertoAdministracionPortal'",
    code: `    if (accion === 'actualizarConcertoAdministracionPortal') {\n      try {\n        bloqueo.waitLock(10000);\n        return respostaJSON(actualizarConcertoAdministracionPortal_(datos));\n      } catch (erroConcertoActualizacion) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_CONCERTOS_UPDATE_EXCEPTION', erro:String(erroConcertoActualizacion && erroConcertoActualizacion.message ? erroConcertoActualizacion.message : erroConcertoActualizacion), detalle:String(erroConcertoActualizacion && erroConcertoActualizacion.stack ? erroConcertoActualizacion.stack : '') });\n      }\n    }\n\n`
  },
  {
    marker: "accion === 'gardarConcertoAdministracionPortal'",
    code: `    if (accion === 'gardarConcertoAdministracionPortal') {\n      bloqueo.waitLock(10000);\n      return respostaJSON(gardarConcertoAdministracionPortal_(datos));\n    }\n\n`
  },
  {
    marker: "accion === 'obterXestionConcertoAdministracionPortal'",
    code: `    if (accion === 'obterXestionConcertoAdministracionPortal') {\n      return respostaJSON(obterXestionConcertoAdministracionPortal_(datos));\n    }\n\n`
  },
  {
    marker: "accion === 'gardarProgramaConcertoAdministracionPortal'",
    code: `    if (accion === 'gardarProgramaConcertoAdministracionPortal') {\n      return respostaJSON(gardarProgramaConcertoAdministracionPortal_(datos));\n    }\n\n`
  },
  {
    marker: "accion === 'gardarAsistentesConcertoAdministracionPortal'",
    code: `    if (accion === 'gardarAsistentesConcertoAdministracionPortal') {\n      return respostaJSON(gardarAsistentesConcertoAdministracionPortal_(datos));\n    }\n\n`
  },
  {
    marker: "accion === 'actualizarMedioConcertoAdministracionPortal'",
    code: `    if (accion === 'actualizarMedioConcertoAdministracionPortal') {\n      bloqueo.waitLock(10000);\n      return respostaJSON(actualizarMedioConcertoAdministracionPortal_(datos));\n    }\n\n`
  },
  {
    marker: "accion === 'eliminarConcertoAdministracionPortal'",
    code: `    if (accion === 'eliminarConcertoAdministracionPortal') {\n      try {\n        bloqueo.waitLock(10000);\n        return respostaJSON(eliminarConcertoAdministracionPortal_(datos));\n      } catch (erroEliminarConcerto) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_CONCERTOS_DELETE_EXCEPTION', erro:String(erroEliminarConcerto && erroEliminarConcerto.message ? erroEliminarConcerto.message : erroEliminarConcerto) });\n      }\n    }\n\n`
  },
  {
    marker: "accion === 'listarAsistenciasConcertosPortal'",
    code: `    if (accion === 'listarAsistenciasConcertosPortal') {\n      return respostaJSON(listarAsistenciasConcertosPortal_(datos));\n    }\n\n`
  }
];

for (const bloque of bloques) {
  if (!codigo.includes(bloque.marker)) codigo = codigo.replace(anchor, bloque.code + anchor);
}

for (const bloque of bloques) {
  if (!codigo.includes(bloque.marker)) {
    throw new Error(`A integración de Concertos non quedou completa (${bloque.marker}). Non se debe executar clasp push.`);
  }
}

fs.writeFileSync(codigoPath, codigo, 'utf8');
for (const fonte of fontes) fs.copyFileSync(fonte.source, fonte.target);

console.log('Apps Script de Produción preparado EXCLUSIVAMENTE para Concertos.');
console.log(`- Script ID de Produción verificado: ${SCRIPT_ID_PRODUCION}`);
console.log('- Código.js: só se engaden accións de Concertos que falten; non se modifican accións de Ensaios.');
console.log('- Copiados: concertos-administracion.js, concertos-eliminar.js e asistencias-concertos-portal.js.');
console.log('- appsscript.json non se modifica.');
console.log('- A preparación NON executa clasp push nin crea unha nova versión.');
console.log('- Revisa o resultado local antes de publicar.');
