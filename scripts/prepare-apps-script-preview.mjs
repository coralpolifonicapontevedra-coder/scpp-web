import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const previewDir = path.join(root, 'apps-script-preview');
const codigoPath = path.join(previewDir, 'Código.js');
const adminSource = path.join(root, 'apps-script', 'ensaios-administracion.gs');
const adminTarget = path.join(previewDir, 'ensaios-administracion.js');
const manifestSource = path.join(root, 'apps-script', 'appsscript.json');
const manifestTarget = path.join(previewDir, 'appsscript.json');

if (!fs.existsSync(codigoPath)) {
  throw new Error('Non se atopou apps-script-preview/Código.js. Executa antes clasp pull no proxecto de probas.');
}
if (!fs.existsSync(adminSource)) {
  throw new Error('Non se atopou apps-script/ensaios-administracion.gs.');
}
if (!fs.existsSync(manifestSource)) {
  throw new Error('Non se atopou apps-script/appsscript.json.');
}

let codigo = fs.readFileSync(codigoPath, 'utf8');

const markerList = "    if (accion === 'listarEnsaiosAdministracionPortal') {";
const markerUpdate = "    if (accion === 'actualizarEnsaioAdministracionPortal') {";
const anchor = "    if (accion === 'gardarAsistenciaEnsaioPortal') {";

if (!codigo.includes(anchor)) {
  throw new Error('Non se atopou o punto seguro de integración no doPost. Non se modificou Código.js.');
}

const block = `    if (accion === 'listarEnsaiosAdministracionPortal') {\n      try {\n        const resultado = listarEnsaiosAdministracionPortal_(datos);\n        return respostaJSON(resultado);\n      } catch (erroAdminLista) {\n        return respostaJSON({\n          ok: false,\n          codigo: 'ADMIN_ENSAIOS_LIST_EXCEPTION',\n          erro: String(\n            erroAdminLista && erroAdminLista.message\n              ? erroAdminLista.message\n              : erroAdminLista\n          )\n        });\n      }\n    }\n\n    if (accion === 'actualizarEnsaioAdministracionPortal') {\n      try {\n        bloqueo.waitLock(10000);\n        const resultado = actualizarEnsaioAdministracionPortal_(datos);\n        return respostaJSON(resultado);\n      } catch (erroAdminActualizacion) {\n        return respostaJSON({\n          ok: false,\n          codigo: 'ADMIN_ENSAIOS_UPDATE_EXCEPTION',\n          erro: String(\n            erroAdminActualizacion && erroAdminActualizacion.message\n              ? erroAdminActualizacion.message\n              : erroAdminActualizacion\n          ),\n          detalle: String(\n            erroAdminActualizacion && erroAdminActualizacion.stack\n              ? erroAdminActualizacion.stack\n              : ''\n          )\n        });\n      }\n    }\n\n`;

const inicioExistente = codigo.indexOf(markerList);
const anchorIndex = codigo.indexOf(anchor);

if (inicioExistente !== -1 && inicioExistente < anchorIndex) {
  codigo = codigo.slice(0, inicioExistente) + block + codigo.slice(anchorIndex);
} else {
  codigo = codigo.replace(anchor, block + anchor);
}

if (!codigo.includes(markerList) || !codigo.includes(markerUpdate)) {
  throw new Error('Non foi posible integrar as accións administrativas no dispatcher.');
}

fs.writeFileSync(codigoPath, codigo, 'utf8');
fs.copyFileSync(adminSource, adminTarget);
fs.copyFileSync(manifestSource, manifestTarget);

console.log('Preview de Apps Script preparado.');
console.log('- Dispatcher administrativo integrado en Código.js');
console.log('- Excepcións administrativas devolven JSON de diagnóstico');
console.log('- ensaios-administracion.js copiado ao proxecto clasp');
console.log('- appsscript.json sincronizado desde GitHub');
console.log('Agora revisa os ficheiros locais e só despois executa clasp push.');
