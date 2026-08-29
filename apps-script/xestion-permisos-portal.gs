/* Xestión individualizada de permisos e auditoría do Portal SCPP. */

var XESTION_PERMISOS_CONFIG_ = {
  usuariosSpreadsheetId: '1qbW0q1Z6U3JnW0yGM4ELUWqjRkyNdJckJx0VGSoK-i8',
  sheetUsuarios: 'UsuariosWeb',
  sheetPermisos: 'PermisosPortal',
  sheetActividade: 'RexistroAccesos'
};

var XESTION_PERMISOS_MODULOS_ = [
  'administracion','persoas','ensaios','concertos','fotografias',
  'documentacion','repertorio','partituras','estado','permisos'
];
var XESTION_PERMISOS_NIVEIS_ = ['sen_acceso','lectura','escritura','administracion'];

function xestionTexto_(v) { return String(v == null ? '' : v).trim(); }
function xestionEmail_(v) { return xestionTexto_(v).toLowerCase(); }
function xestionBool_(v) {
  if (v === true) return true;
  return ['true','si','sí','yes','1','x'].indexOf(xestionTexto_(v).toLowerCase()) >= 0;
}
function xestionIndices_(cab) {
  var out = {};
  cab.forEach(function(v, i) { out[xestionTexto_(v)] = i; });
  return out;
}
function xestionIso_(v) {
  var d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Europe/Madrid', "yyyy-MM-dd'T'HH:mm:ss");
}

function asegurarXestionPermisos_() {
  var ss = SpreadsheetApp.openById(XESTION_PERMISOS_CONFIG_.usuariosSpreadsheetId);
  var permisos = ss.getSheetByName(XESTION_PERMISOS_CONFIG_.sheetPermisos);
  if (!permisos) {
    permisos = ss.insertSheet(XESTION_PERMISOS_CONFIG_.sheetPermisos);
    permisos.appendRow(['Id','Email','Persoa','Modulo','Contido','Nivel','Rol','Activo','ActualizadoPor','DataActualizacion']);
    permisos.setFrozenRows(1);
  }
  var actividade = ss.getSheetByName(XESTION_PERMISOS_CONFIG_.sheetActividade);
  if (!actividade) {
    actividade = ss.insertSheet(XESTION_PERMISOS_CONFIG_.sheetActividade);
    actividade.appendRow(['Id','DataHora','Email','Persoa','Modulo','Accion','Elemento','Resultado','Detalle']);
    actividade.setFrozenRows(1);
  }
  return { ss:ss, permisos:permisos, actividade:actividade };
}

function usuariosXestionPermisos_() {
  var ss = SpreadsheetApp.openById(XESTION_PERMISOS_CONFIG_.usuariosSpreadsheetId);
  var sh = ss.getSheetByName(XESTION_PERMISOS_CONFIG_.sheetUsuarios);
  if (!sh) return [];
  var valores = sh.getDataRange().getValues();
  if (valores.length < 2) return [];
  var ix = xestionIndices_(valores[0]);
  return valores.slice(1).reduce(function(out, fila) {
    var email = ix.Email === undefined ? '' : xestionEmail_(fila[ix.Email]);
    if (!email) return out;
    if (ix.Activo !== undefined && !xestionBool_(fila[ix.Activo])) return out;
    out.push({
      email: email,
      persoa: ix.Persoa === undefined ? '' : xestionTexto_(fila[ix.Persoa]),
      nome: ix.Nome === undefined ? '' : xestionTexto_(fila[ix.Nome]),
      activo: true
    });
    return out;
  }, []);
}

function permisosXestionPortal_() {
  var sh = asegurarXestionPermisos_().permisos;
  var valores = sh.getDataRange().getValues();
  if (valores.length < 2) return [];
  var ix = xestionIndices_(valores[0]);
  return valores.slice(1).reduce(function(out, fila) {
    var email = xestionEmail_(fila[ix.Email]);
    var modulo = xestionTexto_(fila[ix.Modulo]).toLowerCase();
    if (!email || !modulo) return out;
    out.push({
      id:xestionTexto_(fila[ix.Id]), email:email,
      persoa:xestionTexto_(fila[ix.Persoa]), modulo:modulo,
      contido:xestionTexto_(fila[ix.Contido]), nivel:xestionTexto_(fila[ix.Nivel]) || 'sen_acceso',
      rol:xestionTexto_(fila[ix.Rol]), activo:ix.Activo === undefined ? true : xestionBool_(fila[ix.Activo]),
      actualizadoPor:xestionTexto_(fila[ix.ActualizadoPor]), dataActualizacion:xestionIso_(fila[ix.DataActualizacion])
    });
    return out;
  });
}

function listarPermisosPortalXestion_(datos) {
  return { ok:true, usuarios:usuariosXestionPermisos_(), permisos:permisosXestionPortal_(), modulos:XESTION_PERMISOS_MODULOS_, niveis:XESTION_PERMISOS_NIVEIS_ };
}

function obterPermisosUsuarioPortalXestion_(datos) {
  var email = xestionEmail_(datos && (datos.usuarioEmail || datos.email));
  if (!email) return { ok:false, erro:'Non se indicou o usuario.' };
  var permisos = permisosXestionPortal_().filter(function(p) { return p.email === email && p.activo; });
  var efectivos = {};
  permisos.forEach(function(p) { efectivos[p.modulo + (p.contido ? ':' + p.contido : '')] = p.nivel; });
  return { ok:true, email:email, permisos:permisos, efectivos:efectivos };
}

function gardarPermisoPortalXestion_(datos) {
  var email = xestionEmail_(datos && datos.usuarioEmail);
  var modulo = xestionTexto_(datos && datos.modulo).toLowerCase();
  var contido = xestionTexto_(datos && datos.contido);
  var nivel = xestionTexto_(datos && datos.nivel).toLowerCase();
  var actor = xestionEmail_(datos && datos.actorEmail);
  var persoa = xestionTexto_(datos && datos.persoa);
  var rol = xestionTexto_(datos && datos.rol);
  if (!email || !modulo || !nivel) return { ok:false, erro:'Faltan datos do permiso.' };
  if (XESTION_PERMISOS_MODULOS_.indexOf(modulo) < 0) return { ok:false, erro:'Módulo non válido.' };
  if (XESTION_PERMISOS_NIVEIS_.indexOf(nivel) < 0) return { ok:false, erro:'Nivel non válido.' };

  var sh = asegurarXestionPermisos_().permisos;
  var valores = sh.getDataRange().getValues();
  var ix = xestionIndices_(valores[0]);
  var rowNum = 0;
  for (var i=1; i<valores.length; i++) {
    if (xestionEmail_(valores[i][ix.Email]) === email && xestionTexto_(valores[i][ix.Modulo]).toLowerCase() === modulo && xestionTexto_(valores[i][ix.Contido]) === contido) { rowNum=i+1; break; }
  }
  var id = rowNum ? xestionTexto_(sh.getRange(rowNum, ix.Id+1).getValue()) : Utilities.getUuid();
  var row = [id,email,persoa,modulo,contido,nivel,rol,true,actor,new Date()];
  if (rowNum) sh.getRange(rowNum,1,1,row.length).setValues([row]); else sh.appendRow(row);
  rexistrarActividadePortalXestion_({ actorEmail:actor, modulo:'permisos', accion:'modificar_permiso', elemento:email+' · '+modulo+(contido?' · '+contido:''), resultado:'permitido', detalle:'Nivel: '+nivel });
  return { ok:true };
}

function eliminarPermisoPortalXestion_(datos) {
  var id = xestionTexto_(datos && datos.id);
  var email = xestionEmail_(datos && datos.usuarioEmail);
  var modulo = xestionTexto_(datos && datos.modulo).toLowerCase();
  var contido = xestionTexto_(datos && datos.contido);
  var actor = xestionEmail_(datos && datos.actorEmail);
  var sh = asegurarXestionPermisos_().permisos;
  var valores = sh.getDataRange().getValues();
  var ix = xestionIndices_(valores[0]);
  for (var i=valores.length-1; i>=1; i--) {
    var coincide = id ? xestionTexto_(valores[i][ix.Id]) === id : (xestionEmail_(valores[i][ix.Email]) === email && xestionTexto_(valores[i][ix.Modulo]).toLowerCase() === modulo && xestionTexto_(valores[i][ix.Contido]) === contido);
    if (coincide) {
      sh.deleteRow(i+1);
      rexistrarActividadePortalXestion_({ actorEmail:actor, modulo:'permisos', accion:'eliminar_permiso', elemento:email+' · '+modulo, resultado:'permitido', detalle:'' });
      return { ok:true };
    }
  }
  return { ok:false, erro:'Non se atopou o permiso.' };
}

function rexistrarActividadePortalXestion_(datos) {
  var email = xestionEmail_(datos && (datos.actorEmail || datos.email));
  if (!email) return { ok:false, erro:'Non se indicou o usuario.' };
  var usuario = usuariosXestionPermisos_().find(function(u) { return u.email === email; });
  asegurarXestionPermisos_().actividade.appendRow([
    Utilities.getUuid(),new Date(),email,usuario ? (usuario.nome || usuario.persoa) : '',
    xestionTexto_(datos && datos.modulo),xestionTexto_(datos && datos.accion),xestionTexto_(datos && datos.elemento),
    xestionTexto_(datos && datos.resultado) || 'permitido',xestionTexto_(datos && datos.detalle)
  ]);
  return { ok:true };
}

function listarActividadePortalXestion_(datos) {
  var sh = asegurarXestionPermisos_().actividade;
  var valores = sh.getDataRange().getValues();
  if (valores.length < 2) return { ok:true, actividade:[] };
  var ix = xestionIndices_(valores[0]);
  var desde = xestionTexto_(datos && datos.desde), ata = xestionTexto_(datos && datos.ata);
  var filtroEmail = xestionEmail_(datos && datos.filtroEmail), filtroModulo = xestionTexto_(datos && datos.filtroModulo).toLowerCase();
  var inicio = desde ? new Date(desde+'T00:00:00') : null, fin = ata ? new Date(ata+'T23:59:59') : null;
  var limite = Math.min(Math.max(Number(datos && datos.limite) || 250,1),1000);
  var actividade = valores.slice(1).reduce(function(out,fila) {
    var data = fila[ix.DataHora] instanceof Date ? fila[ix.DataHora] : new Date(fila[ix.DataHora]);
    var email = xestionEmail_(fila[ix.Email]), modulo = xestionTexto_(fila[ix.Modulo]);
    if ((inicio && data<inicio) || (fin && data>fin) || (filtroEmail && email!==filtroEmail) || (filtroModulo && modulo.toLowerCase()!==filtroModulo)) return out;
    out.push({ id:xestionTexto_(fila[ix.Id]), dataHora:xestionIso_(data), email:email, persoa:xestionTexto_(fila[ix.Persoa]), modulo:modulo, accion:xestionTexto_(fila[ix.Accion]), elemento:xestionTexto_(fila[ix.Elemento]), resultado:xestionTexto_(fila[ix.Resultado]), detalle:xestionTexto_(fila[ix.Detalle]) });
    return out;
  },[]);
  actividade.sort(function(a,b){ return b.dataHora.localeCompare(a.dataHora); });
  return { ok:true, actividade:actividade.slice(0,limite) };
}
