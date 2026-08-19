import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const previewDir = path.join(root, 'apps-script-preview');
const codigoPath = path.join(previewDir, 'Código.js');
const adminSource = path.join(root, 'apps-script', 'ensaios-administracion.gs');
const adminTarget = path.join(previewDir, 'ensaios-administracion.js');

if (!fs.existsSync(codigoPath)) {
  throw new Error('Non se atopou apps-script-preview/Código.js. Executa antes clasp pull no proxecto de probas.');
}
if (!fs.existsSync(adminSource)) {
  throw new Error('Non se atopou apps-script/ensaios-administracion.gs.');
}

let codigo = fs.readFileSync(codigoPath, 'utf8');

const markerList = "if (accion === 'listarEnsaiosAdministracionPortal')";
const markerUpdate = "if (accion === 'actualizarEnsaioAdministracionPortal')";

if (!codigo.includes(markerList) || !codigo.includes(markerUpdate)) {
  const anchor = "    if (accion === 'gardarAsistenciaEnsaioPortal') {";
  if (!codigo.includes(anchor)) {
    throw new Error('Non se atopou o punto seguro de integración no doPost. Non se modificou Código.js.');
  }

  const block = `    if (accion === 'listarEnsaiosAdministracionPortal') {\n      const resultado = listarEnsaiosAdministracionPortal_(datos);\n\n      rexistrarAcceso({\n        email: correo,\n        tipoEvento: 'Consultar administración de ensaios',\n        modulo: 'Administración',\n        resultado: resultado.ok ? 'Correcto' : 'Rexeitado',\n        detalle: resultado.ok\n          ? 'Ensaios consultados desde Administración'\n          : String(resultado.erro || '')\n      });\n\n      return respostaJSON(resultado);\n    }\n\n    if (accion === 'actualizarEnsaioAdministracionPortal') {\n      bloqueo.waitLock(10000);\n      const resultado = actualizarEnsaioAdministracionPortal_(datos);\n\n      rexistrarAcceso({\n        email: correo,\n        tipoEvento: datos.cancelado === true\n          ? 'Dar de baixa ensaio'\n          : 'Modificar data de ensaio',\n        modulo: 'Administración',\n        resultado: resultado.ok ? 'Correcto' : 'Rexeitado',\n        detalle: resultado.ok\n          ? String(datos.idEnsaio || '')\n          : String(resultado.erro || '')\n      });\n\n      return respostaJSON(resultado);\n    }\n\n`;

  codigo = codigo.replace(anchor, block + anchor);
  fs.writeFileSync(codigoPath, codigo, 'utf8');
}

fs.copyFileSync(adminSource, adminTarget);

console.log('Preview de Apps Script preparado.');
console.log('- Dispatcher administrativo integrado en Código.js');
console.log('- ensaios-administracion.js copiado ao proxecto clasp');
console.log('Agora revisa git diff/no ficheiro local e só despois executa clasp push.');
