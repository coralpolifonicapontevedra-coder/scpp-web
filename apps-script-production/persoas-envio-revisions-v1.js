/*
 * Producción · Administración → Persoas · envío de revisións por correo.
 *
 * PERSOAS_ALLOW_EMAIL_SEND é un interruptor de emerxencia:
 * - ausente ou true: envío permitido no script real de Producción;
 * - false / 0 / no / off: envío bloqueado.
 *
 * A autorización normal chega xa resolta polo Worker desde a matriz de permisos
 * R2. Apps Script conserva un fallback de autorización para chamadas antigas e
 * revalida sempre persoa, correo, estado, caducidade e duplicados antes de MailApp.
 */

var PERSOAS_EMAIL_PRODUCTION_SCRIPT_ID_ =
  '1LeJ91m62gdfm8i1XX9EvtxFMvvhhQhMCN_13iUWgvOHaq7q9LUo-nciV';
var PERSOAS_EMAIL_QUOTA_META_KEY_ = 'PERSOAS_EMAIL_QUOTA_META_V1';

function persoasEmailTexto_(valor) {
  return String(valor == null ? '' : valor).trim();
}

function persoasEmailAmbiente_() {
  try {
    return persoasEmailTexto_(ScriptApp.getScriptId()) ===
      PERSOAS_EMAIL_PRODUCTION_SCRIPT_ID_
      ? 'production'
      : 'blocked';
  } catch (erro) {
    return 'blocked';
  }
}

function persoasEmailIndices_(cabeceiras) {
  return (cabeceiras || []).reduce(function(saida, valor, indice) {
    saida[persoasEmailTexto_(valor)] = indice;
    return saida;
  }, {});
}

function persoasEmailRequire_(indices, cabeceira) {
  if (indices[cabeceira] === undefined) {
    throw new Error('Falta a columna ' + cabeceira + ' na folla Persoas');
  }
}

function persoasEmailAtoparIndiceFila_(valores, indices, referencia) {
  var ref = persoasEmailTexto_(referencia);
  for (var i = 1; i < valores.length; i += 1) {
    var id = indices.Id === undefined ? '' : persoasEmailTexto_(valores[i][indices.Id]);
    var rowId = indices['Row ID'] === undefined ? '' : persoasEmailTexto_(valores[i][indices['Row ID']]);
    if (ref && (ref === id || ref === rowId)) return i;
  }
  return -1;
}

function persoasEmailBooleano_(valor) {
  if (valor === true) return true;
  var texto = persoasEmailTexto_(valor).toLowerCase();
  return ['true', 'y', 'yes', 'si', 'sí', '1', 'x', 'verdadeiro'].indexOf(texto) >= 0;
}

function persoasEmailPrimeiroCorreo_(value) {
  var candidatos = String(value || '').split(/[;,\s]+/).map(function(v) {
    return String(v || '').trim().toLowerCase();
  }).filter(Boolean);
  for (var i = 0; i < candidatos.length; i++) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidatos[i])) return candidatos[i];
  }
  return '';
}

function persoasEmailEscaparHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function persoasEmailRexistrar_(datos) {
  try {
    if (typeof rexistrarAcceso === 'function') rexistrarAcceso(datos);
  } catch (erro) {
    console.warn('Non se puido rexistrar a actividade de envío de Persoas: ' + String(erro));
  }
}

function persoasEmailLimparRexistros_(propiedades) {
  var todas = propiedades.getProperties();
  var limite = Date.now() - (21 * 24 * 60 * 60 * 1000);
  Object.keys(todas).forEach(function(chave) {
    if (chave.indexOf('PERSOAS_EMAIL_SENT_') !== 0) return;
    try {
      var meta = JSON.parse(todas[chave]);
      var momento = Date.parse(meta && meta.enviadoEn ? meta.enviadoEn : '');
      if (!momento || momento < limite) propiedades.deleteProperty(chave);
    } catch (erro) {
      propiedades.deleteProperty(chave);
    }
  });
}

function persoasEmailActualizarMetaCota_(propiedades, cotaActual) {
  var agora = Date.now();
  var anterior = null;
  try {
    anterior = JSON.parse(propiedades.getProperty(PERSOAS_EMAIL_QUOTA_META_KEY_) || 'null');
  } catch (erro) {
    anterior = null;
  }

  var inicioObservado = Number(anterior && anterior.inicioObservado) || agora;
  var cotaAnterior = Number(anterior && anterior.cota);
  if (Number.isFinite(cotaAnterior) && Number(cotaActual) > cotaAnterior) {
    inicioObservado = agora;
  }

  var meta = {
    cota: Math.max(0, Number(cotaActual) || 0),
    observadaEn: new Date(agora).toISOString(),
    inicioObservado: inicioObservado,
    restablecementoEstimado: new Date(inicioObservado + 24 * 60 * 60 * 1000).toISOString(),
    estimacion: true
  };
  propiedades.setProperty(PERSOAS_EMAIL_QUOTA_META_KEY_, JSON.stringify(meta));
  return meta;
}

function persoasEmailAutorizar_(datos) {
  var emailAdmin = persoasEmailTexto_(datos && datos.email).toLowerCase();
  if (!emailAdmin) return { ok:false, erro:'Non se puido identificar a conta administradora' };
  if (datos && datos.autorizadoR2 === true) {
    return { ok:true, email:emailAdmin, administrador:{ email:emailAdmin, fonte:'R2-PERMISOS' } };
  }
  var contexto = obterContextoPersoasAdmin_();
  var valores = contexto.persoas.getDataRange().getValues();
  var administrador = obterAdministradorPersoasAdmin_(contexto, emailAdmin, valores);
  if (!administrador) return { ok:false, erro:'Usuario non autorizado' };
  return { ok:true, email:emailAdmin, administrador:administrador };
}

function estadoEnviosRevisionsPersoasAdministracion_(datos) {
  try {
    if (persoasEmailAmbiente_() !== 'production') {
      throw new Error('Consulta de envío bloqueada fóra do Apps Script de Producción');
    }
    var auth = persoasEmailAutorizar_(datos);
    if (!auth.ok) return auth;

    var propiedades = PropertiesService.getScriptProperties();
    persoasEmailLimparRexistros_(propiedades);
    var ids = datos && Array.isArray(datos.revisionIds) ? datos.revisionIds.slice(0, 250) : [];
    var enviados = [];
    ids.forEach(function(revisionId) {
      var id = persoasEmailTexto_(revisionId);
      if (!id) return;
      var chave = 'PERSOAS_EMAIL_SENT_' + id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
      var raw = propiedades.getProperty(chave);
      if (!raw) return;
      try {
        var meta = JSON.parse(raw);
        enviados.push({ revisionId:id, enviadoEn:persoasEmailTexto_(meta && meta.enviadoEn), correo:persoasEmailTexto_(meta && meta.correo) });
      } catch (erro) {
        enviados.push({ revisionId:id });
      }
    });

    var cota = MailApp.getRemainingDailyQuota();
    var metaCota = persoasEmailActualizarMetaCota_(propiedades, cota);
    return {
      ok:true,
      enviados:enviados,
      cotaRestante:cota,
      cotaObservadaEn:metaCota.observadaEn,
      restablecementoEstimado:metaCota.restablecementoEstimado,
      estimacionRestablecemento:true
    };
  } catch (erro) {
    return { ok:false, erro:String(erro && erro.message ? erro.message : erro) };
  }
}

function enviarRevisionsPersoasAdministracion_(datos) {
  try {
    var ambiente = persoasEmailAmbiente_();
    if (ambiente !== 'production') {
      throw new Error('Envío de correos bloqueado fóra do Apps Script de Producción');
    }

    var propiedades = PropertiesService.getScriptProperties();
    var interruptor = String(
      propiedades.getProperty('PERSOAS_ALLOW_EMAIL_SEND') || ''
    ).trim().toLowerCase();
    if (['false', '0', 'no', 'off'].indexOf(interruptor) >= 0) {
      throw new Error('O envío de correos de Persoas está desactivado en Produción');
    }

    var emailAdmin = persoasEmailTexto_(datos && datos.email).toLowerCase();
    if (!emailAdmin) return { ok:false, erro:'Non se puido identificar a conta administradora' };

    var contexto = obterContextoPersoasAdmin_();
    var valores = contexto.persoas.getDataRange().getValues();
    var autorizadoR2 = datos && datos.autorizadoR2 === true;
    var administrador = autorizadoR2
      ? { email: emailAdmin, fonte: 'R2-PERMISOS' }
      : obterAdministradorPersoasAdmin_(contexto, emailAdmin, valores);
    if (!administrador) return { ok:false, erro:'Usuario non autorizado' };

    var envios = datos && Array.isArray(datos.envios) ? datos.envios : [];
    if (!envios.length) return { ok:false, erro:'Non se indicaron correos para enviar' };
    if (envios.length > 100) return { ok:false, erro:'Máximo 100 envíos por operación' };

    var cotaAntes = MailApp.getRemainingDailyQuota();
    var metaCotaAntes = persoasEmailActualizarMetaCota_(propiedades, cotaAntes);
    if (cotaAntes <= 0) {
      return {
        ok:false,
        codigo:'COTA_ESGOTADA',
        erro:'Cota diaria de correo esgotada. Dispoñibles: 0 · necesarios: ' + envios.length,
        cotaRestante:0,
        restablecementoEstimado:metaCotaAntes.restablecementoEstimado
      };
    }

    var enviosProcesables = envios.slice(0, Math.min(cotaAntes, envios.length));
    var enviosAdiados = envios.slice(enviosProcesables.length);

    persoasEmailLimparRexistros_(propiedades);

    var indices = persoasEmailIndices_(valores[0] || []);
    persoasEmailRequire_(indices, 'Id');
    persoasEmailRequire_(indices, 'Activo');
    persoasEmailRequire_(indices, 'Correo electrónico');

    var bloqueo = LockService.getScriptLock();
    bloqueo.waitLock(15000);

    var enviados = 0;
    var omitidos = 0;
    var erros = 0;
    var detalle = [];

    try {
      enviosProcesables.forEach(function(item) {
        var revisionId = persoasEmailTexto_(item && item.revisionId);
        var idPersoa = persoasEmailTexto_(item && item.idPersoa);
        var correo = persoasEmailPrimeiroCorreo_(item && item.correo);
        var nome = persoasEmailTexto_(item && item.nome) || idPersoa;
        var ligazon = persoasEmailTexto_(item && item.ligazon);
        var caducaEn = persoasEmailTexto_(item && item.caducaEn);
        var versionLegal = persoasEmailTexto_(item && item.versionLegal);

        if (!revisionId || !idPersoa || !correo || !ligazon) {
          erros++;
          detalle.push({ revisionId:revisionId, idPersoa:idPersoa, nome:nome, correo:correo, estado:'ERRO', motivo:'Datos de envío incompletos' });
          return;
        }

        if (!/^https:\/\/(?:www\.)?coralpolifonicapontevedra\.org\/revision-datos\/?\?token=[A-Za-z0-9_-]{30,160}(?:&.*)?$/i.test(ligazon)) {
          erros++;
          detalle.push({ revisionId:revisionId, idPersoa:idPersoa, nome:nome, correo:correo, estado:'ERRO', motivo:'Ligazón non pertencente a Produción' });
          return;
        }

        var indiceFila = persoasEmailAtoparIndiceFila_(valores, indices, idPersoa);
        if (indiceFila < 1) {
          erros++;
          detalle.push({ revisionId:revisionId, idPersoa:idPersoa, nome:nome, correo:correo, estado:'ERRO', motivo:'Persoa non atopada' });
          return;
        }

        var filaActual = valores[indiceFila];
        if (!persoasEmailBooleano_(filaActual[indices.Activo])) {
          omitidos++;
          detalle.push({ revisionId:revisionId, idPersoa:idPersoa, nome:nome, correo:correo, estado:'OMITIDO', motivo:'Persoa non activa' });
          return;
        }

        var correoActual = persoasEmailPrimeiroCorreo_(filaActual[indices['Correo electrónico']]);
        if (!correoActual || correoActual !== correo) {
          omitidos++;
          detalle.push({ revisionId:revisionId, idPersoa:idPersoa, nome:nome, correo:correo, estado:'OMITIDO', motivo:'O correo actual da ficha xa non coincide co da revisión' });
          return;
        }

        if (caducaEn && new Date(caducaEn).getTime() <= Date.now()) {
          omitidos++;
          detalle.push({ revisionId:revisionId, idPersoa:idPersoa, nome:nome, correo:correo, estado:'OMITIDO', motivo:'Ligazón caducada' });
          return;
        }

        var chaveEnvio = 'PERSOAS_EMAIL_SENT_' + revisionId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
        if (propiedades.getProperty(chaveEnvio)) {
          omitidos++;
          detalle.push({ revisionId:revisionId, idPersoa:idPersoa, nome:nome, correo:correo, estado:'OMITIDO', motivo:'Este enlace xa foi enviado anteriormente' });
          return;
        }

        var asunto = 'Revisión dos teus datos persoais · Sociedade Coral Polifónica de Pontevedra';
        var nomeSeguro = persoasEmailEscaparHtml_(nome);
        var ligazonSegura = persoasEmailEscaparHtml_(ligazon);
        var caducidadeTexto = caducaEn
          ? Utilities.formatDate(new Date(caducaEn), 'Europe/Madrid', 'dd/MM/yyyy HH:mm')
          : '';
        var corpoTexto =
          'Ola ' + nome + ',\n\n' +
          'A Sociedade Coral Polifónica de Pontevedra solicita que revises os datos persoais que temos rexistrados e confirmes o texto legal aplicable.\n\n' +
          'Ligazón individual: ' + ligazon + '\n' +
          (caducidadeTexto ? 'Caduca: ' + caducidadeTexto + '\n' : '') +
          '\nA ligazón é persoal e non debe compartirse. Ao completar a revisión quedará rexistrada a aceptación e xerarase o correspondente documento PDF.\n\n' +
          'Sociedade Coral Polifónica de Pontevedra';
        var corpoHtml =
          '<p>Ola <strong>' + nomeSeguro + '</strong>,</p>' +
          '<p>A Sociedade Coral Polifónica de Pontevedra solicita que revises os datos persoais que temos rexistrados e confirmes o texto legal aplicable.</p>' +
          '<p><a href="' + ligazonSegura + '" style="display:inline-block;padding:10px 16px;background:#741827;color:#fff;text-decoration:none;font-weight:bold">Revisar os meus datos</a></p>' +
          (caducidadeTexto ? '<p><strong>Caducidade:</strong> ' + persoasEmailEscaparHtml_(caducidadeTexto) + '</p>' : '') +
          '<p>Esta ligazón é individual e non debe compartirse. Ao completar a revisión quedará rexistrada a aceptación e xerarase o correspondente documento PDF.</p>' +
          '<p>Sociedade Coral Polifónica de Pontevedra</p>';

        try {
          MailApp.sendEmail({
            to: correo,
            subject: asunto,
            body: corpoTexto,
            htmlBody: corpoHtml,
            name: 'Sociedade Coral Polifónica de Pontevedra',
            replyTo: 'coralpolifonicapontevedra@gmail.com'
          });

          propiedades.setProperty(chaveEnvio, JSON.stringify({
            enviadoEn:new Date().toISOString(),
            idPersoa:idPersoa,
            correo:correo,
            versionLegal:versionLegal
          }));
          enviados++;
          detalle.push({ revisionId:revisionId, idPersoa:idPersoa, nome:nome, correo:correo, estado:'ENVIADO' });
        } catch (erroEnvio) {
          erros++;
          detalle.push({
            revisionId:revisionId,
            idPersoa:idPersoa,
            nome:nome,
            correo:correo,
            estado:'ERRO',
            motivo:String(erroEnvio && erroEnvio.message ? erroEnvio.message : erroEnvio)
          });
        }
      });

      enviosAdiados.forEach(function(item) {
        detalle.push({
          revisionId:persoasEmailTexto_(item && item.revisionId),
          idPersoa:persoasEmailTexto_(item && item.idPersoa),
          nome:persoasEmailTexto_(item && item.nome),
          correo:persoasEmailPrimeiroCorreo_(item && item.correo),
          estado:'ADIADO_COTA',
          motivo:'Adiado automaticamente por falta de cota diaria; queda pendente para retomar.'
        });
      });
    } finally {
      try { bloqueo.releaseLock(); } catch (ignorado) {}
    }

    var cotaRestante = MailApp.getRemainingDailyQuota();
    var metaCota = persoasEmailActualizarMetaCota_(propiedades, cotaRestante);

    persoasEmailRexistrar_({
      email:emailAdmin,
      tipoEvento:'Enviar revisións de datos',
      modulo:'Administración · Persoas',
      resultado:erros > 0 ? 'Parcial' : 'Correcto',
      detalle:'Solicitados ' + envios.length + ' · enviados ' + enviados + ' · omitidos ' + omitidos + ' · adiados por cota ' + enviosAdiados.length + ' · erros ' + erros
    });

    return {
      ok:true,
      ambiente:ambiente,
      permisoFonte:administrador.fonte || (autorizadoR2 ? 'R2-PERMISOS' : 'APPS-SCRIPT'),
      solicitados:envios.length,
      procesados:enviosProcesables.length,
      enviados:enviados,
      omitidos:omitidos,
      adiadosPorCota:enviosAdiados.length,
      erros:erros,
      detalle:detalle,
      cotaAntes:cotaAntes,
      cotaRestante:cotaRestante,
      cotaObservadaEn:metaCota.observadaEn,
      restablecementoEstimado:metaCota.restablecementoEstimado,
      estimacionRestablecemento:true
    };
  } catch (erro) {
    console.error('Erro en enviarRevisionsPersoasAdministracion_:', erro && erro.stack ? erro.stack : erro);
    return { ok:false, erro:String(erro && erro.message ? erro.message : erro) };
  }
}
