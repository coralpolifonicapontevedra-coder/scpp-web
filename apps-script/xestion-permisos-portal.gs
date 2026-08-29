/* Xestión individualizada de permisos e auditoría do Portal SCPP. */

var XESTION_PERMISOS_CONFIG_ = {
  usuariosSpreadsheetId: '1qbW0q1Z6U3JnW0yGM4ELUWqjRkyNdJckJx0VGSoK-i8',
  sheetUsuarios: 'UsuariosWeb',
  sheetPermisos: 'PermisosPortal',
  sheetActividade: 'RexistroAccesos'
};
var XESTION_PERMISOS_MODULOS_ = ['administracion','persoas','ensaios','concertos','fotografias','documentacion','repertorio','partituras','sincronizacion','estado','permisos'];
var XESTION_PERMISOS_NIVEIS_ = ['sen_acceso','lectura','escritura','administracion'];

function xestionTexto_(v){return String(v==null?'':v).trim();}
function xestionEmail_(v){return xestionTexto_(v).toLowerCase();}
function xestionBool_(v){if(v===true)return true;return ['true','si','sí','yes','1','x'].indexOf(xestionTexto_(v).toLowerCase())>=0;}
function xestionIndices_(cab){var o={};cab.forEach(function(v,i){o[xestionTexto_(v)]=i;});return o;}
function xestionIso_(v){var d=v instanceof Date?v:new Date(v);if(isNaN(d.getTime()))return '';return Utilities.formatDate(d,Session.getScriptTimeZone()||'Europe/Madrid',"yyyy-MM-dd'T'HH:mm:ss");}

function asegurarXestionPermisos_(){
  var ss=SpreadsheetApp.openById(XESTION_PERMISOS_CONFIG_.usuariosSpreadsheetId);
  var permisos=ss.getSheetByName(XESTION_PERMISOS_CONFIG_.sheetPermisos);
  if(!permisos){permisos=ss.insertSheet(XESTION_PERMISOS_CONFIG_.sheetPermisos);permisos.appendRow(['Id','Email','Persoa','Modulo','Contido','Nivel','Rol','Activo','ActualizadoPor','DataActualizacion']);permisos.setFrozenRows(1);}
  var actividade=ss.getSheetByName(XESTION_PERMISOS_CONFIG_.sheetActividade);
  if(!actividade){actividade=ss.insertSheet(XESTION_PERMISOS_CONFIG_.sheetActividade);actividade.appendRow(['Id','DataHora','Email','Persoa','Modulo','Accion','Elemento','Resultado','Detalle']);actividade.setFrozenRows(1);}
  return {ss:ss,permisos:permisos,actividade:actividade};
}

function usuariosXestionPermisos_(){
  var ss=SpreadsheetApp.openById(XESTION_PERMISOS_CONFIG_.usuariosSpreadsheetId),sh=ss.getSheetByName(XESTION_PERMISOS_CONFIG_.sheetUsuarios);
  if(!sh)return [];var v=sh.getDataRange().getValues();if(v.length<2)return [];var ix=xestionIndices_(v[0]);
  return v.slice(1).reduce(function(out,f){var email=ix.Email===undefined?'':xestionEmail_(f[ix.Email]);if(!email)return out;if(ix.Activo!==undefined&&!xestionBool_(f[ix.Activo]))return out;out.push({email:email,persoa:ix.Persoa===undefined?'':xestionTexto_(f[ix.Persoa]),nome:ix.Nome===undefined?'':xestionTexto_(f[ix.Nome]),activo:true});return out;},[]);
}

function permisosXestionPortal_(){
  var sh=asegurarXestionPermisos_().permisos,v=sh.getDataRange().getValues();if(v.length<2)return [];var ix=xestionIndices_(v[0]);
  return v.slice(1).reduce(function(out,f){var email=xestionEmail_(f[ix.Email]),mod=xestionTexto_(f[ix.Modulo]).toLowerCase();if(!email||!mod)return out;out.push({id:xestionTexto_(f[ix.Id]),email:email,persoa:xestionTexto_(f[ix.Persoa]),modulo:mod,contido:xestionTexto_(f[ix.Contido]),nivel:xestionTexto_(f[ix.Nivel])||'sen_acceso',rol:xestionTexto_(f[ix.Rol]),activo:ix.Activo===undefined?true:xestionBool_(f[ix.Activo]),actualizadoPor:xestionTexto_(f[ix.ActualizadoPor]),dataActualizacion:xestionIso_(f[ix.DataActualizacion])});return out;},[]);
}

function listarPermisosPortalXestion_(datos){return {ok:true,usuarios:usuariosXestionPermisos_(),permisos:permisosXestionPortal_(),modulos:XESTION_PERMISOS_MODULOS_,niveis:XESTION_PERMISOS_NIVEIS_};}
function obterPermisosUsuarioPortalXestion_(datos){var email=xestionEmail_(datos&&(datos.usuarioEmail||datos.email));if(!email)return {ok:false,erro:'Non se indicou o usuario.'};var ps=permisosXestionPortal_().filter(function(p){return p.email===email&&p.activo;});var efectivos={};ps.forEach(function(p){efectivos[p.modulo+(p.contido?':'+p.contido:'')]=p.nivel;});return {ok:true,email:email,permisos:ps,efectivos:efectivos};}

function gardarPermisoPortalXestion_(datos){
  var email=xestionEmail_(datos&&datos.usuarioEmail),mod=xestionTexto_(datos&&datos.modulo).toLowerCase(),cont=xestionTexto_(datos&&datos.contido),nivel=xestionTexto_(datos&&datos.nivel).toLowerCase(),actor=xestionEmail_(datos&&datos.actorEmail),persoa=xestionTexto_(datos&&datos.persoa),rol=xestionTexto_(datos&&datos.rol);
  if(!email||!mod||!nivel)return {ok:false,erro:'Faltan datos do permiso.'};if(XESTION_PERMISOS_MODULOS_.indexOf(mod)<0)return {ok:false,erro:'Módulo non válido.'};if(XESTION_PERMISOS_NIVEIS_.indexOf(nivel)<0)return {ok:false,erro:'Nivel non válido.'};
  var sh=asegurarXestionPermisos_().permisos,v=sh.getDataRange().getValues(),ix=xestionIndices_(v[0]),rowNum=0;
  for(var i=1;i<v.length;i++){if(xestionEmail_(v[i][ix.Email])===email&&xestionTexto_(v[i][ix.Modulo]).toLowerCase()===mod&&xestionTexto_(v[i][ix.Contido])===cont){rowNum=i+1;break;}}
  var id=rowNum?xestionTexto_(sh.getRange(rowNum,ix.Id+1).getValue()):Utilities.getUuid();var row=[id,email,persoa,mod,cont,nivel,rol,true,actor,new Date()];if(rowNum)sh.getRange(rowNum,1,1,row.length).setValues([row]);else sh.appendRow(row);
  rexistrarActividadePortalXestion_({actorEmail:actor,modulo:'permisos',accion:'modificar_permiso',elemento:email+' · '+mod+(cont?' · '+cont:''),resultado:'permitido',detalle:'Nivel: '+nivel});return {ok:true};
}

function eliminarPermisoPortalXestion_(datos){
  var id=xestionTexto_(datos&&datos.id),email=xestionEmail_(datos&&datos.usuarioEmail),mod=xestionTexto_(datos&&datos.modulo).toLowerCase(),cont=xestionTexto_(datos&&datos.contido),actor=xestionEmail_(datos&&datos.actorEmail),sh=asegurarXestionPermisos_().permisos,v=sh.getDataRange().getValues(),ix=xestionIndices_(v[0]);
  for(var i=v.length-1;i>=1;i--){var coincide=id?xestionTexto_(v[i][ix.Id])===id:(xestionEmail_(v[i][ix.Email])===email&&xestionTexto_(v[i][ix.Modulo]).toLowerCase()===mod&&xestionTexto_(v[i][ix.Contido])===cont);if(coincide){sh.deleteRow(i+1);rexistrarActividadePortalXestion_({actorEmail:actor,modulo:'permisos',accion:'eliminar_permiso',elemento:email+' · '+mod,resultado:'permitido',detalle:''});return {ok:true};}}
  return {ok:false,erro:'Non se atopou o permiso.'};
}

function rexistrarActividadePortalXestion_(datos){
  var email=xestionEmail_(datos&&(datos.actorEmail||datos.email));if(!email)return {ok:false,erro:'Non se indicou o usuario.'};var u=usuariosXestionPermisos_().find(function(x){return x.email===email;});
  asegurarXestionPermisos_().actividade.appendRow([Utilities.getUuid(),new Date(),email,u?(u.nome||u.persoa):'',xestionTexto_(datos&&datos.modulo),xestionTexto_(datos&&datos.accion),xestionTexto_(datos&&datos.elemento),xestionTexto_(datos&&datos.resultado)||'permitido',xestionTexto_(datos&&datos.detalle)]);return {ok:true};
}

function listarActividadePortalXestion_(datos){
  var sh=asegurarXestionPermisos_().actividade,v=sh.getDataRange().getValues();if(v.length<2)return {ok:true,actividade:[]};var ix=xestionIndices_(v[0]),desde=xestionTexto_(datos&&datos.desde),ata=xestionTexto_(datos&&datos.ata),fe=xestionEmail_(datos&&datos.filtroEmail),fm=xestionTexto_(datos&&datos.filtroModulo).toLowerCase(),inicio=desde?new Date(desde+'T00:00:00'):null,fin=ata?new Date(ata+'T23:59:59'):null,lim=Math.min(Math.max(Number(datos&&datos.limite)||250,1),1000);
  var out=v.slice(1).reduce(function(a,f){var d=f[ix.DataHora] instanceof Date?f[ix.DataHora]:new Date(f[ix.DataHora]),email=xestionEmail_(f[ix.Email]),mod=xestionTexto_(f[ix.Modulo]);if((inicio&&d<inicio)||(fin&&d>fin)||(fe&&email!==fe)||(fm&&mod.toLowerCase()!==fm))return a;a.push({id:xestionTexto_(f[ix.Id]),dataHora:xestionIso_(d),email:email,persoa:xestionTexto_(f[ix.Persoa]),modulo:mod,accion:xestionTexto_(f[ix.Accion]),elemento:xestionTexto_(f[ix.Elemento]),resultado:xestionTexto_(f[ix.Resultado]),detalle:xestionTexto_(f[ix.Detalle])});return a;},[]);out.sort(function(a,b){return b.dataHora.localeCompare(a.dataHora);});return {ok:true,actividade:out.slice(0,lim)};
}
