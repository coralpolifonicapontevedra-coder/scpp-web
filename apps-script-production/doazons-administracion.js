/*
 * Administración de doazóns rexistradas en Colaboracións.
 *
 * Módulo independente.
 * NON intervén no fluxo CECA.
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
  return String(
    valor == null ? '' : valor
  ).trim();
}

function doazonsIndices_(cabeceiras) {
  var resultado = {};

  cabeceiras.forEach(
    function(valor, indice) {
      resultado[doazonsTexto_(valor)] =
        indice;
    }
  );

  return resultado;
}

function doazonsIso_(valor) {
  var data =
    valor instanceof Date
      ? valor
      : new Date(valor);

  if (isNaN(data.getTime())) {
    return doazonsTexto_(valor);
  }

  return Utilities.formatDate(
    data,
    Session.getScriptTimeZone() ||
      'Europe/Madrid',
    "yyyy-MM-dd'T'HH:mm:ss"
  );
}

function follaDoazonsAdministracion_() {
  var folla = SpreadsheetApp
    .openById(
      DOAZONS_ADMIN_SPREADSHEET_ID_
    )
    .getSheetByName(
      DOAZONS_ADMIN_SHEET_
    );

  if (!folla) {
    throw new Error(
      'Non se atopou a folla Colaboracións.'
    );
  }

  return folla;
}

function normalizarDoazonAdministracion_(
  fila,
  indices
) {
  function valor(nome) {
    return indices[nome] === undefined
      ? ''
      : fila[indices[nome]];
  }

  return {
    id:
      doazonsTexto_(
        valor('Id_Colaboracion')
      ),

    dataAlta:
      doazonsIso_(
        valor('DataAlta')
      ),

    tipoColaboracion:
      doazonsTexto_(
        valor('TipoColaboracion')
      ),

    tipoColaborador:
      doazonsTexto_(
        valor('TipoColaborador')
      ),

    nome:
      doazonsTexto_(
        valor('Nome')
      ),

    nomeCompleto:
      doazonsTexto_(
        valor('Nomecompleto')
      ),

    correo:
      doazonsTexto_(
        valor('CorreoElectronico')
      ),

    telefono:
      doazonsTexto_(
        valor('Telefono')
      ),

    importe:
      valor('Importe'),

    periodicidade:
      doazonsTexto_(
        valor('Periodicidade')
      ),

    formaPago:
      doazonsTexto_(
        valor('FormaPago')
      ),

    observacions:
      doazonsTexto_(
        valor('Observacións')
      ),

    numOperacionTPV:
      doazonsTexto_(
        valor('NumOperacionTPV')
      ),

    estadoPago:
      doazonsTexto_(
        valor('EstadoPago')
      ),

    referenciaTPV:
      doazonsTexto_(
        valor('ReferenciaTPV')
      ),

    anonimo:
      [
        'true',
        'si',
        'sí',
        'yes',
        '1',
        'x'
      ].indexOf(
        doazonsTexto_(
          valor('Anonimo')
        ).toLowerCase()
      ) >= 0
  };
}

function listarDoazonsAdministracion_(
  datos
) {
  var folla =
    follaDoazonsAdministracion_();

  var valores =
    folla.getDataRange().getValues();

  if (valores.length < 2) {
    return {
      ok: true,
      doazons: [],
      estados:
        DOAZONS_ADMIN_ESTADOS_.slice()
    };
  }

  var indices =
    doazonsIndices_(valores[0]);

  if (
    indices.Id_Colaboracion ===
    undefined
  ) {
    throw new Error(
      'Falta a columna Id_Colaboracion.'
    );
  }

  var doazons =
    valores
      .slice(1)
      .filter(function(fila) {
        return doazonsTexto_(
          fila[
            indices.Id_Colaboracion
          ]
        );
      })
      .map(function(fila) {
        return normalizarDoazonAdministracion_(
          fila,
          indices
        );
      });

  doazons.sort(
    function(a, b) {
      return String(
        b.dataAlta || ''
      ).localeCompare(
        String(a.dataAlta || '')
      );
    }
  );

  return {
    ok: true,
    doazons: doazons,
    estados:
      DOAZONS_ADMIN_ESTADOS_.slice()
  };
}

function actualizarEstadoDoazonAdministracion_(
  datos
) {
  var id =
    doazonsTexto_(
      datos && datos.id
    );

  var estado =
    doazonsTexto_(
      datos && datos.estado
    );

  var actor =
    doazonsTexto_(
      datos &&
      (
        datos.actorEmail ||
        datos.email
      )
    )
      .toLowerCase();

  if (!id) {
    return {
      ok: false,
      erro:
        'Non se indicou a doazón.'
    };
  }

  if (
    DOAZONS_ADMIN_ESTADOS_
      .indexOf(estado) < 0
  ) {
    return {
      ok: false,
      erro:
        'Estado de pagamento non válido.'
    };
  }

  var folla =
    follaDoazonsAdministracion_();

  var valores =
    folla.getDataRange().getValues();

  var indices =
    doazonsIndices_(valores[0]);

  if (
    indices.Id_Colaboracion ===
      undefined ||
    indices.EstadoPago ===
      undefined
  ) {
    return {
      ok: false,
      erro:
        'A folla non ten as columnas necesarias.'
    };
  }

  for (
    var i = 1;
    i < valores.length;
    i++
  ) {
    if (
      doazonsTexto_(
        valores[i][
          indices.Id_Colaboracion
        ]
      ) !== id
    ) {
      continue;
    }

    var anterior =
      doazonsTexto_(
        valores[i][
          indices.EstadoPago
        ]
      );

    folla
      .getRange(
        i + 1,
        indices.EstadoPago + 1
      )
      .setValue(estado);

    SpreadsheetApp.flush();

    if (
      typeof rexistrarActividadePortalXestion_
        === 'function'
    ) {
      rexistrarActividadePortalXestion_({
        actorEmail: actor,
        modulo: 'Doazóns',
        accion:
          'Cambiar estado de doazón',
        elemento: id,
        resultado: 'Correcto',
        detalle:
          (anterior || 'Sen estado') +
          ' → ' +
          estado
      });
    }

    return {
      ok: true,
      id: id,
      estado: estado
    };
  }

  return {
    ok: false,
    erro:
      'Non se atopou a doazón.'
  };
}

function eliminarDoazonAdministracion_(
  datos
) {
  var id =
    doazonsTexto_(
      datos && datos.id
    );

  var actor =
    doazonsTexto_(
      datos &&
      (
        datos.actorEmail ||
        datos.email
      )
    )
      .toLowerCase();

  if (!id) {
    return {
      ok: false,
      erro:
        'Non se indicou a doazón.'
    };
  }

  var folla =
    follaDoazonsAdministracion_();

  var valores =
    folla.getDataRange().getValues();

  var indices =
    doazonsIndices_(valores[0]);

  if (
    indices.Id_Colaboracion ===
      undefined ||
    indices.EstadoPago ===
      undefined
  ) {
    return {
      ok: false,
      erro:
        'A folla non ten as columnas necesarias.'
    };
  }

  for (
    var i =
      valores.length - 1;
    i >= 1;
    i--
  ) {
    if (
      doazonsTexto_(
        valores[i][
          indices.Id_Colaboracion
        ]
      ) !== id
    ) {
      continue;
    }

    var estado =
      doazonsTexto_(
        valores[i][
          indices.EstadoPago
        ]
      );

    if (
      [
        'Fallido',
        'Anulado'
      ].indexOf(estado) < 0
    ) {
      return {
        ok: false,
        erro:
          'Só se poden eliminar definitivamente doazóns Fallidas ou Anuladas.'
      };
    }

    folla.deleteRow(i + 1);

    SpreadsheetApp.flush();

    if (
      typeof rexistrarActividadePortalXestion_
        === 'function'
    ) {
      rexistrarActividadePortalXestion_({
        actorEmail: actor,
        modulo: 'Doazóns',
        accion:
          'Eliminar doazón',
        elemento: id,
        resultado: 'Correcto',
        detalle:
          'Estado previo: ' +
          estado
      });
    }

    return {
      ok: true,
      id: id
    };
  }

  return {
    ok: false,
    erro:
      'Non se atopou a doazón.'
  };
}
