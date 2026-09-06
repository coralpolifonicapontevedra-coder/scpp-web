/*
 * Administración e rexistro TPV de doazóns en Colaboracións.
 *
 * O fluxo público TPV crea primeiro unha fila Pendente mediante unha chamada
 * servidor-servidor protexida co WEB_WRITE_TOKEN. A confirmación bancaria
 * actualiza esa mesma fila por NumOperacionTPV.
 */

var DOAZONS_ADMIN_SPREADSHEET_ID_ =
  '1mqlMESC6ZkE4t1zfA0q1dK3PRFHtKLO71ifdbT2CtHw';

var DOAZONS_ADMIN_SHEET_ =
  'Colaboracións';

var DOAZONS_ADMIN_ESTADOS_ = [
  'Pendente',
  'Pagado',
  'Fallido',
  'Anulado'
];

function doazonsTexto_(valor) {
  return String(valor == null ? '' : valor).trim();
}

function doazonsIndices_(cabeceiras) {
  var resultado = {};
  cabeceiras.forEach(function(valor, indice) {
    resultado[doazonsTexto_(valor)] = indice;
  });
  return resultado;
}

function doazonsIso_(valor) {
  var data = valor instanceof Date ? valor : new Date(valor);
  if (isNaN(data.getTime())) return doazonsTexto_(valor);
  return Utilities.formatDate(
    data,
    Session.getScriptTimeZone() || 'Europe/Madrid',
    "yyyy-MM-dd'T'HH:mm:ss"
  );
}

function follaDoazonsAdministracion_() {
  var folla = SpreadsheetApp.openById(DOAZONS_ADMIN_SPREADSHEET_ID_)
    .getSheetByName(DOAZONS_ADMIN_SHEET_);
  if (!folla) throw new Error('Non se atopou a folla Colaboracións.');
  return folla;
}

function normalizarDoazonAdministracion_(fila, indices) {
  function valor(nome) {
    return indices[nome] === undefined ? '' : fila[indices[nome]];
  }

  return {
    id: doazonsTexto_(valor('Id_Colaboracion')),
    dataAlta: doazonsIso_(valor('DataAlta')),
    tipoColaboracion: doazonsTexto_(valor('TipoColaboracion')),
    tipoColaborador: doazonsTexto_(valor('TipoColaborador')),
    nome: doazonsTexto_(valor('Nome')),
    nomeCompleto: doazonsTexto_(valor('Nomecompleto')),
    correo: doazonsTexto_(valor('CorreoElectronico')),
    telefono: doazonsTexto_(valor('Telefono')),
    importe: valor('Importe'),
    periodicidade: doazonsTexto_(valor('Periodicidade')),
    formaPago: doazonsTexto_(valor('FormaPago')),
    observacions: doazonsTexto_(valor('Observacións')),
    numOperacionTPV: doazonsTexto_(valor('NumOperacionTPV')),
    estadoPago: doazonsTexto_(valor('EstadoPago')),
    referenciaTPV: doazonsTexto_(valor('ReferenciaTPV')),
    anonimo: ['true','si','sí','yes','1','x'].indexOf(
      doazonsTexto_(valor('Anonimo')).toLowerCase()
    ) >= 0
  };
}

function listarDoazonsAdministracion_(datos) {
  var folla = follaDoazonsAdministracion_();
  var valores = folla.getDataRange().getValues();

  if (valores.length < 2) {
    return { ok: true, doazons: [], estados: DOAZONS_ADMIN_ESTADOS_.slice() };
  }

  var indices = doazonsIndices_(valores[0]);
  if (indices.Id_Colaboracion === undefined) {
    throw new Error('Falta a columna Id_Colaboracion.');
  }

  var doazons = valores.slice(1)
    .filter(function(fila) {
      return doazonsTexto_(fila[indices.Id_Colaboracion]);
    })
    .map(function(fila) {
      return normalizarDoazonAdministracion_(fila, indices);
    });

  doazons.sort(function(a, b) {
    return String(b.dataAlta || '').localeCompare(String(a.dataAlta || ''));
  });

  return { ok: true, doazons: doazons, estados: DOAZONS_ADMIN_ESTADOS_.slice() };
}

function doazonsEscribirColumna_(fila, indices, nome, valor) {
  if (indices[nome] === undefined) return;
  fila[indices[nome]] = valor;
}

function crearDoazonTPVPortal_(datos) {
  var numOperacion = doazonsTexto_(datos && datos.numOperacionTPV);
  var importe = Number(datos && datos.importe);
  if (!numOperacion) return { ok: false, erro: 'Falta o número de operación TPV.' };
  if (!isFinite(importe) || importe < 1) return { ok: false, erro: 'Importe non válido.' };

  var folla = follaDoazonsAdministracion_();
  var valores = folla.getDataRange().getValues();
  var cabeceiras = valores.length ? valores[0] : [];
  var indices = doazonsIndices_(cabeceiras);

  if (indices.Id_Colaboracion === undefined || indices.NumOperacionTPV === undefined) {
    return { ok: false, erro: 'A folla Colaboracións non ten as columnas TPV necesarias.' };
  }

  for (var i = 1; i < valores.length; i++) {
    if (doazonsTexto_(valores[i][indices.NumOperacionTPV]) === numOperacion) {
      return {
        ok: true,
        id: doazonsTexto_(valores[i][indices.Id_Colaboracion]),
        numOperacionTPV: numOperacion,
        existente: true
      };
    }
  }

  var id = 'TPV-' + numOperacion;
  var nova = new Array(cabeceiras.length).fill('');
  doazonsEscribirColumna_(nova, indices, 'Id_Colaboracion', id);
  doazonsEscribirColumna_(nova, indices, 'DataAlta', new Date());
  doazonsEscribirColumna_(nova, indices, 'TipoColaboracion', 'Doazón');
  doazonsEscribirColumna_(nova, indices, 'TipoColaborador', 'Particular');
  doazonsEscribirColumna_(nova, indices, 'Nome', doazonsTexto_(datos && datos.nome));
  doazonsEscribirColumna_(nova, indices, 'Nomecompleto', doazonsTexto_(datos && datos.nome));
  doazonsEscribirColumna_(nova, indices, 'CorreoElectronico', doazonsTexto_(datos && datos.correo));
  doazonsEscribirColumna_(nova, indices, 'Importe', importe);
  doazonsEscribirColumna_(nova, indices, 'Periodicidade', 'Puntual');
  doazonsEscribirColumna_(nova, indices, 'FormaPago', 'TPV CECA');
  doazonsEscribirColumna_(nova, indices, 'NumOperacionTPV', numOperacion);
  doazonsEscribirColumna_(nova, indices, 'EstadoPago', 'Pendente');
  doazonsEscribirColumna_(nova, indices, 'ReferenciaTPV', '');
  doazonsEscribirColumna_(nova, indices, 'Anonimo', datos && datos.anonimo === true ? true : false);
  doazonsEscribirColumna_(nova, indices, 'Observacións', 'Operación iniciada no TPV CECA');

  folla.appendRow(nova);
  SpreadsheetApp.flush();
  return { ok: true, id: id, numOperacionTPV: numOperacion, estado: 'Pendente' };
}

function actualizarDoazonTPVPortal_(datos) {
  var numOperacion = doazonsTexto_(datos && datos.numOperacionTPV);
  var estado = doazonsTexto_(datos && datos.estadoPago);
  var referencia = doazonsTexto_(datos && datos.referenciaTPV);

  if (!numOperacion) return { ok: false, erro: 'Falta o número de operación TPV.' };
  if (DOAZONS_ADMIN_ESTADOS_.indexOf(estado) < 0) {
    return { ok: false, erro: 'Estado de pagamento non válido.' };
  }

  var folla = follaDoazonsAdministracion_();
  var valores = folla.getDataRange().getValues();
  var indices = doazonsIndices_(valores[0] || []);

  if (indices.NumOperacionTPV === undefined || indices.EstadoPago === undefined) {
    return { ok: false, erro: 'A folla non ten as columnas TPV necesarias.' };
  }

  for (var i = 1; i < valores.length; i++) {
    if (doazonsTexto_(valores[i][indices.NumOperacionTPV]) !== numOperacion) continue;

    folla.getRange(i + 1, indices.EstadoPago + 1).setValue(estado);
    if (indices.ReferenciaTPV !== undefined && referencia) {
      folla.getRange(i + 1, indices.ReferenciaTPV + 1).setValue(referencia);
    }
    if (indices['Observacións'] !== undefined) {
      folla.getRange(i + 1, indices['Observacións'] + 1)
        .setValue('Actualización automática TPV CECA · ' + estado);
    }
    SpreadsheetApp.flush();
    return {
      ok: true,
      id: indices.Id_Colaboracion === undefined ? '' : doazonsTexto_(valores[i][indices.Id_Colaboracion]),
      numOperacionTPV: numOperacion,
      referenciaTPV: referencia,
      estadoPago: estado
    };
  }

  return { ok: false, erro: 'Non se atopou a operación TPV.' };
}

function actualizarEstadoDoazonAdministracion_(datos) {
  var id = doazonsTexto_(datos && datos.id);
  var estado = doazonsTexto_(datos && datos.estado);
  var actor = doazonsTexto_(datos && (datos.actorEmail || datos.email)).toLowerCase();

  if (!id) return { ok: false, erro: 'Non se indicou a doazón.' };
  if (DOAZONS_ADMIN_ESTADOS_.indexOf(estado) < 0) {
    return { ok: false, erro: 'Estado de pagamento non válido.' };
  }

  var folla = follaDoazonsAdministracion_();
  var valores = folla.getDataRange().getValues();
  var indices = doazonsIndices_(valores[0]);

  if (indices.Id_Colaboracion === undefined || indices.EstadoPago === undefined) {
    return { ok: false, erro: 'A folla non ten as columnas necesarias.' };
  }

  for (var i = 1; i < valores.length; i++) {
    if (doazonsTexto_(valores[i][indices.Id_Colaboracion]) !== id) continue;
    var anterior = doazonsTexto_(valores[i][indices.EstadoPago]);
    folla.getRange(i + 1, indices.EstadoPago + 1).setValue(estado);
    SpreadsheetApp.flush();

    if (typeof rexistrarActividadePortalXestion_ === 'function') {
      rexistrarActividadePortalXestion_({
        actorEmail: actor,
        modulo: 'Doazóns',
        accion: 'Cambiar estado de doazón',
        elemento: id,
        resultado: 'Correcto',
        detalle: (anterior || 'Sen estado') + ' → ' + estado
      });
    }
    return { ok: true, id: id, estado: estado };
  }
  return { ok: false, erro: 'Non se atopou a doazón.' };
}

function eliminarDoazonAdministracion_(datos) {
  var id = doazonsTexto_(datos && datos.id);
  var actor = doazonsTexto_(datos && (datos.actorEmail || datos.email)).toLowerCase();
  if (!id) return { ok: false, erro: 'Non se indicou a doazón.' };

  var folla = follaDoazonsAdministracion_();
  var valores = folla.getDataRange().getValues();
  var indices = doazonsIndices_(valores[0]);

  if (indices.Id_Colaboracion === undefined || indices.EstadoPago === undefined) {
    return { ok: false, erro: 'A folla non ten as columnas necesarias.' };
  }

  for (var i = valores.length - 1; i >= 1; i--) {
    if (doazonsTexto_(valores[i][indices.Id_Colaboracion]) !== id) continue;
    var estado = doazonsTexto_(valores[i][indices.EstadoPago]);
    if (['Fallido','Anulado'].indexOf(estado) < 0) {
      return { ok: false, erro: 'Só se poden eliminar definitivamente doazóns Fallidas ou Anuladas.' };
    }
    folla.deleteRow(i + 1);
    SpreadsheetApp.flush();
    if (typeof rexistrarActividadePortalXestion_ === 'function') {
      rexistrarActividadePortalXestion_({
        actorEmail: actor,
        modulo: 'Doazóns',
        accion: 'Eliminar doazón',
        elemento: id,
        resultado: 'Correcto',
        detalle: 'Estado previo: ' + estado
      });
    }
    return { ok: true, id: id };
  }
  return { ok: false, erro: 'Non se atopou a doazón.' };
}
