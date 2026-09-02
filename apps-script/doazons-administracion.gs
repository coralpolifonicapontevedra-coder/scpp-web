/* Administración de doazóns rexistradas en Colaboracións.
 * Módulo illado: non modifica nin intervén no fluxo CECA.
 */

var DOAZONS_ADMIN_SPREADSHEET_ID_ = '1mqlMESC6ZkE4t1zfA0q1dK3PRFHtKLO71ifdbT2CtHw';
var DOAZONS_ADMIN_SHEET_ = 'Colaboracións';
var DOAZONS_ADMIN_ESTADOS_ = ['Pendente','Pagado','Fallido','Anulado'];

function doazonsTexto_(v){return String(v==null?'':v).trim();}
function doazonsIndices_(cab){var out={};cab.forEach(function(v,i){out[doazonsTexto_(v)]=i;});return out;}
function doazonsIso_(v){var d=v instanceof Date?v:new Date(v);if(isNaN(d.getTime()))return doazonsTexto_(v);return Utilities.formatDate(d,Session.getScriptTimeZone()||'Europe/Madrid',"yyyy-MM-dd'T'HH:mm:ss");}

function follaDoazonsAdministracion_(){
  var sh=SpreadsheetApp.openById(DOAZONS_ADMIN_SPREADSHEET_ID_).getSheetByName(DOAZONS_ADMIN_SHEET_);
  if(!sh)throw new Error('Non se atopou a folla Colaboracións.');
  return sh;
}

function normalizarDoazonAdministracion_(fila,ix){
  function valor(nome){return ix[nome]===undefined?'':fila[ix[nome]];}
  return {
    id:doazonsTexto_(valor('Id_Colaboracion')),
    dataAlta:doazonsIso_(valor('DataAlta')),
    tipoColaboracion:doazonsTexto_(valor('TipoColaboracion')),
    tipoColaborador:doazonsTexto_(valor('TipoColaborador')),
    nome:doazonsTexto_(valor('Nome')),
    nomeCompleto:doazonsTexto_(valor('Nomecompleto')),
    correo:doazonsTexto_(valor('CorreoElectronico')),
    telefono:doazonsTexto_(valor('Telefono')),
    importe:valor('Importe'),
    periodicidade:doazonsTexto_(valor('Periodicidade')),
    formaPago:doazonsTexto_(valor('FormaPago')),
    observacions:doazonsTexto_(valor('Observacións')),
    numOperacionTPV:doazonsTexto_(valor('NumOperacionTPV')),
    estadoPago:doazonsTexto_(valor('EstadoPago')),
    referenciaTPV:doazonsTexto_(valor('ReferenciaTPV')),
    anonimo:['true','si','sí','yes','1','x'].indexOf(doazonsTexto_(valor('Anonimo')).toLowerCase())>=0
  };
}

function listarDoazonsAdministracion_(datos){
  var sh=follaDoazonsAdministracion_(),v=sh.getDataRange().getValues();
  if(v.length<2)return {ok:true,doazons:[],estados:DOAZONS_ADMIN_ESTADOS_.slice()};
  var ix=doazonsIndices_(v[0]);
  if(ix.Id_Colaboracion===undefined)throw new Error('Falta a columna Id_Colaboracion.');
  var doazons=v.slice(1).filter(function(f){return doazonsTexto_(f[ix.Id_Colaboracion]);}).map(function(f){return normalizarDoazonAdministracion_(f,ix);});
  doazons.sort(function(a,b){return String(b.dataAlta||'').localeCompare(String(a.dataAlta||''));});
  return {ok:true,doazons:doazons,estados:DOAZONS_ADMIN_ESTADOS_.slice()};
}

function actualizarEstadoDoazonAdministracion_(datos){
  var id=doazonsTexto_(datos&&datos.id),estado=doazonsTexto_(datos&&datos.estado),actor=doazonsTexto_(datos&&(datos.actorEmail||datos.email)).toLowerCase();
  if(!id)return {ok:false,erro:'Non se indicou a doazón.'};
  if(DOAZONS_ADMIN_ESTADOS_.indexOf(estado)<0)return {ok:false,erro:'Estado de pagamento non válido.'};
  var sh=follaDoazonsAdministracion_(),v=sh.getDataRange().getValues(),ix=doazonsIndices_(v[0]);
  if(ix.Id_Colaboracion===undefined||ix.EstadoPago===undefined)return {ok:false,erro:'A folla non ten as columnas necesarias.'};
  for(var i=1;i<v.length;i++){
    if(doazonsTexto_(v[i][ix.Id_Colaboracion])!==id)continue;
    var anterior=doazonsTexto_(v[i][ix.EstadoPago]);
    sh.getRange(i+1,ix.EstadoPago+1).setValue(estado);
    SpreadsheetApp.flush();
    if(typeof rexistrarActividadePortalXestion_==='function')rexistrarActividadePortalXestion_({actorEmail:actor,modulo:'Doazóns',accion:'Cambiar estado de doazón',elemento:id,resultado:'Correcto',detalle:(anterior||'Sen estado')+' → '+estado});
    return {ok:true,id:id,estado:estado};
  }
  return {ok:false,erro:'Non se atopou a doazón.'};
}

function eliminarDoazonAdministracion_(datos){
  var id=doazonsTexto_(datos&&datos.id),actor=doazonsTexto_(datos&&(datos.actorEmail||datos.email)).toLowerCase();
  if(!id)return {ok:false,erro:'Non se indicou a doazón.'};
  var sh=follaDoazonsAdministracion_(),v=sh.getDataRange().getValues(),ix=doazonsIndices_(v[0]);
  if(ix.Id_Colaboracion===undefined||ix.EstadoPago===undefined)return {ok:false,erro:'A folla non ten as columnas necesarias.'};
  for(var i=v.length-1;i>=1;i--){
    if(doazonsTexto_(v[i][ix.Id_Colaboracion])!==id)continue;
    var estado=doazonsTexto_(v[i][ix.EstadoPago]);
    if(['Fallido','Anulado'].indexOf(estado)<0)return {ok:false,erro:'Só se poden eliminar definitivamente doazóns Fallidas ou Anuladas.'};
    sh.deleteRow(i+1);
    SpreadsheetApp.flush();
    if(typeof rexistrarActividadePortalXestion_==='function')rexistrarActividadePortalXestion_({actorEmail:actor,modulo:'Doazóns',accion:'Eliminar doazón',elemento:id,resultado:'Correcto',detalle:'Estado previo: '+estado});
    return {ok:true,id:id};
  }
  return {ok:false,erro:'Non se atopou a doazón.'};
}
