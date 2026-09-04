/*
 * Persoas V2 · sincronización de TextosLegais → R2.
 *
 * TextosLegais vive nun spreadsheet distinto de Persoas, polo que o trigger
 * histórico de Persoas non detecta os seus cambios. Este ficheiro instala un
 * segundo trigger ON_EDIT sobre o libro de Aceptación/TextosLegais e reutiliza
 * a mesma versión + endpoint de sincronización de Persoas.
 *
 * Como as edicións legais son pouco frecuentes, calquera edición de datos na
 * folla TextosLegais provoca unha única rexeneración Sheet → R2. Evitamos así
 * depender de TTLs ou de consultas a Sheets durante Xerar revisión.
 */

var PERSOAS_V2_TEXTOS_LEGAIS_TRIGGER_ = 'persoasV2TextosLegaisOnEdit_';

function persoasV2InstalarTriggerTextosLegais_() {
  try {
    var handler = PERSOAS_V2_TEXTOS_LEGAIS_TRIGGER_;
    var spreadsheetId = PERSOAS_V2_CONFIG_.aceptacionSpreadsheetId;
    var triggers = ScriptApp.getProjectTriggers();
    var found = triggers.some(function(trigger) {
      if (trigger.getHandlerFunction() !== handler) return false;
      if (trigger.getEventType() !== ScriptApp.EventType.ON_EDIT) return false;
      try {
        return trigger.getTriggerSourceId() === spreadsheetId;
      } catch (erroSource) {
        return true;
      }
    });

    if (!found) {
      ScriptApp.newTrigger(handler)
        .forSpreadsheet(spreadsheetId)
        .onEdit()
        .create();
    }

    return {
      ok:true,
      instalado:true,
      creado:!found,
      handler:handler,
      spreadsheetId:spreadsheetId
    };
  } catch (erro) {
    console.warn(
      'Persoas V2: non se puido instalar o trigger de TextosLegais: ' +
      String(erro && erro.message ? erro.message : erro)
    );
    return {
      ok:false,
      erro:'Non se puido instalar a sincronización automática de TextosLegais.',
      detalle:String(erro && erro.message ? erro.message : erro)
    };
  }
}

function persoasV2SincronizarR2PorEdicion_(fonte) {
  var version = persoasV2MarcarVersion_();
  var props = PropertiesService.getScriptProperties();
  var token = persoasV2Texto_(props.getProperty('WEB_WRITE_TOKEN'));

  if (!token) {
    console.warn(
      'Persoas V2: WEB_WRITE_TOKEN non está configurado; R2 actualizarase na seguinte lectura.'
    );
    return { ok:false, version:version, erro:'WEB_WRITE_TOKEN non configurado.' };
  }

  var response = UrlFetchApp.fetch(PERSOAS_V2_CONFIG_.syncUrl, {
    method:'post',
    contentType:'application/json',
    payload:JSON.stringify({
      token:token,
      version:version,
      fonte:persoasV2Texto_(fonte || 'sheet-onEdit')
    }),
    muteHttpExceptions:true,
    followRedirects:true
  });

  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    console.warn('Persoas V2: sincronización R2 respondeu ' + code + ' desde ' + fonte);
    return { ok:false, version:version, status:code };
  }

  return { ok:true, version:version, status:code };
}

function persoasV2TextosLegaisOnEdit_(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    if (!sheet) return;

    if (
      sheet.getParent().getId() !== PERSOAS_V2_CONFIG_.aceptacionSpreadsheetId ||
      sheet.getSheetId() !== PERSOAS_V2_CONFIG_.textosLegaisSheetId
    ) return;

    if (e.range.getLastRow() < 2) return;

    /*
     * Non filtramos por Id legal. TextosLegais ten poucas edicións e desta
     * maneira tamén detectamos altas, baixas, cambios de Id, versión, vixencia
     * ou estado Activo sen depender do valor anterior da cela.
     */
    persoasV2SincronizarR2PorEdicion_('textos-legais-onEdit');
  } catch (erro) {
    console.error(
      'persoasV2TextosLegaisOnEdit_:',
      erro && erro.stack ? erro.stack : erro
    );
  }
}
