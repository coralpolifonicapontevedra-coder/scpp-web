import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const productionDir = path.join(root, 'apps-script-production');
const codigoPath = path.join(productionDir, 'Código.js');
const ensaiosSource = path.join(root, 'apps-script', 'ensaios-administracion.gs');
const ensaiosTarget = path.join(productionDir, 'ensaios-administracion.js');

for (const [file, message] of [
  [codigoPath, 'Non se atopou apps-script-production/Código.js. Executa antes clasp pull no proxecto de produción.'],
  [ensaiosSource, 'Non se atopou apps-script/ensaios-administracion.gs.']
]) {
  if (!fs.existsSync(file)) throw new Error(message);
}

let codigo = fs.readFileSync(codigoPath, 'utf8');

const anchor = "    if (accion === 'gardarAsistenciaEnsaioPortal') {";
if (!codigo.includes(anchor)) {
  throw new Error('Non se atopou o punto seguro de integración no doPost de produción. Non se modificou Código.js.');
}

const marker = "    if (accion === 'listarEnsaiosAdministracionPortal') {";
const block = `    if (accion === 'listarEnsaiosAdministracionPortal') {\n      try {\n        const resultado = listarEnsaiosAdministracionPortal_(datos);\n        return respostaJSON(resultado);\n      } catch (erroAdminLista) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_ENSAIOS_LIST_EXCEPTION', erro:String(erroAdminLista && erroAdminLista.message ? erroAdminLista.message : erroAdminLista) });\n      }\n    }\n\n    if (accion === 'actualizarEnsaioAdministracionPortal') {\n      try {\n        bloqueo.waitLock(10000);\n        const resultado = actualizarEnsaioAdministracionPortal_(datos);\n        return respostaJSON(resultado);\n      } catch (erroAdminActualizacion) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_ENSAIOS_UPDATE_EXCEPTION', erro:String(erroAdminActualizacion && erroAdminActualizacion.message ? erroAdminActualizacion.message : erroAdminActualizacion), detalle:String(erroAdminActualizacion && erroAdminActualizacion.stack ? erroAdminActualizacion.stack : '') });\n      }\n    }\n\n`;

if (!codigo.includes(marker)) {
  codigo = codigo.replace(anchor, block + anchor);
}

if (!codigo.includes(marker) || !codigo.includes("accion === 'actualizarEnsaioAdministracionPortal'")) {
  throw new Error('A integración administrativa non quedou completa. Non se debe executar clasp push.');
}

fs.writeFileSync(codigoPath, codigo, 'utf8');
fs.copyFileSync(ensaiosSource, ensaiosTarget);

console.log('Produción de Apps Script preparada para Administración → Ensaios.');
console.log('- Código.js conserva o dispatcher existente e engade só as dúas accións administrativas.');
console.log('- ensaios-administracion.js copiado ao proxecto clasp de produción.');
console.log('- Non se modificou appsscript.json nin ningún ficheiro do módulo normal de Ensaios.');
console.log('Revisa git diff / os ficheiros locais e só despois executa clasp push desde apps-script-production.');
