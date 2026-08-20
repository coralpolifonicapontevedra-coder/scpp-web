import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),productionDir=path.join(root,'apps-script-production'),codigoPath=path.join(productionDir,'Código.js'),concertosSource=path.join(root,'apps-script','concertos-administracion.gs'),concertosTarget=path.join(productionDir,'concertos-administracion.js');
for(const [file,message] of [[codigoPath,'Non se atopou apps-script-production/Código.js. Executa antes clasp pull.'],[concertosSource,'Non se atopou apps-script/concertos-administracion.gs.']])if(!fs.existsSync(file))throw new Error(message);
let codigo=fs.readFileSync(codigoPath,'utf8');const anchor="    if (accion === 'gardarAsistenciaEnsaioPortal') {";if(!codigo.includes(anchor))throw new Error('Non se atopou o punto seguro de integración no doPost.');
const actions=[
 ['listarConcertosAdministracionPortal','listarConcertosAdministracionPortal_',false],
 ['actualizarConcertoAdministracionPortal','actualizarConcertoAdministracionPortal_',true],
 ['obterXestionConcertoAdministracionPortal','obterXestionConcertoAdministracionPortal_',false],
 ['gardarProgramaConcertoAdministracionPortal','gardarProgramaConcertoAdministracionPortal_',true]
];
let block='';for(const [accion,fn,write] of actions){if(codigo.includes(`accion === '${accion}'`))continue;block+=`    if (accion === '${accion}') {\n      try {\n${write?'        bloqueo.waitLock(10000);\n':''}        const resultado = ${fn}(datos);\n        return respostaJSON(resultado);\n      } catch (erroConcertos) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_CONCERTOS_EXCEPTION', erro:String(erroConcertos && erroConcertos.message ? erroConcertos.message : erroConcertos) });\n      }\n    }\n\n`;}
if(block)codigo=codigo.replace(anchor,block+anchor);for(const [accion] of actions)if(!codigo.includes(`accion === '${accion}'`))throw new Error('Falta integrar '+accion+'. Non se debe executar clasp push.');fs.writeFileSync(codigoPath,codigo,'utf8');fs.copyFileSync(concertosSource,concertosTarget);console.log('Apps Script preparado: Concertos inclúe listado, actualización, carga de xestión e gardado de programa.');console.log('Ensaios non foi modificado por este script.');
