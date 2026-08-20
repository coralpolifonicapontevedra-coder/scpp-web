/**
 * Configuración común para Preview e Produción.
 *
 * A lóxica é idéntica nos dous ambientes. Os identificadores, destinos e
 * segredos viven exclusivamente nas Script Properties de cada proxecto.
 */
var SCPP_CONFIG_REQUIRED_PROPERTIES_ = [
  'SCPP_ENVIRONMENT',
  'SCPP_ALLOW_WRITES',
  'WEB_WRITE_TOKEN',
  'USUARIOS_WEB_SPREADSHEET_ID',
  'USUARIOS_WEB_SHEET_ID',
  'PERSOAS_SPREADSHEET_ID',
  'PERSOAS_SHEET_ID',
  'REPERTORIO_SPREADSHEET_ID',
  'AUDIOS_REPERTORIO_SPREADSHEET_ID',
  'PARTITURAS_SPREADSHEET_ID',
  'CONCERTOS_REPERTORIO_SPREADSHEET_ID',
  'CONCERTOS_SPREADSHEET_ID',
  'CONCERTOS_SHEET_ID',
  'ASISTENCIAS_CONCERTOS_SPREADSHEET_ID',
  'OBRAS_FILES_FOLDER_ID',
  'PARTITURAS_FILES_FOLDER_ID',
  'AUDIOS_REPERTORIO_FILES_FOLDER_ID',
  'REXISTRO_ACCESOS_SPREADSHEET_ID',
  'REXISTRO_ACCESOS_SHEET_ID',
  'ACEPTACION_SPREADSHEET_ID',
  'ACEPTACION_SHEET_ID',
  'TEXTOS_LEGAIS_SHEET_ID',
  'CONCERTOS_FILES_FOLDER_ID',
  'CONCERTOS_IMAGES_FOLDER_ID',
  'DOCUMENTACION_SPREADSHEET_ID',
  'DOCUMENTACION_FOLDER_ID',
  'ACTAS_FOLDER_ID',
  'ENSAIOS_SPREADSHEET_ID',
  'ASISTENCIAS_ENSAIOS_SPREADSHEET_ID',
  'ENSAIOS_REPERTORIO_SPREADSHEET_ID',
  'FOTOS_SPREADSHEET_ID',
  'FOTOS_SHEET_ID',
  'FOTOS_FOLDER_ID',
  'PERFIL_FOTOS_FOLDER_ID',
  'PUBLICACIONS_SPREADSHEET_ID',
  'SOLICITUDES_SPREADSHEET_ID',
  'SOLICITUDES_SHEET_ID'
];

function obterPropiedadeObrigatoria_(nome) {
  var valor = String(
    PropertiesService.getScriptProperties().getProperty(nome) || ''
  ).trim();
  if (!valor) {
    throw new Error('Falta a propiedade obrigatoria do ambiente: ' + nome);
  }
  return valor;
}

function obterPropiedadeOpcional_(nome, valorPorDefecto) {
  var valor = String(
    PropertiesService.getScriptProperties().getProperty(nome) || ''
  ).trim();
  return valor || String(valorPorDefecto == null ? '' : valorPorDefecto);
}

function obterAmbienteSCPP_() {
  var ambiente = obterPropiedadeObrigatoria_('SCPP_ENVIRONMENT').toLowerCase();
  if (ambiente === 'test') ambiente = 'preview';
  if (['preview', 'production'].indexOf(ambiente) === -1) {
    throw new Error('SCPP_ENVIRONMENT debe ser preview ou production');
  }
  return ambiente;
}

function validarAccionPermitidaEntorno_(accion) {
  var ambiente = obterAmbienteSCPP_();
  var escribe = /^(rexistrar|actualizar|subir|gardar|eliminar|publicar|crear|borrar|editar|sincronizar)/i.test(
    String(accion || '').trim()
  );
  if (!escribe) return;
  var permiteEscritura = String(
    PropertiesService.getScriptProperties().getProperty('SCPP_ALLOW_WRITES') || ''
  ).toLowerCase() === 'true';
  if (!permiteEscritura) {
    throw new Error('Escritura desactivada no ambiente ' + ambiente);
  }
}

function validarConfiguracionEntorno() {
  var propiedades = PropertiesService.getScriptProperties();
  var faltan = SCPP_CONFIG_REQUIRED_PROPERTIES_.filter(function(nome) {
    return !String(propiedades.getProperty(nome) || '').trim();
  });
  if (faltan.length) {
    throw new Error('Faltan propiedades do ambiente: ' + faltan.join(', '));
  }
  return {
    ok: true,
    ambiente: obterAmbienteSCPP_(),
    escrituras: String(propiedades.getProperty('SCPP_ALLOW_WRITES') || '').toLowerCase() === 'true',
    propiedadesConfiguradas: SCPP_CONFIG_REQUIRED_PROPERTIES_.length
  };
}
