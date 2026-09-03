/* Integración no doPost principal de SCPP Script - Pruebas.
 * NON crear un segundo doPost.
 */

var ACCIONS_ADMIN_XESTION_PERMISOS_ = [
  'listarPermisosPortal','gardarPermisoPortal','gardarPermisosPortalLote','eliminarPermisoPortal','rexistrarActividadePortal','listarActividadePortal',
  'listarDoazonsAdministracion','actualizarEstadoDoazonAdministracion','eliminarDoazonAdministracion'
];

var ACCIONS_PERSOAS_ADMIN_PORTAL_ = [
  'listarPersoasAdministracion','crearPersoaAdministracion','crearPersoaInvitacionAdministracion','listarEstadosAltaPersoasAdministracion','actualizarPersoaAdministracion','completarAltaPersoaAdministracion','cambiarEstadoPersoaAdministracion','enviarRevisionsPersoasAdministracion',
  'persoasNovoListar','persoasNovoCrear','persoasNovoActualizar','persoasNovoEstado'
];

function despacharPersoasAdministracionPortal_(accion, datos) {
  if (ACCIONS_PERSOAS_ADMIN_PORTAL_.indexOf(accion) < 0) return null;
  if (accion === 'listarPersoasAdministracion' || accion === 'persoasNovoListar') return persoasNovoListarCompleto_(datos);
  if (accion === 'persoasNovoCrear') return persoasNovoCrearPortal_(datos);
  if (accion === 'persoasNovoActualizar') return persoasNovoActualizarPortal_(datos);
  if (accion === 'persoasNovoEstado') return persoasNovoEstadoPortal_(datos);
  if (accion === 'crearPersoaAdministracion') return crearPersoaAdministracion_(datos);
  if (accion === 'crearPersoaInvitacionAdministracion') return typeof crearPersoaInvitacionAdministracion_ === 'function' ? crearPersoaInvitacionAdministracion_(datos) : persoasNovoCrearPortal_(Object.assign({},datos,{modo:'invitacion'}));
  if (accion === 'listarEstadosAltaPersoasAdministracion') return typeof listarEstadosAltaPersoasAdministracion_ === 'function' ? listarEstadosAltaPersoasAdministracion_(datos) : {ok:true,estados:[]};
  if (accion === 'actualizarPersoaAdministracion') return actualizarPersoaAdministracion_(datos);
  if (accion === 'completarAltaPersoaAdministracion') return completarAltaPersoaAdministracion_(datos);
  if (accion === 'cambiarEstadoPersoaAdministracion') return cambiarEstadoPersoaAdministracion_(datos);
  if (accion === 'enviarRevisionsPersoasAdministracion') return enviarRevisionsPersoasAdministracion_(datos);
  return null;
}

function autorizarXestionPermisosPortal_(accion, datos) {
  if (ACCIONS_ADMIN_XESTION_PERMISOS_.indexOf(accion) < 0) return null;
  var correo=String(datos&&(datos.actorEmail||datos.email)||'').trim().toLowerCase();
  if(!correo)return{ok:false,codigo:'ADMIN_REQUIRED',erro:'Non se puido identificar a conta administradora.'};
  var permiso=resolverPermisosPortal_(correo);
  if(!permiso||permiso.escritura!==true)return{ok:false,codigo:'ADMIN_REQUIRED',erro:'A túa conta non ten permisos de administración para esta operación.'};
  return null;
}

function despacharXestionPermisosPortal_(accion, datos, bloqueo) {
  accion=String(accion||'').trim();
  var respostaPersoas=despacharPersoasAdministracionPortal_(accion,datos);
  if(respostaPersoas!==null){
    rexistrarAcceso({email:String(datos&&datos.email||'').trim().toLowerCase(),tipoEvento:'Administración de persoa · '+accion,modulo:'Administración · Persoas',resultado:respostaPersoas.ok?'Correcto':'Rexeitado',detalle:respostaPersoas.ok?String(respostaPersoas.idPersoa||respostaPersoas.enviados||''):String(respostaPersoas.erro||'')});
    return respostaPersoas;
  }
  var erroAutorizacion=autorizarXestionPermisosPortal_(accion,datos);if(erroAutorizacion)return erroAutorizacion;
  if(accion==='listarPermisosPortal')return listarPermisosPortalXestion_(datos);
  if(accion==='obterPermisosUsuarioPortal')return obterPermisosUsuarioPortalXestion_(datos);
  if(accion==='gardarPermisoPortal'){if(bloqueo)bloqueo.waitLock(10000);return gardarPermisoPortalXestion_(datos);}
  if(accion==='gardarPermisosPortalLote'){if(bloqueo)bloqueo.waitLock(10000);return gardarPermisosPortalLoteXestion_(datos);}
  if(accion==='eliminarPermisoPortal'){if(bloqueo)bloqueo.waitLock(10000);return eliminarPermisoPortalXestion_(datos);}
  if(accion==='rexistrarActividadePortal')return rexistrarActividadePortalXestion_(datos);
  if(accion==='listarActividadePortal')return listarActividadePortalXestion_(datos);
  if(accion==='listarDoazonsAdministracion')return listarDoazonsAdministracion_(datos);
  if(accion==='actualizarEstadoDoazonAdministracion'){if(bloqueo)bloqueo.waitLock(10000);return actualizarEstadoDoazonAdministracion_(datos);}
  if(accion==='eliminarDoazonAdministracion'){if(bloqueo)bloqueo.waitLock(10000);return eliminarDoazonAdministracion_(datos);}
  return null;
}

var ACCIONS_ESCRITURA_XESTION_PERMISOS_=['gardarPermisoPortal','gardarPermisosPortalLote','eliminarPermisoPortal','rexistrarActividadePortal','actualizarEstadoDoazonAdministracion','eliminarDoazonAdministracion'];
function eAccionEscrituraXestionPermisos_(accion){return ACCIONS_ESCRITURA_XESTION_PERMISOS_.indexOf(String(accion||'').trim())>=0;}
