/*
 * Producción · Administración → Persoas · envío de revisións por correo.
 *
 * Ficheiro autocontido para poder engadilo como parche mínimo sobre a versión
 * viva de Apps Script. O dispatcher xa coñece a acción
 * `enviarRevisionsPersoasAdministracion`; aquí defínese a función que faltaba.
 *
 * PERSOAS_ALLOW_EMAIL_SEND actúa como interruptor de emerxencia:
 * - ausente ou true: envío permitido en production;
 * - false / 0 / no / off: envío bloqueado.
 */

var PERSOAS_EMAIL_PRODUCTION_SCRIPT_ID_ =
  '1LeJ91m62gdfm8i1XX9EvtxFMvvhhQhMCN_13iUWgvOHaq7q9LUo-nciV';

function persoasEmailAmbiente_() {
  try {
    return String(ScriptApp.getScriptId() || '').trim() ===
      PERSOAS_EMAIL_PRODUCTION_SCRIPT_ID_
      ? 'production'
      : 'blocked';
  } catch (erro) {
    return 'blocked';
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

    var emailAdmin = normalizarEmailPersoasAdmin_(datos && datos.email);
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

    var indices = indicesPersoasAdmin_(valores[0] || []);
    requireHeaderPersoasAdmin_(indices, 'Id', 'Persoas');
    var bloqueo = LockService.getScriptLock();
    bloqueo.waitLock(15000);

    var enviados = 0;
    var omitidos = 0;
    var erros = 0;
    var detalle = [];

    try {
      envios.forEach(function(item) {
        var revisionId = textoPersoasAdmin_(item && item.revisionId);
        var idPersoa = textoPersoasAdmin_(item && item.idPersoa);
        var correo = persoasEmailPrimeiroCorreo_(item && item.correo);
        var nome = textoPersoasAdmin_(item && item.nome) || idPersoa;
        var ligazon = textoPersoasAdmin_(item && item.ligazon);
        var caducaEn = textoPersoasAdmin_(item && item.caducaEn);
        var versionLegal = textoPersoasAdmin_(item && item.versionLegal);

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

        var indiceFila = atoparIndiceFilaPersoaAdmin_(valores, indices, idPersoa);
        if (indiceFila < 1) {
          erros++;
          detalle.push({ idPersoa:idPersoa, nome:nome, correo:correo, estado:'ERRO', motivo:'Persoa non atopada' });
          return;
        }

        var persoaActual = construirPersoaAdmin_(valores[indiceFila], indices);
        if (persoaActual.activo !== true) {
          omitidos++;
          detalle.push({ idPersoa:idPersoa, nome:nome, correo:correo, estado:'OMITIDO', motivo:'Persoa non activa' });
          return;
        }

        var correoActual = persoasEmailPrimeiroCorreo_(persoaActual.correo);
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

          rexistrarAcceso({
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
          rexistrarAcceso({
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
