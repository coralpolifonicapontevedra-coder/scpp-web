/*
 * Producción · Administración → Persoas · auditoría directa de envíos.
 *
 * Le directamente as marcas PERSOAS_EMAIL_SENT_* de Script Properties,
 * filtra por intervalo temporal e resolve o nome desde a folla Persoas nunha
 * única lectura. Non depende de R2 nin require recibir revisionIds desde o Worker.
 */

function persoasAuditoriaEnviosNomeMapa_() {
  var mapa = {};
  try {
    var contexto = obterContextoPersoasAdmin_();
    var valores = contexto.persoas.getDataRange().getValues();
    if (!valores.length) return mapa;
    var indices = persoasEmailIndices_(valores[0] || []);
    var idxId = indices.Id;
    var idxRowId = indices['Row ID'];
    var idxNomeCompleto = indices.Nomecompleto;
    var idxNome = indices.Nome;
    var idxAp1 = indices['Primeiro apelido'];
    var idxAp2 = indices['Segundo apelido'];

    function textoFila_(fila, idx) {
      return idx === undefined ? '' : persoasEmailTexto_(fila[idx]);
    }

    for (var i = 1; i < valores.length; i += 1) {
      var fila = valores[i] || [];
      var id = textoFila_(fila, idxId);
      var rowId = textoFila_(fila, idxRowId);
      var nome = textoFila_(fila, idxNomeCompleto);
      if (!nome) {
        nome = [textoFila_(fila, idxNome), textoFila_(fila, idxAp1), textoFila_(fila, idxAp2)]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      if (id) mapa[id] = nome || id;
      if (rowId) mapa[rowId] = nome || rowId;
    }
  } catch (erro) {
    console.warn('Auditoría Persoas: non se puido resolver o mapa de nomes: ' + String(erro));
  }
  return mapa;
}

function listarEnviosRevisionsPersoasAdministracion_(datos) {
  try {
    if (persoasEmailAmbiente_() !== 'production') {
      throw new Error('Consulta de auditoría bloqueada fóra do Apps Script de Producción');
    }

    var auth = persoasEmailAutorizar_(datos);
    if (!auth.ok) return auth;

    var desde = Date.parse(persoasEmailTexto_(datos && datos.desde));
    var ata = Date.parse(persoasEmailTexto_(datos && datos.ata));
    if (!Number.isFinite(desde) || !Number.isFinite(ata) || ata <= desde) {
      return { ok:false, erro:'Intervalo temporal non válido' };
    }
    if ((ata - desde) > 3 * 24 * 60 * 60 * 1000) {
      return { ok:false, erro:'A auditoría directa admite un máximo de tres días por consulta' };
    }

    var propiedades = PropertiesService.getScriptProperties();
    persoasEmailLimparRexistros_(propiedades);
    var todas = propiedades.getProperties();
    var nomes = persoasAuditoriaEnviosNomeMapa_();
    var envios = [];

    Object.keys(todas).forEach(function(chave) {
      if (chave.indexOf('PERSOAS_EMAIL_SENT_') !== 0) return;
      try {
        var meta = JSON.parse(todas[chave]);
        var enviadoEn = persoasEmailTexto_(meta && meta.enviadoEn);
        var momento = Date.parse(enviadoEn);
        if (!Number.isFinite(momento) || momento < desde || momento >= ata) return;
        var idPersoa = persoasEmailTexto_(meta && meta.idPersoa);
        var correo = persoasEmailTexto_(meta && meta.correo);
        envios.push({
          revisionId: chave.slice('PERSOAS_EMAIL_SENT_'.length),
          idPersoa: idPersoa,
          nome: nomes[idPersoa] || idPersoa || correo || 'Persoa sen identificar',
          correo: correo,
          enviadoEn: enviadoEn,
          versionLegal: persoasEmailTexto_(meta && meta.versionLegal)
        });
      } catch (erro) {
        console.warn('Auditoría Persoas: marca de envío non válida en ' + chave);
      }
    });

    envios.sort(function(a, b) {
      return Date.parse(a.enviadoEn) - Date.parse(b.enviadoEn);
    });

    var cota = MailApp.getRemainingDailyQuota();
    var metaCota = persoasEmailActualizarMetaCota_(propiedades, cota);

    return {
      ok:true,
      envios:envios,
      total:envios.length,
      cotaRestante:cota,
      cotaObservadaEn:metaCota.observadaEn,
      restablecementoEstimado:metaCota.restablecementoEstimado,
      estimacionRestablecemento:true
    };
  } catch (erro) {
    return { ok:false, erro:String(erro && erro.message ? erro.message : erro) };
  }
}
