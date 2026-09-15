/**
 * Configuración común e segura para os ambientes de proba e produción.
 *
 * Os identificadores, correos e segredos viven exclusivamente nas
 * Propiedades do script. Nunca deben quedar escritos no código fonte.
 */
const SCPP_CONFIG_REQUIRED_PROPERTIES_ = [
  'SCPP_ENVIRONMENT',
  'SCPP_ALLOW_WRITES',
  'WEB_WRITE_TOKEN',
  'WEB_TEST_EMAIL',
  'USUARIOS_WEB_SPREADSHEET_ID',
  'PERSOAS_SPREADSHEET_ID',
  'REPERTORIO_SPREADSHEET_ID',
  'AUDIOS_REPERTORIO_SPREADSHEET_ID',
  'PARTITURAS_SPREADSHEET_ID',
  'CONCERTOS_REPERTORIO_SPREADSHEET_ID',
  'CONCERTOS_SPREADSHEET_ID',
  'ASISTENCIAS_CONCERTOS_SPREADSHEET_ID',
  'OBRAS_FILES_FOLDER_ID',
  'PARTITURAS_FILES_FOLDER_ID',
  'AUDIOS_REPERTORIO_FILES_FOLDER_ID',
  'REXISTRO_ACCESOS_SPREADSHEET_ID',
  'ACEPTACION_SPREADSHEET_ID',
  'CONCERTOS_FILES_FOLDER_ID',
  'CONCERTOS_IMAGES_FOLDER_ID',
  'DOCUMENTACION_SPREADSHEET_ID',
  'DOCUMENTACION_FOLDER_ID',
  'ACTAS_FOLDER_ID',
  'ENSAIOS_SPREADSHEET_ID',
  'ASISTENCIAS_ENSAIOS_SPREADSHEET_ID',
  'ENSAIOS_REPERTORIO_SPREADSHEET_ID',
  'FOTOS_SPREADSHEET_ID',
  'FOTOS_FOLDER_ID',
  'FOTOS_NOTIFY_EMAIL',
  'PERFIL_FOTOS_FOLDER_ID',
  'PUBLICACIONS_SPREADSHEET_ID',
  'SOLICITUDES_SPREADSHEET_ID',
  'SOLICITUDES_NOTIFY_EMAIL'
];

function obterPropiedadeObrigatoria_(nome) {
  const valor = String(
    PropertiesService.getScriptProperties().getProperty(nome) || ''
  ).trim();

  if (!valor) {
    throw new Error(
      'Falta a propiedade obrigatoria do ambiente: ' + nome
    );
  }

  return valor;
}

function obterAmbienteSCPP_() {
  const ambiente = obterPropiedadeObrigatoria_(
    'SCPP_ENVIRONMENT'
  ).toLowerCase();

  if (['test', 'production'].indexOf(ambiente) === -1) {
    throw new Error(
      'SCPP_ENVIRONMENT debe ser test ou production'
    );
  }

  return ambiente;
}

function validarAccionPermitidaEntorno_(accion) {
  const ambiente = obterAmbienteSCPP_();
  const escribe = /^(rexistrar|actualizar|subir|gardar|eliminar|publicar|crear|borrar|editar|sincronizar)/i.test(
    String(accion || '').trim()
  );

  if (!escribe) return;

  const permiteEscritura = String(
    PropertiesService.getScriptProperties().getProperty(
      'SCPP_ALLOW_WRITES'
    ) || ''
  ).toLowerCase() === 'true';

  if (!permiteEscritura) {
    throw new Error(
      'Escritura desactivada no ambiente ' + ambiente
    );
  }
}

function validarConfiguracionEntorno() {
  const propiedades =
    PropertiesService.getScriptProperties();

  const faltan = SCPP_CONFIG_REQUIRED_PROPERTIES_.filter(
    function(nome) {
      return !String(
        propiedades.getProperty(nome) || ''
      ).trim();
    }
  );

  if (faltan.length) {
    throw new Error(
      'Faltan propiedades do ambiente: ' + faltan.join(', ')
    );
  }

  const ambiente = obterAmbienteSCPP_();

  console.log(JSON.stringify({
    ok: true,
    ambiente: ambiente,
    escrituras: String(
      propiedades.getProperty('SCPP_ALLOW_WRITES')
    ).toLowerCase() === 'true',
    propiedadesConfiguradas:
      SCPP_CONFIG_REQUIRED_PROPERTIES_.length
  }));

  return {
    ok: true,
    ambiente: ambiente
  };
}
