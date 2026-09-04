/*
 * Producción · Administración → Persoas · envío de revisións por correo.
 *
 * Parche mínimo autocontido para a versión viva de Apps Script. O dispatcher
 * xa coñece `enviarRevisionsPersoasAdministracion`; este ficheiro define a
 * función que faltaba sen depender de helpers que só existen na fonte de
 * desenvolvemento.
 *
 * PERSOAS_ALLOW_EMAIL_SEND é un interruptor de emerxencia:
 * - ausente ou true: envío permitido no script real de Producción;
 * - false / 0 / no / off: envío bloqueado.
 */

var PERSOAS_EMAIL_PRODUCTION_SCRIPT_ID_ =
  '1LeJ91m62gdfm8i1XX9EvtxFMvvhhQhMCN_13iUWgvOHaq7q9LUo-nciV';

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
    var contexto = obterContextoPersoasAdmin_();
    var valores = contexto.persoas.getDataRange().getValues();
    var administrador = obterAdministradorPersoasAdmin_(contexto, emailAdmin, valores);
    if (!administrador) return { ok:false, erro:'Usuario non autorizado' };

    var envios = datos && Array.isArray(datos.envios) ? datos.envios : [];
    if (!envios.length) return { ok:false, erro:'Non se indicaron correos para enviar' };
    if (envios.length > 100) return { ok:false, erro:'Máximo 100 envíos por operación' };

    var cota = MailApp.getRemainingDailyQuota();
    if (cota < envios.length) {
      return {
        ok:false,
        erro:'Cota diaria de correo insuficiente. Dispoñibles: ' + cota + ' · necesarios: ' + envios.length
      };
    }

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
      envios.forEach(function(item) {
        var revisionId = persoasEmailTexto_(item && item.revisionId);
        var idPersoa = persoasEmailTexto_(item && item.idPersoa);
        var correo = persoasEmailPrimeiroCorreo_(item && item.correo);
        var nome = persoasEmailTexto_(item && item.nome) || idPersoa;
        var ligazon = persoasEmailTexto_(item && item.ligazon);
        var caducaEn = persoasEmailTexto_(item && item.caducaEn);
        var versionLegal = persoasEmailTexto_(item && item.versionLegal);

        if (!revisionId || !idPersoa || !correo || !ligazon) {
          erros++;
          detalle.push({ idPersoa:idPersoa, nome:nome, correo:correo, estado:'ERRO', motivo:'Datos de envío incompletos' });
          return;
        }

        if (!/^https:\/\/(?:www\.)?coralpolifonicapontevedra\.org\/revision-datos\/?\?token=[A-Za-z0-9_-]{30,160}(?:&.*)?$/i.test(ligazon)) {
          erros++;
          detalle.push({ idPersoa:idPersoa, nome:nome, correo:correo, estado:'ERRO', motivo:'Ligazón non pertencente a Produción' });
          return;
        }

        var indiceFila = persoasEmailAtoparIndiceFila_(valores, indices, idPersoa);
        if (indiceFila < 1) {
          erros++;
          detalle.push({ idPersoa:idPersoa, nome:nome, correo:correo, estado:'ERRO', motivo:'Persoa non atopada' });
          return;
        }

        var filaActual = valores[indiceFila];
        if (!persoasEmailBooleano_(filaActual[indices.Activo])) {
          omitidos++;
          detalle.push({ idPersoa:idPersoa, nome:nome, correo:correo, estado:'OMITIDO', motivo:'Persoa non activa' });
          return;
        }

        var correoActual = persoasEmailPrimeiroCorreo_(filaActual[indices['Correo electrónico']]);
        if (!correoActual || correoActual !== correo) {
          omitidos++;
          detalle.push({ idPersoa:idPersoa, nome:nome, correo:correo, estado:'OMITIDO', motivo:'O correo actual da ficha xa non coincide co da revisión' });
          return;
        }

        if (caducaEn && new Date(caducaEn).getTime() <= Date.now()) {
          omitidos++;
          detalle.push({ idPersoa:idPersoa, nome:nome, correo:correo, estado:'OMITIDO', motivo:'Ligazón caducada' });
          return;
        }

        var chaveEnvio = 'PERSOAS_EMAIL_SENT_' + revisionId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
        if (propiedades.getProperty(chaveEnvio)) {
          omitidos++;
          detalle.push({ idPersoa:idPersoa, nome:nome, correo:correo, estado:'OMITIDO', motivo:'Este enlace xa foi enviado anteriormente' });
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
          detalle.push({ idPersoa:idPersoa, nome:nome, correo:correo, estado:'ENVIADO' });

          persoasEmailRexistrar_({
            email:administrador.email,
            tipoEvento:'Enviar revisión de datos',
            modulo:'Administración · Persoas',
            resultado:'Correcto',
            detalle:'Persoa ' + idPersoa + ' · versión ' + versionLegal
          });
        } catch (erroEnvio) {
          erros++;
          detalle.push({
            idPersoa:idPersoa,
            nome:nome,
            correo:correo,
            estado:'ERRO',
            motivo:String(erroEnvio && erroEnvio.message ? erroEnvio.message : erroEnvio)
          });
          persoasEmailRexistrar_({
            email:administrador.email,
            tipoEvento:'Enviar revisión de datos',
            modulo:'Administración · Persoas',
            resultado:'Erro',
            detalle:'Persoa ' + idPersoa
          });
        }
      });
    } finally {
      try { bloqueo.releaseLock(); } catch (ignorado) {}
    }

    return {
      ok:true,
      ambiente:ambiente,
      enviados:enviados,
      omitidos:omitidos,
      erros:erros,
      detalle:detalle
    };
  } catch (erro) {
    console.error('Erro en enviarRevisionsPersoasAdministracion_:', erro && erro.stack ? erro.stack : erro);
    return { ok:false, erro:String(erro && erro.message ? erro.message : erro) };
  }
}
