var SCPP_CORPORATE_SPREADSHEETS_ = {
  USUARIOS_WEB_SPREADSHEET_ID: '1anry8OEiJ5EuZ-LZtz0QM_13uHj3wn2KXnamXs7f8KI',
  PERSOAS_SPREADSHEET_ID: '1XWgPYg4z410225Qu17REOiXQlb14Wit7GwoWCjlo9rQ',
  REPERTORIO_SPREADSHEET_ID: '1xMsQhlY-M_K7h65T0de0ENySv1SxNrmPLjLoMGEIM2Y',
  AUDIOS_REPERTORIO_SPREADSHEET_ID: '108IkK_MPNqwMtkP7Qz4pqbzkTY6JBwYkI_9Npt1ik1U',
  PARTITURAS_SPREADSHEET_ID: '1r15Q9RJ-TH6NLFCIAiEI6qUeU5Ax82BF__bur0LoGHc',
  CONCERTOS_REPERTORIO_SPREADSHEET_ID: '12XfmhPTQCgOdIXN5Qg76Ej_cwgfh0LelNq9lhuLdDtg',
  CONCERTOS_SPREADSHEET_ID: '16v71m2HVzygUpOqn-Zws59d2jmaSqzcbq866pLZeQyA',
  ASISTENCIAS_CONCERTOS_SPREADSHEET_ID: '199NFDBqbDT_9PXcB4roZK9dvyTWmnTsQXS8ZJMlE-qY',
  REXISTRO_ACCESOS_SPREADSHEET_ID: '16sAHStRwNzNAROV7X0pXYu-GBHwzZoGEnzSFCz9nbCY',
  ACEPTACION_SPREADSHEET_ID: '1tFlpbljN_eYKWm1QON8hwPZU1v4rB3C3ebafe8lIiXs',
  ENSAIOS_SPREADSHEET_ID: '1C7EJINpYuhjOsn9ZtUM6HAUBww47BeY4sD_gszNjbug',
  ASISTENCIAS_ENSAIOS_SPREADSHEET_ID: '1SML9gTtVKzACxY4G8evp7wlfO7fZ8ut2fMOkKxvRxqI',
  ENSAIOS_REPERTORIO_SPREADSHEET_ID: '1qp3oKzWColruFIHLSHTaeLCNFk3ebQQ8zGu5wa11eUg',
  FOTOS_SPREADSHEET_ID: '1KuSQDBk1-7WfDtO7nxKGQGTVggpwdI3kRzPSuKlMQrg',
  PUBLICACIONS_SPREADSHEET_ID: '1M5tafOg_b3L-TiBH8UnA1rMwEiXmjiCBqvGRV3Bk2Uo',
  SOLICITUDES_SPREADSHEET_ID: '1GxQkT4Av2cfWp2UetfMVCvYI0_9PYUnxYLkschwH6wo'
};

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
  var esperado = SCPP_CORPORATE_SPREADSHEETS_[nome];
  if (esperado && valor !== esperado) {
    throw new Error('A propiedade ' + nome + ' non apunta á Sheet corporativa autorizada.');
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
