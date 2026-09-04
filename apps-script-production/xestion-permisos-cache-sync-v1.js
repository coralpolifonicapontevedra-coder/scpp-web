/*
 * Sincronización da caché de permisos coa folla PermisosPortal.
 *
 * Principio: a Sheet segue sendo a fonte mestra, R2 é a capa operativa.
 * Unha edición manual na Sheet invalida R2 de inmediato, sen obrigar a
 * consultar a folla en cada lectura do Portal.
 */

var XESTION_PERMISOS_CACHE_SYNC_URL_ = 'https://coralpolifonicapontevedra.org/api/permisos-cache-sync';
var XESTION_PERMISOS_TRIGGER_EDIT_ = 'xestionPermisosOnEdit_';
var XESTION_PERMISOS_TRIGGER_CHANGE_ = 'xestionPermisosOnChange_';

function xestionPermisosNotificarCache_(payload) {
  try {
    var token = xestionTexto_(PropertiesService.getScriptProperties().getProperty('WEB_WRITE_TOKEN'));
    if (!token) return { ok:false, erro:'WEB_WRITE_TOKEN non configurado.' };

    var body = payload || {};
    body.token = token;
    body.fonte = xestionTexto_(body.fonte) || 'sheet-permisos';

    var response = UrlFetchApp.fetch(XESTION_PERMISOS_CACHE_SYNC_URL_, {
      method:'post',
      contentType:'application/json',
      payload:JSON.stringify(body),
      muteHttpExceptions:true,
      followRedirects:true
    });
    var code = response.getResponseCode();
    var text = response.getContentText();
    var result = null;
    try { result = text ? JSON.parse(text) : null; } catch (ignore) {}
    if (code < 200 || code >= 300 || !result || result.ok !== true) {
      return { ok:false, status:code, erro:xestionTexto_(result && result.erro) || ('HTTP ' + code) };
    }
    return { ok:true, status:code, resultado:result };
  } catch (erro) {
    return { ok:false, erro:xestionTexto_(erro && erro.message ? erro.message : erro) };
  }
}

function xestionPermisosInstalarTriggers_() {
  var spreadsheetId = xestionPropiedadeObrigatoria_('USUARIOS_WEB_SPREADSHEET_ID');
  var triggers = ScriptApp.getProjectTriggers();
  var tenEdit = false;
  var tenChange = false;

  triggers.forEach(function(trigger) {
    var handler = trigger.getHandlerFunction();
    var sourceId = '';
    try { sourceId = trigger.getTriggerSourceId(); } catch (ignore) {}
    if (sourceId && sourceId !== spreadsheetId) return;
    if (handler === XESTION_PERMISOS_TRIGGER_EDIT_) tenEdit = true;
    if (handler === XESTION_PERMISOS_TRIGGER_CHANGE_) tenChange = true;
  });

  if (!tenEdit) {
    ScriptApp.newTrigger(XESTION_PERMISOS_TRIGGER_EDIT_)
      .forSpreadsheet(spreadsheetId)
      .onEdit()
      .create();
  }
  if (!tenChange) {
    ScriptApp.newTrigger(XESTION_PERMISOS_TRIGGER_CHANGE_)
      .forSpreadsheet(spreadsheetId)
      .onChange()
      .create();
  }

  return { ok:true, editCreado:!tenEdit, changeCreado:!tenChange };
}

function xestionPermisosOnEdit_(e) {
  try {
    var range = e && e.range;
    if (!range) return;
    var sheet = range.getSheet();
    var nome = sheet.getName();

    if (nome === XESTION_PERMISOS_CONFIG_.sheetUsuarios) {
      xestionPermisosNotificarCache_({ accion:'invalidarListado', fonte:'sheet-usuarios-onEdit' });
      return;
    }

    if (nome !== XESTION_PERMISOS_CONFIG_.sheetPermisos || range.getRow() <= 1) return;

    var lastColumn = Math.max(sheet.getLastColumn(), 1);
    var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    var ix = xestionIndices_(headers);
    if (ix.Email === undefined || ix.Modulo === undefined) {
      xestionPermisosNotificarCache_({ accion:'invalidarTodo', fonte:'sheet-permisos-cabeceiras-invalidas' });
      return;
    }

    var firstCol = range.getColumn();
    var lastEditedCol = firstCol + range.getNumColumns() - 1;
    var emailCol = ix.Email + 1;
    var moduloCol = ix.Modulo + 1;
    var cambiaClave = (emailCol >= firstCol && emailCol <= lastEditedCol) ||
      (moduloCol >= firstCol && moduloCol <= lastEditedCol) ||
      range.getNumRows() > 1;

    if (cambiaClave) {
      xestionPermisosNotificarCache_({ accion:'invalidarTodo', fonte:'sheet-permisos-chave-onEdit' });
      return;
    }

    var fila = sheet.getRange(range.getRow(), 1, 1, lastColumn).getValues()[0];
    var email = xestionEmail_(fila[ix.Email]);
    var modulo = xestionTexto_(fila[ix.Modulo]).toLowerCase();
    if (!email || !modulo) {
      xestionPermisosNotificarCache_({ accion:'invalidarTodo', fonte:'sheet-permisos-fila-incompleta' });
      return;
    }

    xestionPermisosNotificarCache_({
      accion:'invalidar',
      email:email,
      modulos:[modulo],
      fonte:'sheet-permisos-onEdit'
    });
  } catch (erro) {
    console.warn('Permisos: erro ao invalidar R2 tras onEdit: ' + xestionTexto_(erro && erro.message ? erro.message : erro));
  }
}

function xestionPermisosOnChange_(e) {
  try {
    var tipo = xestionTexto_(e && e.changeType).toUpperCase();
    if (!tipo) return;

    if (['INSERT_ROW','REMOVE_ROW','INSERT_COLUMN','REMOVE_COLUMN','OTHER'].indexOf(tipo) >= 0) {
      xestionPermisosNotificarCache_({ accion:'invalidarTodo', fonte:'sheet-permisos-onChange-' + tipo });
      return;
    }

    xestionPermisosNotificarCache_({ accion:'invalidarListado', fonte:'sheet-permisos-onChange-' + tipo });
  } catch (erro) {
    console.warn('Permisos: erro ao invalidar R2 tras onChange: ' + xestionTexto_(erro && erro.message ? erro.message : erro));
  }
}
