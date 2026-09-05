/*
 * Administración de Ensaios v4.
 *
 * Finalización completa nunha única chamada Apps Script.
 * Reconciliamos o estado recibido coas Sheets sen tocar outros ensaios.
 */

function reconciliarEnsaioAdministracionV4_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoEnsaiosPortal_(email);

  if (!permiso.escritura) {
    return { ok: false, codigo: 'FORBIDDEN', erro: 'Usuario non autorizado para xestionar ensaios' };
  }

  var idEnsaio = textoEnsaiosPortal_(datos && datos.idEnsaio);
  if (!idEnsaio) {
    return { ok: false, codigo: 'VALIDATION', erro: 'Falta identificar o ensaio' };
  }

  var obras = Array.isArray(datos && datos.obras) ? datos.obras : [];
  var asistencias = Array.isArray(datos && datos.asistencias) ? datos.asistencias : [];

  if (obras.length > 200 || asistencias.length > 200) {
    return { ok: false, codigo: 'VALIDATION', erro: 'O número de rexistros supera o límite permitido' };
  }

  var cfg = configuracionEnsaiosPortal_();
  var ensaios = filasEnsaiosPortal_(cfg.ensaiosId, 'Ensaios');
  var existe = ensaios.rows.some(function(row) {
    return textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Id_Ensaio', 'IdEnsaio', 'Id'])) === idEnsaio;
  });

  if (!existe) {
    return { ok: false, codigo: 'NOT_FOUND', erro: 'Non se atopou o ensaio' };
  }

  function valorBooleano_(valor) {
    return valor === true || ['true', '1', 'si', 'sí', 'yes', 'x'].indexOf(String(valor || '').trim().toLowerCase()) >= 0;
  }

  function filaComoArray_(row, headers) {
    return headers.map(function(header) {
      return Object.prototype.hasOwnProperty.call(row, header) ? row[header] : '';
    });
  }

  function asignar_(array, headers, nomes, valor) {
    var idx = indiceHeaderEnsaiosPortal_(headers, nomes);
    if (idx >= 0) array[idx] = valor;
  }

  function reconciliarRelacionadas_(spreadsheetId, nomeFolla, claveNomes, desexados, prepararFila) {
    var datosFolla = filasEnsaiosPortal_(spreadsheetId, nomeFolla);
    var headers = datosFolla.headers;
    var sheet = datosFolla.sheet;

    var existentes = datosFolla.rows.filter(function(row) {
      return textoEnsaiosPortal_(campoEnsaiosPortal_(row, ['Ensaio', 'Id_Ensaio', 'IdEnsaio'])) === idEnsaio;
    });

    var porClave = {};
    existentes.forEach(function(row) {
      var clave = textoEnsaiosPortal_(campoEnsaiosPortal_(row, claveNomes));
      if (clave && !porClave[clave]) porClave[clave] = row;
    });

    var desexadosPorClave = {};
    desexados.forEach(function(item) {
      var clave = textoEnsaiosPortal_(item && item.clave);
      if (!clave) return;
      desexadosPorClave[clave] = item;
    });

    var actualizados = 0;
    var engadidos = 0;
    var eliminados = 0;
    var filasNovas = [];

    Object.keys(desexadosPorClave).forEach(function(clave) {
      var item = desexadosPorClave[clave];
      var existente = porClave[clave];
      if (existente) {
        var fila = filaComoArray_(existente, headers);
        prepararFila(fila, headers, item, false);
        sheet.getRange(existente.__row, 1, 1, headers.length).setValues([fila]);
        actualizados++;
      } else {
        var nova = new Array(headers.length).fill('');
        prepararFila(nova, headers, item, true);
        filasNovas.push(nova);
        engadidos++;
      }
    });

    var borrar = existentes
      .filter(function(row) {
        var clave = textoEnsaiosPortal_(campoEnsaiosPortal_(row, claveNomes));
        return !clave || !Object.prototype.hasOwnProperty.call(desexadosPorClave, clave);
      })
      .map(function(row) { return row.__row; })
      .sort(function(a, b) { return b - a; });

    borrar.forEach(function(numeroFila) {
      sheet.deleteRow(numeroFila);
      eliminados++;
    });

    if (filasNovas.length) {
      var primeira = sheet.getLastRow() + 1;
      sheet.getRange(primeira, 1, filasNovas.length, headers.length).setValues(filasNovas);
    }

    return { actualizados: actualizados, engadidos: engadidos, eliminados: eliminados };
  }

  var agora = new Date();

  var obrasNormalizadas = obras
    .map(function(row, index) {
      return {
        clave: textoEnsaiosPortal_(row && (row.repertorio || row.idRepertorio || row.id)),
        orde: Number(row && row.orde) || (index + 1),
        tipoTraballo: textoEnsaiosPortal_(row && row.tipoTraballo),
        desde: textoEnsaiosPortal_(row && row.desde),
        ata: textoEnsaiosPortal_(row && row.ata),
        observacions: textoEnsaiosPortal_(row && row.observacions)
      };
    })
    .filter(function(row) { return !!row.clave; });

  var asistenciasNormalizadas = asistencias
    .map(function(row) {
      return {
        clave: textoEnsaiosPortal_(row && (row.persoa || row.idPersoa || row.id)),
        estadoAsistencia: textoEnsaiosPortal_(row && row.estadoAsistencia),
        xustificada: valorBooleano_(row && row.xustificada),
        motivo: textoEnsaiosPortal_(row && row.motivo),
        observacions: textoEnsaiosPortal_(row && row.observacions)
      };
    })
    .filter(function(row) { return !!row.clave && !!row.estadoAsistencia; });

  var resumoObras = reconciliarRelacionadas_(
    cfg.ensaiosRepertorioId,
    'EnsaiosRepertorio',
    ['Repertorio', 'Id_Repertorio', 'IdRepertorio'],
    obrasNormalizadas,
    function(fila, headers, item, nova) {
      if (nova) asignar_(fila, headers, ['Id_EnsaioRepertorio', 'Id'], Utilities.getUuid());
      asignar_(fila, headers, ['Ensaio'], idEnsaio);
      asignar_(fila, headers, ['Repertorio'], item.clave);
      asignar_(fila, headers, ['Orde'], item.orde);
      asignar_(fila, headers, ['TipoTraballo'], item.tipoTraballo);
      asignar_(fila, headers, ['Desde'], item.desde);
      asignar_(fila, headers, ['Ata'], item.ata);
      asignar_(fila, headers, ['Observacions'], item.observacions);
      asignar_(fila, headers, ['RexistradoPor'], email);
      asignar_(fila, headers, ['DataRexistro'], agora);
    }
  );

  var resumoAsistencias = reconciliarRelacionadas_(
    cfg.asistenciasId,
    'AsistenciasEnsaios',
    ['Persoa', 'Id_Persoa', 'IdPersoa'],
    asistenciasNormalizadas,
    function(fila, headers, item, nova) {
      if (nova) asignar_(fila, headers, ['Id_AsistenciaEnsaio', 'Id'], Utilities.getUuid());
      asignar_(fila, headers, ['Ensaio'], idEnsaio);
      asignar_(fila, headers, ['Persoa'], item.clave);
      asignar_(fila, headers, ['EstadoAsistencia'], item.estadoAsistencia);
      asignar_(fila, headers, ['Xustificada'], item.xustificada);
      asignar_(fila, headers, ['Motivo'], item.motivo);
      asignar_(fila, headers, ['Observacions'], item.observacions);
      asignar_(fila, headers, ['RexistradaPor'], email);
      asignar_(fila, headers, ['DataRexistro'], agora);
    }
  );

  SpreadsheetApp.flush();

  return {
    ok: true,
    resultado: {
      idEnsaio: idEnsaio,
      obras: resumoObras,
      asistencias: resumoAsistencias,
      obrasConfirmadas: obrasNormalizadas.length,
      asistenciasConfirmadas: asistenciasNormalizadas.length,
      finalizadoPor: email
    }
  };
}
