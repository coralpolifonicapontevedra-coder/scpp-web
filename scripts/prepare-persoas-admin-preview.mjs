import fs from 'node:fs';
import path from 'node:path';

const PREVIEW_SCRIPT_ID = '1icbtEkhRPg0r4wcypJZ4UxQb1NVaky7UKvkrpSQxfx44hAS6rZzq5aeF';
const root = process.cwd();
const previewDir = path.join(root, 'apps-script-preview');
const claspPath = path.join(previewDir, '.clasp.json');
const persoasSource = path.join(root, 'apps-script', 'persoas-administracion.gs');

function fail(message) {
  throw new Error(`[PREVIEW PERSOAS SAFETY] ${message}`);
}

if (!fs.existsSync(previewDir) || !fs.existsSync(claspPath)) {
  fail('Non existe a configuración local de apps-script-preview.');
}

const clasp = JSON.parse(fs.readFileSync(claspPath, 'utf8'));
if (String(clasp.scriptId || '').trim() !== PREVIEW_SCRIPT_ID) {
  fail(`O scriptId non é o de Preview (${PREVIEW_SCRIPT_ID}).`);
}
if (!fs.existsSync(persoasSource)) fail('Falta apps-script/persoas-administracion.gs.');

const jsFiles = fs.readdirSync(previewDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(previewDir, name));

const listarMarker = "    if (accion === 'listarPersoasAdministracion') {";
const dispatcherCandidates = jsFiles.filter((file) => fs.readFileSync(file, 'utf8').includes(listarMarker));
if (dispatcherCandidates.length !== 1) {
  fail(`Esperábase un único dispatcher de Persoas e atopáronse ${dispatcherCandidates.length}.`);
}

const codigoPath = dispatcherCandidates[0];
let codigo = fs.readFileSync(codigoPath, 'utf8');
const anchor = "    if (accion === 'obterFichaPersoaAdministracion') {";
if (!codigo.includes(anchor)) fail('Non se atopou o punto de inserción de Persoas no dispatcher.');

const bloques = `    if (accion === 'crearPersoaAdministracion') {\n      bloqueo.waitLock(10000);\n      const resultado = crearPersoaAdministracion_(datos);\n      rexistrarAcceso({\n        email: correo,\n        tipoEvento: 'Alta de persoa',\n        modulo: 'Administración',\n        resultado: resultado.ok ? 'Correcto' : 'Rexeitado',\n        detalle: resultado.ok ? String(resultado.idPersoa || '') : String(resultado.erro || '')\n      });\n      return respostaJSON(resultado);\n    }\n\n    if (accion === 'actualizarPersoaAdministracion') {\n      bloqueo.waitLock(10000);\n      const resultado = actualizarPersoaAdministracion_(datos);\n      rexistrarAcceso({\n        email: correo,\n        tipoEvento: 'Actualizar persoa',\n        modulo: 'Administración',\n        resultado: resultado.ok ? 'Correcto' : 'Rexeitado',\n        detalle: resultado.ok ? String(resultado.idPersoa || '') : String(resultado.erro || '')\n      });\n      return respostaJSON(resultado);\n    }\n\n    if (accion === 'cambiarEstadoPersoaAdministracion') {\n      bloqueo.waitLock(10000);\n      const resultado = cambiarEstadoPersoaAdministracion_(datos);\n      rexistrarAcceso({\n        email: correo,\n        tipoEvento: datos.activo === true ? 'Reactivar persoa' : 'Baixa de persoa',\n        modulo: 'Administración',\n        resultado: resultado.ok ? 'Correcto' : 'Rexeitado',\n        detalle: resultado.ok ? String(resultado.idPersoa || '') : String(resultado.erro || '')\n      });\n      return respostaJSON(resultado);\n    }\n\n`;

if (!codigo.includes("accion === 'crearPersoaAdministracion'")) {
  codigo = codigo.replace(anchor, bloques + anchor);
}

for (const marker of [
  "accion === 'crearPersoaAdministracion'",
  "accion === 'actualizarPersoaAdministracion'",
  "accion === 'cambiarEstadoPersoaAdministracion'"
]) {
  if (!codigo.includes(marker)) fail(`Non se integrou ${marker}.`);
}

fs.writeFileSync(codigoPath, codigo, 'utf8');
fs.copyFileSync(persoasSource, path.join(previewDir, 'persoas-administracion.js'));

const persoasPreparadas = fs.readFileSync(path.join(previewDir, 'persoas-administracion.js'), 'utf8');
if (!persoasPreparadas.includes("obterPropiedadeObrigatoria_('PERSOAS_SPREADSHEET_ID')")) {
  fail('Persoas non quedou conectado ás propiedades do ambiente.');
}

console.log('Persoas PREVIEW preparado para alta, edición e baixa.');
console.log(`- Dispatcher: ${path.basename(codigoPath)}`);
console.log('- Persoas usa exclusivamente Script Properties do ambiente.');
console.log('- Aínda NON se executou clasp push.');
