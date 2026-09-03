/* Xestión individualizada de permisos do Portal SCPP.
 *
 * A auditoría NON crea un rexistro paralelo: reutiliza rexistrarAcceso()
 * e o RexistroAccesosWeb xa existente en SCPP Script - Pruebas.
 */

var XESTION_PERMISOS_CONFIG_ = {
  usuariosSpreadsheetId: '1qbW0q1Z6U3JnW0yGM4ELUWqjRkyNdJckJx0VGSoK-i8',
  sheetUsuarios: 'UsuariosWeb',
  sheetPermisos: 'PermisosPortal'
};
var XESTION_PERMISOS_MODULOS_ = ['administracion','persoas','ensaios','concertos','fotografias','documentacion','repertorio','partituras','sincronizacion','estado','permisos'];
var XESTION_PERMISOS_NIVEIS_ = ['sen_acceso','lectura','escritura','administracion'];

function xestionTexto_(v){return String(v==null?'':v).trim();}
function xestionEmail_(v){return xestionTexto_(v).toLowerCase();}
function xestionBool_(v){if(v===true)return true;return ['true','si','sí','yes','1','x'].indexOf(xestionTexto_(v).toLowerCase())>=0;}
function xestionIndices_(cab){var o={};cab.forEach(function(v,i){o[xestionTexto_(v)]=i;});return o;}
function xestionIso_(v){var d=v instanceof Date?v:new Date(v);if(isNaN(d.getTime()))return '';return Utilities.formatDate(d,Session.getScriptTimeZone()||'Europe/Madrid',"yyyy-MM-dd'T'HH:mm:ss");}

function xestionPropiedadeObrigatoria_(nome){
  var valor=xestionTexto_(PropertiesService.getScriptProperties().getProperty(nome));
  if(!valor)throw new Error('Falta a propiedade obrigatoria: '+nome);
  return valor;
}

function asegurarXestionPermisos_(){
  var ss=SpreadsheetApp.openById(xestionPropiedadeObrigatoria_('USUARIOS_WEB_SPREADSHEET_ID'));
  var permisos=ss.getSheetByName(XESTION_PERMISOS_CONFIG_.sheetPermisos);
  if(!permisos){
    permisos=ss.insertSheet(XESTION_PERMISOS_CONFIG_.sheetPermisos);
    permisos.appendRow(['Id','Email','Persoa','Modulo','Contido','Nivel','Rol','Activo','ActualizadoPor','DataActualizacion']);
    permisos.setFrozenRows(1);
  }
  return {ss:ss,permisos:permisos};
}

function usuariosXestionPermisos_(){
  var ss=SpreadsheetApp.openById(xestionPropiedadeObrigatoria_('USUARIOS_WEB_SPREADSHEET_ID')),sh=ss.getSheetByName(XESTION_PERMISOS_CONFIG_.sheetUsuarios);
  if(!sh)return [];
  var v=sh.getDataRange().getValues();
  if(v.length<2)return [];
  var ix=xestionIndices_(v[0]);
  return v.slice(1).reduce(function(out,f){
    var email=ix.Email===undefined?'':xestionEmail_(f[ix.Email]);
    if(!email)return out;
    if(ix.Activo!==undefined&&!xestionBool_(f[ix.Activo]))return out;
    out.push({email:email,persoa:ix.Persoa===undefined?'':xestionTexto_(f[ix.Persoa]),nome:ix.Nome===undefined?'':xestionTexto_(f[ix.Nome]),activo:true});
    return out;
  },[]);
}

function permisosXestionPortal_(){
  var sh=asegurarXestionPermisos_().permisos,v=sh.getDataRange().getValues();
  if(v.length<2)return [];
  var ix=xestionIndices_(v[0]);
  return v.slice(1).reduce(function(out,f){
    var email=xestionEmail_(f[ix.Email]),mod=xestionTexto_(f[ix.Modulo]).toLowerCase();
    if(!email||!mod)return out;
    out.push({id:xestionTexto_(f[ix.Id]),email:email,persoa:xestionTexto_(f[ix.Persoa]),modulo:mod,contido:xestionTexto_(f[ix.Contido]),nivel:xestionTexto_(f[ix.Nivel])||'sen_acceso',rol:xestionTexto_(f[ix.Rol]),activo:ix.Activo===undefined?true:xestionBool_(f[ix.Activo]),actualizadoPor:xestionTexto_(f[ix.ActualizadoPor]),dataActualizacion:xestionIso_(f[ix.DataActualizacion])});
    return out;
  },[]);
}

function listarPermisosPortalXestion_(datos){
  return {ok:true,usuarios:usuariosXestionPermisos_(),permisos:permisosXestionPortal_(),modulos:XESTION_PERMISOS_MODULOS_,niveis:XESTION_PERMISOS_NIVEIS_};
}

function obterPermisosUsuarioPortalXestion_(datos){
  var email=xestionEmail_(datos&&(datos.usuarioEmail||datos.email));
  if(!email)return {ok:false,erro:'Non se indicou o usuario.'};
  var ps=permisosXestionPortal_().filter(function(p){return p.email===email&&p.activo;});
  var efectivos={};
  ps.forEach(function(p){efectivos[p.modulo+(p.contido?':'+p.contido:'')]=p.nivel;});
  return {ok:true,email:email,permisos:ps,efectivos:efectivos};
}

function validarCambioPermisoXestion_(cambio){
  var mod=xestionTexto_(cambio&&cambio.modulo).toLowerCase();
  var nivel=xestionTexto_(cambio&&cambio.nivel).toLowerCase();
  if(!mod||!nivel)return {ok:false,erro:'Faltan datos do permiso.'};
  if(XESTION_PERMISOS_MODULOS_.indexOf(mod)<0)return {ok:false,erro:'Módulo non válido: '+mod};
  if(XESTION_PERMISOS_NIVEIS_.indexOf(nivel)<0)return {ok:false,erro:'Nivel non válido: '+nivel};
  return {ok:true,modulo:mod,nivel:nivel};
}

function gardarPermisoPortalXestion_(datos){
  var email=xestionEmail_(datos&&datos.usuarioEmail),mod=xestionTexto_(datos&&datos.modulo).toLowerCase(),cont=xestionTexto_(datos&&datos.contido),nivel=xestionTexto_(datos&&datos.nivel).toLowerCase(),actor=xestionEmail_(datos&&datos.actorEmail),persoa=xestionTexto_(datos&&datos.persoa),rol=xestionTexto_(datos&&datos.rol);
  if(!email||!mod||!nivel)return {ok:false,erro:'Faltan datos do permiso.'};
  if(XESTION_PERMISOS_MODULOS_.indexOf(mod)<0)return {ok:false,erro:'Módulo non válido.'};
  if(XESTION_PERMISOS_NIVEIS_.indexOf(nivel)<0)return {ok:false,erro:'Nivel non válido.'};
  var sh=asegurarXestionPermisos_().permisos,v=sh.getDataRange().getValues(),ix=xestionIndices_(v[0]),rowNum=0;
  for(var i=1;i<v.length;i++){
    if(xestionEmail_(v[i][ix.Email])===email&&xestionTexto_(v[i][ix.Modulo]).toLowerCase()===mod&&xestionTexto_(v[i][ix.Contido])===cont){rowNum=i+1;break;}
  }
  var id=rowNum?xestionTexto_(sh.getRange(rowNum,ix.Id+1).getValue()):Utilities.getUuid();
  var row=[id,email,persoa,mod,cont,nivel,rol,true,actor,new Date()];
  if(rowNum)sh.getRange(rowNum,1,1,row.length).setValues([row]);else sh.appendRow(row);
  SpreadsheetApp.flush();
  rexistrarActividadePortalXestion_({actorEmail:actor,modulo:'Permisos',accion:'Modificar permiso',elemento:email+' · '+mod+(cont?' · '+cont:''),resultado:'Correcto',detalle:'Nivel: '+nivel});
  return {ok:true};
}

function gardarPermisosPortalLoteXestion_(datos){
  var email=xestionEmail_(datos&&datos.usuarioEmail),actor=xestionEmail_(datos&&datos.actorEmail),persoa=xestionTexto_(datos&&datos.persoa),rol=xestionTexto_(datos&&datos.rol),cambios=Array.isArray(datos&&datos.cambios)?datos.cambios:[];
  if(!email)return {ok:false,erro:'Non se indicou a persoa destinataria.'};
  if(!cambios.length)return {ok:false,erro:'Non hai cambios para gardar.'};
  if(cambios.length>50)return {ok:false,erro:'Hai demasiados cambios nunha soa operación.'};

  var normalizados=[];
  for(var c=0;c<cambios.length;c++){
    var validado=validarCambioPermisoXestion_(cambios[c]);
    if(!validado.ok)return validado;
    normalizados.push({modulo:validado.modulo,nivel:validado.nivel});
  }

  var sh=asegurarXestionPermisos_().permisos;
  var v=sh.getDataRange().getValues();
  var cabeceiras=v.length?v[0]:['Id','Email','Persoa','Modulo','Contido','Nivel','Rol','Activo','ActualizadoPor','DataActualizacion'];
  var ix=xestionIndices_(cabeceiras);
  var filas=v.length>1?v.slice(1):[];
  var agora=new Date();

  normalizados.forEach(function(cambio){
    var indice=-1;
    for(var i=0;i<filas.length;i++){
      if(xestionEmail_(filas[i][ix.Email])===email&&xestionTexto_(filas[i][ix.Modulo]).toLowerCase()===cambio.modulo&&xestionTexto_(filas[i][ix.Contido])===''){
        indice=i;
        break;
      }
    }

    if(cambio.nivel==='sen_acceso'){
      if(indice>=0)filas.splice(indice,1);
      return;
    }

    var fila=[
      indice>=0?xestionTexto_(filas[indice][ix.Id]):Utilities.getUuid(),
      email,
      persoa,
      cambio.modulo,
      '',
      cambio.nivel,
      rol,
      true,
      actor,
      agora
    ];
    if(indice>=0)filas[indice]=fila;else filas.push(fila);
  });

  var columnas=cabeceiras.length;
  if(filas.length){
    sh.getRange(2,1,filas.length,columnas).setValues(filas.map(function(fila){
      var copia=fila.slice(0,columnas);
      while(copia.length<columnas)copia.push('');
      return copia;
    }));
  }
  var antigas=Math.max(v.length-1,0);
  if(antigas>filas.length){
    sh.getRange(2+filas.length,1,antigas-filas.length,columnas).clearContent();
  }
  SpreadsheetApp.flush();

  rexistrarActividadePortalXestion_({
    actorEmail:actor,
    modulo:'Permisos',
    accion:'Modificar permisos en lote',
    elemento:email,
    resultado:'Correcto',
    detalle:String(normalizados.length)+' cambios gardados'
  });
  return {ok:true,total:normalizados.length};
}

function eliminarPermisoPortalXestion_(datos){
  var id=xestionTexto_(datos&&datos.id),email=xestionEmail_(datos&&datos.usuarioEmail),mod=xestionTexto_(datos&&datos.modulo).toLowerCase(),cont=xestionTexto_(datos&&datos.contido),actor=xestionEmail_(datos&&datos.actorEmail),sh=asegurarXestionPermisos_().permisos,v=sh.getDataRange().getValues(),ix=xestionIndices_(v[0]);
  for(var i=v.length-1;i>=1;i--){
    var coincide=id?xestionTexto_(v[i][ix.Id])===id:(xestionEmail_(v[i][ix.Email])===email&&xestionTexto_(v[i][ix.Modulo]).toLowerCase()===mod&&xestionTexto_(v[i][ix.Contido])===cont);
    if(coincide){
      sh.deleteRow(i+1);
      SpreadsheetApp.flush();
      rexistrarActividadePortalXestion_({actorEmail:actor,modulo:'Permisos',accion:'Eliminar permiso',elemento:email+' · '+mod,resultado:'Correcto',detalle:''});
      return {ok:true};
    }
  }
  return {ok:false,erro:'Non se atopou o permiso.'};
}

function rexistrarActividadePortalXestion_(datos){
  var email=xestionEmail_(datos&&(datos.actorEmail||datos.email));
  if(!email)return {ok:false,erro:'Non se indicou o usuario.'};
  rexistrarAcceso({
    email: email,
    tipoEvento: xestionTexto_(datos&&datos.accion) || 'Actividade administrativa',
    modulo: xestionTexto_(datos&&datos.modulo) || 'Permisos',
    resultado: xestionTexto_(datos&&datos.resultado) || 'Correcto',
    detalle: [xestionTexto_(datos&&datos.elemento),xestionTexto_(datos&&datos.detalle)].filter(function(v){return !!v;}).join(' · ')
  });
  return {ok:true};
}

function follaRexistroAccesosXestion_(){
  var props=PropertiesService.getScriptProperties();
  var spreadsheetId=xestionTexto_(props.getProperty('REXISTRO_ACCESOS_SPREADSHEET_ID'));
  var sheetId=Number(xestionTexto_(props.getProperty('REXISTRO_ACCESOS_SHEET_ID')));
  if(!spreadsheetId||!sheetId)throw new Error('RexistroAccesosWeb non está configurado.');
  var sh=SpreadsheetApp.openById(spreadsheetId).getSheetById(sheetId);
  if(!sh)throw new Error('Non se atopou a pestana de RexistroAccesosWeb.');
  return sh;
}

function listarActividadePortalXestion_(datos){
  var sh=follaRexistroAccesosXestion_(),v=sh.getDataRange().getValues();
  if(v.length<2)return {ok:true,actividade:[]};
  var ix=xestionIndices_(v[0]);
  var cId=ix.Id!==undefined?ix.Id:0;
  var cPersoa=ix.Persoa!==undefined?ix.Persoa:1;
  var cEmail=ix.Email!==undefined?ix.Email:3;
  var cData=ix.DataHora!==undefined?ix.DataHora:4;
  var cAccion=ix.TipoEvento!==undefined?ix.TipoEvento:(ix.Accion!==undefined?ix.Accion:5);
  var cModulo=ix.Modulo!==undefined?ix.Modulo:6;
  var cResultado=ix.Resultado!==undefined?ix.Resultado:7;
  var cDetalle=ix.Detalle!==undefined?ix.Detalle:8;
  var desde=xestionTexto_(datos&&datos.desde),ata=xestionTexto_(datos&&datos.ata),fe=xestionEmail_(datos&&datos.filtroEmail),fm=xestionTexto_(datos&&datos.filtroModulo).toLowerCase();
  var inicio=desde?new Date(desde+'T00:00:00'):null,fin=ata?new Date(ata+'T23:59:59'):null,lim=Math.min(Math.max(Number(datos&&datos.limite)||250,1),1000);
  var out=v.slice(1).reduce(function(a,f){
    var d=f[cData] instanceof Date?f[cData]:new Date(f[cData]),email=xestionEmail_(f[cEmail]),mod=xestionTexto_(f[cModulo]);
    if(isNaN(d.getTime()))return a;
    if((inicio&&d<inicio)||(fin&&d>fin)||(fe&&email!==fe)||(fm&&mod.toLowerCase()!==fm))return a;
    a.push({id:xestionTexto_(f[cId]),dataHora:xestionIso_(d),email:email,persoa:xestionTexto_(f[cPersoa]),modulo:mod,accion:xestionTexto_(f[cAccion]),elemento:'',resultado:xestionTexto_(f[cResultado]),detalle:xestionTexto_(f[cDetalle])});
    return a;
  },[]);
  out.sort(function(a,b){return b.dataHora.localeCompare(a.dataHora);});
  return {ok:true,actividade:out.slice(0,lim)};
}
