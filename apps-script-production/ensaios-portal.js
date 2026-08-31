/*
 * Módulo Ensaios do Portal SCPP.
 *
 * Accións que debe despachar Código.gs/doPost:
 *   listarEnsaiosPortal
 *   gardarAsistenciaEnsaioPortal
 *   gardarEnsaioRepertorioPortal
 *   obterSeguimentoEnsaiosPortal
 */

var ENSAIOS_CONFIG_ = {
  ensaiosId: '1YJkIH4DpuOQShAP8fcSq_TrLPDn08zv_tfKNjq297wc',
  asistenciasId: '1yp0Gc_GaewODS6IaPB9p2cdKqeOCbnyehL_-HzpdUQI',
  ensaiosRepertorioId: '155FLEl07h8LwlrSVLEhFsbkgJMqIf4E6k6lCXf8x_JE',
  persoasId: '13-WeSz69A50XxPP57HA64Nascx6kXQFbeVKron0wATQ',
  concertosId: '1vYlC1VO1hql8jJVkt1OBXnbH7GvUVe4XXe5TSIJk2dU',
  repertorioId: '1Hg_ZWsC6a7Sj-OCwRGyywzTJqqsIxUsAshk02yE9Enw'
};

function configuracionEnsaiosPortal_() {
  var props = PropertiesService.getScriptProperties();

  return {
    ensaiosId:
      props.getProperty('ENSAIOS_SPREADSHEET_ID') ||
      ENSAIOS_CONFIG_.ensaiosId,

    asistenciasId:
      props.getProperty('ASISTENCIAS_ENSAIOS_SPREADSHEET_ID') ||
      ENSAIOS_CONFIG_.asistenciasId,

    ensaiosRepertorioId:
      props.getProperty('ENSAIOS_REPERTORIO_SPREADSHEET_ID') ||
      ENSAIOS_CONFIG_.ensaiosRepertorioId,

    persoasId:
      props.getProperty('PERSOAS_SPREADSHEET_ID') ||
      ENSAIOS_CONFIG_.persoasId,

    concertosId:
      props.getProperty('CONCERTOS_SPREADSHEET_ID') ||
      ENSAIOS_CONFIG_.concertosId,

    repertorioId:
      props.getProperty('REPERTORIO_SPREADSHEET_ID') ||
      ENSAIOS_CONFIG_.repertorioId
  };
}

function normalizarEnsaiosPortal_(valor) {
  return String(valor == null ? '' : valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function textoEnsaiosPortal_(valor) {
  return String(valor == null ? '' : valor).trim();
}

function booleanoEnsaiosPortal_(valor) {
  if (valor === true) return true;

  return ['true', '1', 'si', 'sí', 'yes', 'x'].indexOf(
    String(valor || '').trim().toLowerCase()
  ) >= 0;
}

function follaEnsaiosPortal_(spreadsheetId, nomeEsperado) {
  var ss = SpreadsheetApp.openById(spreadsheetId);

  return (
    ss.getSheetByName(nomeEsperado) ||
    ss.getSheets()[0]
  );
}

function filasEnsaiosPortal_(spreadsheetId, nomeEsperado) {
  var sheet = follaEnsaiosPortal_(
    spreadsheetId,
    nomeEsperado
  );

  var values = sheet.getDataRange().getValues();

  if (!values.length) {
    return {
      sheet: sheet,
      headers: [],
      rows: []
    };
  }

  var headers = values[0].map(function(h) {
    return textoEnsaiosPortal_(h);
  });

  var rows = values
    .slice(1)
    .filter(function(row) {
      return row.some(function(cell) {
        return textoEnsaiosPortal_(cell) !== '';
      });
    })
    .map(function(row, index) {
      var item = {
        __row: index + 2
      };

      headers.forEach(function(header, i) {
        item[header] = row[i];
      });

      return item;
    });

  return {
    sheet: sheet,
    headers: headers,
    rows: rows
  };
}

function campoEnsaiosPortal_(row, nomes) {
  var keys = Object.keys(row || {});

  for (var i = 0; i < nomes.length; i++) {
    var target = normalizarEnsaiosPortal_(nomes[i]);

    for (var j = 0; j < keys.length; j++) {
      if (
        normalizarEnsaiosPortal_(keys[j]) === target
      ) {
        return row[keys[j]];
      }
    }
  }

  return '';
}

function indiceHeaderEnsaiosPortal_(headers, nomes) {
  for (var i = 0; i < nomes.length; i++) {
    var target = normalizarEnsaiosPortal_(nomes[i]);

    for (var j = 0; j < headers.length; j++) {
      if (
        normalizarEnsaiosPortal_(headers[j]) === target
      ) {
        return j;
      }
    }
  }

  return -1;
}

function serializarDataEnsaiosPortal_(valor) {
  if (
    Object.prototype.toString.call(valor) === '[object Date]' &&
    !isNaN(valor.getTime())
  ) {
    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone() || 'Europe/Madrid',
      'yyyy-MM-dd'
    );
  }

  return textoEnsaiosPortal_(valor);
}

function serializarHoraEnsaiosPortal_(valor) {
  if (
    Object.prototype.toString.call(valor) === '[object Date]' &&
    !isNaN(valor.getTime())
  ) {
    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone() || 'Europe/Madrid',
      'HH:mm'
    );
  }

  return textoEnsaiosPortal_(valor);
}
function permisoEnsaiosPortal_(email) {
  var permiso = resolverPermisosPortal_(email);
  return {
    autorizado: permiso.autorizado === true,
    escritura: permiso.escritura === true,
    nivel: permiso.nivel || '',
    cargo: permiso.cargo || permiso.funcion || '',
    perfis: permiso.perfis || [],
    fonte: permiso.fonte || ''
  };
}

function esCoralistaActivoEnsaiosPortal_(row) {
  var voz = textoEnsaiosPortal_(
    campoEnsaiosPortal_(row, ['Voz'])
  );

  if (!voz) return false;

  var estado = textoEnsaiosPortal_(
    campoEnsaiosPortal_(row, ['Activo', 'Estado'])
  ).toLowerCase();

  return [
    'baixa',
    'baja',
    'inactivo',
    'inactiva',
    'false',
    '0'
  ].indexOf(estado) < 0;
}

function listarEnsaiosPortal_(datos) {
  var email = textoEnsaiosPortal_(
    datos && datos.email
  ).toLowerCase();

  var permiso = permisoEnsaiosPortal_(email);

  if (!permiso.autorizado) {
    return {
      ok: false,
      codigo: 'FORBIDDEN',
      erro: 'Usuario non autorizado'
    };
  }

  var cfg = configuracionEnsaiosPortal_();

  var ensaios = filasEnsaiosPortal_(
    cfg.ensaiosId,
    'Ensaios'
  ).rows;

  var asistencias = filasEnsaiosPortal_(
    cfg.asistenciasId,
    'AsistenciasEnsaios'
  ).rows;

  var ensaiosRep = filasEnsaiosPortal_(
    cfg.ensaiosRepertorioId,
    'EnsaiosRepertorio'
  ).rows;

  var persoas = filasEnsaiosPortal_(
    cfg.persoasId,
    'Persoas'
  ).rows.filter(esCoralistaActivoEnsaiosPortal_);

  var concertos = filasEnsaiosPortal_(
    cfg.concertosId,
    'Concertos'
  ).rows;

  var repertorio = filasEnsaiosPortal_(
    cfg.repertorioId,
    'Repertorio'
  ).rows;

  var concertosMap = {};

  concertos.forEach(function(row) {
    var id = textoEnsaiosPortal_(
      campoEnsaiosPortal_(
        row,
        ['Id', 'Id_Concerto', 'Id_Conciertos', 'Row ID']
      )
    );

    if (id) {
      concertosMap[id] = textoEnsaiosPortal_(
        campoEnsaiosPortal_(
          row,
          ['Nome', 'Nombre', 'Concerto']
        )
      );
    }
  });

  var persoasOut = persoas.map(function(row) {
    var nome = textoEnsaiosPortal_(
      campoEnsaiosPortal_(row, ['Nome', 'Nombre'])
    );

    var apelido1 = textoEnsaiosPortal_(
      campoEnsaiosPortal_(
        row,
        ['PrimeiroApelido', 'PrimerApellido', 'Apelido1']
      )
    );

    var apelido2 = textoEnsaiosPortal_(
      campoEnsaiosPortal_(
        row,
        ['SegundoApelido', 'SegundoApellido', 'Apelido2']
      )
    );

    return {
      idPersoa: textoEnsaiosPortal_(
        campoEnsaiosPortal_(
          row,
          ['Id', 'Id_Persoa', 'Row ID']
        )
      ),
      nome: nome,
      primeiroApelido: apelido1,
      segundoApelido: apelido2,
      nomeCompleto: [nome, apelido1, apelido2]
        .filter(Boolean)
        .join(' '),
      voz: textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Voz'])
      )
    };
  });

  var ensaiosOut = ensaios.map(function(row) {
    var concerto = textoEnsaiosPortal_(
      campoEnsaiosPortal_(row, ['Concerto'])
    );

    return {
      idEnsaio: textoEnsaiosPortal_(
        campoEnsaiosPortal_(
          row,
          ['Id_Ensaio', 'IdEnsaio', 'Id']
        )
      ),
      data: serializarDataEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Data'])
      ),
      horaInicio: serializarHoraEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['HoraInicio'])
      ),
      horaFin: serializarHoraEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['HoraFin'])
      ),
      lugar: textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Lugar'])
      ),
      tipoEnsaio: textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['TipoEnsaio'])
      ),
      concerto: concerto,
      concertoNome: concertosMap[concerto] || concerto,
      descricion: textoEnsaiosPortal_(
        campoEnsaiosPortal_(
          row,
          ['Descricion', 'Descripción']
        )
      ),
      observacions: textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Observacions'])
      ),
      cancelado: booleanoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Cancelado'])
      )
    };
  });
    var asistenciasOut = asistencias.map(function(row) {
    return {
      idAsistenciaEnsaio: textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Id_AsistenciaEnsaio', 'Id'])
      ),
      ensaio: textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Ensaio'])
      ),
      persoa: textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Persoa'])
      ),
      estadoAsistencia: textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['EstadoAsistencia'])
      ),
      horaChegada: serializarHoraEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['HoraChegada'])
      ),
      horaSaida: serializarHoraEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['HoraSaida'])
      ),
      xustificada: booleanoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Xustificada'])
      ),
      motivo: textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Motivo'])
      ),
      observacions: textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Observacions'])
      )
    };
  });

  var ensaiosRepOut = ensaiosRep.map(function(row) {
    return {
      idEnsaioRepertorio: textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Id_EnsaioRepertorio', 'Id'])
      ),
      ensaio: textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Ensaio'])
      ),
      repertorio: textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Repertorio'])
      ),
      orde: campoEnsaiosPortal_(row, ['Orde']),
      tipoTraballo: textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['TipoTraballo'])
      ),
      desde: textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Desde'])
      ),
      ata: textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Ata'])
      ),
      observacions: textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Observacions'])
      )
    };
  });

  var repertorioOut = repertorio
    .map(function(row) {
      return {
        idRepertorio: textoEnsaiosPortal_(
          campoEnsaiosPortal_(
            row,
            ['Id', 'Id_Repertorio', 'Row ID']
          )
        ),
        nomeObra: textoEnsaiosPortal_(
          campoEnsaiosPortal_(
            row,
            ['NomeObra', 'Nome', 'Obra']
          )
        ),
        compositor: textoEnsaiosPortal_(
          campoEnsaiosPortal_(row, ['Compositor'])
        ),
        audios: []
      };
    })
    .filter(function(row) {
      return row.idRepertorio && row.nomeObra;
    });

  return {
    ok: true,
    perfil: {
      email: email,
      nivel: permiso.nivel,
      cargo: permiso.cargo,
      podeEditar: permiso.escritura
    },
    ensaios: ensaiosOut,
    persoas: persoasOut,
    asistencias: asistenciasOut,
    ensaiosRepertorio: ensaiosRepOut,
    repertorio: repertorioOut,
    seguimento: calcularSeguimentoEnsaiosPortal_(
      ensaiosOut,
      persoasOut,
      asistenciasOut,
      ensaiosRepOut,
      repertorioOut,
      {}
    ),
    xeradoEn: new Date().toISOString()
  };
}

function gardarAsistenciaEnsaioPortal_(datos) {
  var email = textoEnsaiosPortal_(
    datos && datos.email
  ).toLowerCase();

  var permiso = permisoEnsaiosPortal_(email);

  if (!permiso.escritura) {
    return {
      ok: false,
      codigo: 'FORBIDDEN',
      erro: 'Usuario non autorizado para modificar asistencias'
    };
  }

  var idEnsaio = textoEnsaiosPortal_(datos.idEnsaio);
  var idPersoa = textoEnsaiosPortal_(datos.idPersoa);
  var estado = textoEnsaiosPortal_(datos.estadoAsistencia);

  if (
    !idEnsaio ||
    !idPersoa ||
    ['Asiste', 'Non asiste'].indexOf(estado) < 0
  ) {
    return {
      ok: false,
      codigo: 'INVALID_DATA',
      erro: 'Datos de asistencia incompletos'
    };
  }

  var cfg = configuracionEnsaiosPortal_();

  var table = filasEnsaiosPortal_(
    cfg.asistenciasId,
    'AsistenciasEnsaios'
  );

  var headers = table.headers;

  var iId = indiceHeaderEnsaiosPortal_(
    headers,
    ['Id_AsistenciaEnsaio']
  );

  var iEnsaio = indiceHeaderEnsaiosPortal_(
    headers,
    ['Ensaio']
  );

  var iPersoa = indiceHeaderEnsaiosPortal_(
    headers,
    ['Persoa']
  );

  var iEstado = indiceHeaderEnsaiosPortal_(
    headers,
    ['EstadoAsistencia']
  );

  var iXust = indiceHeaderEnsaiosPortal_(
    headers,
    ['Xustificada']
  );

  var iMotivo = indiceHeaderEnsaiosPortal_(
    headers,
    ['Motivo']
  );

  var iObs = indiceHeaderEnsaiosPortal_(
    headers,
    ['Observacions']
  );

  var iData = indiceHeaderEnsaiosPortal_(
    headers,
    ['DataRexistro']
  );

  var iPor = indiceHeaderEnsaiosPortal_(
    headers,
    ['RexistradaPor']
  );

  if (
    [iId, iEnsaio, iPersoa, iEstado].some(function(i) {
      return i < 0;
    })
  ) {
    return {
      ok: false,
      codigo: 'SCHEMA',
      erro: 'A Sheet AsistenciasEnsaios non ten as columnas esperadas'
    };
  }

  var existing = table.rows.find(function(row) {
    return (
      textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Ensaio'])
      ) === idEnsaio &&
      textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Persoa'])
      ) === idPersoa
    );
  });

  var rowNumber = existing
    ? existing.__row
    : table.sheet.getLastRow() + 1;

  var rowValues = existing
    ? table.sheet
        .getRange(rowNumber, 1, 1, headers.length)
        .getValues()[0]
    : new Array(headers.length).fill('');

  if (!existing) {
    rowValues[iId] = Utilities.getUuid();
  }

  rowValues[iEnsaio] = idEnsaio;
  rowValues[iPersoa] = idPersoa;
  rowValues[iEstado] = estado;

  if (iXust >= 0) {
    rowValues[iXust] =
      Boolean(datos.xustificada) &&
      estado === 'Non asiste';
  }

  if (iMotivo >= 0) {
    rowValues[iMotivo] =
      textoEnsaiosPortal_(datos.motivo);
  }

  if (iObs >= 0) {
    rowValues[iObs] =
      textoEnsaiosPortal_(datos.observacions);
  }

  if (iData >= 0) {
    rowValues[iData] = new Date();
  }

  if (iPor >= 0) {
    rowValues[iPor] = email;
  }

  table.sheet
    .getRange(rowNumber, 1, 1, headers.length)
    .setValues([rowValues]);

  SpreadsheetApp.flush();

  return {
    ok: true,
    resultado: {
      idEnsaio: idEnsaio,
      idPersoa: idPersoa,
      estadoAsistencia: estado
    }
  };
}
function gardarEnsaioRepertorioPortal_(datos) {
  var email = textoEnsaiosPortal_(
    datos && datos.email
  ).toLowerCase();

  var permiso = permisoEnsaiosPortal_(email);

  if (!permiso.escritura) {
    return {
      ok: false,
      codigo: 'FORBIDDEN',
      erro: 'Usuario non autorizado para modificar o repertorio do ensaio'
    };
  }

  var idEnsaio = textoEnsaiosPortal_(datos.idEnsaio);
  var idRepertorio = textoEnsaiosPortal_(datos.idRepertorio);

  if (!idEnsaio || !idRepertorio) {
    return {
      ok: false,
      codigo: 'INVALID_DATA',
      erro: 'Ensaio e repertorio son obrigatorios'
    };
  }

  var cfg = configuracionEnsaiosPortal_();

  var table = filasEnsaiosPortal_(
    cfg.ensaiosRepertorioId,
    'EnsaiosRepertorio'
  );

  var headers = table.headers;

  var required = [
    'Id_EnsaioRepertorio',
    'Ensaio',
    'Repertorio'
  ];

  var indices = {};

  required
    .concat([
      'Orde',
      'TipoTraballo',
      'Desde',
      'Ata',
      'Observacions',
      'RexistradoPor',
      'DataRexistro'
    ])
    .forEach(function(name) {
      indices[name] = indiceHeaderEnsaiosPortal_(
        headers,
        [name]
      );
    });

  if (
    required.some(function(name) {
      return indices[name] < 0;
    })
  ) {
    return {
      ok: false,
      codigo: 'SCHEMA',
      erro: 'A Sheet EnsaiosRepertorio non ten as columnas esperadas'
    };
  }

  var existing = table.rows.find(function(row) {
    return (
      textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Ensaio'])
      ) === idEnsaio &&
      textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Repertorio'])
      ) === idRepertorio
    );
  });

  var rowNumber = existing
    ? existing.__row
    : table.sheet.getLastRow() + 1;

  var values = existing
    ? table.sheet
        .getRange(rowNumber, 1, 1, headers.length)
        .getValues()[0]
    : new Array(headers.length).fill('');

  if (!existing) {
    values[indices.Id_EnsaioRepertorio] =
      Utilities.getUuid();
  }

  values[indices.Ensaio] = idEnsaio;
  values[indices.Repertorio] = idRepertorio;

  if (indices.Orde >= 0 && !existing) {
    values[indices.Orde] =
      table.rows.filter(function(r) {
        return textoEnsaiosPortal_(
          campoEnsaiosPortal_(r, ['Ensaio'])
        ) === idEnsaio;
      }).length + 1;
  }

  if (indices.TipoTraballo >= 0) {
    values[indices.TipoTraballo] =
      textoEnsaiosPortal_(datos.tipoTraballo);
  }

  if (indices.Desde >= 0) {
    values[indices.Desde] =
      textoEnsaiosPortal_(datos.desde);
  }

  if (indices.Ata >= 0) {
    values[indices.Ata] =
      textoEnsaiosPortal_(datos.ata);
  }

  if (indices.Observacions >= 0) {
    values[indices.Observacions] =
      textoEnsaiosPortal_(datos.observacions);
  }

  if (indices.RexistradoPor >= 0) {
    values[indices.RexistradoPor] = email;
  }

  if (indices.DataRexistro >= 0) {
    values[indices.DataRexistro] = new Date();
  }

  table.sheet
    .getRange(rowNumber, 1, 1, headers.length)
    .setValues([values]);

  SpreadsheetApp.flush();

  return {
    ok: true,
    resultado: {
      idEnsaio: idEnsaio,
      idRepertorio: idRepertorio
    }
  };
}

function obterSeguimentoEnsaiosPortal_(datos) {
  var listado = listarEnsaiosPortal_(datos);

  if (!listado.ok) {
    return listado;
  }

  return {
    ok: true,
    seguimento: calcularSeguimentoEnsaiosPortal_(
      listado.ensaios,
      listado.persoas,
      listado.asistencias,
      listado.ensaiosRepertorio,
      listado.repertorio,
      datos || {}
    )
  };
}
function calcularSeguimentoEnsaiosPortal_(
  ensaios,
  persoas,
  asistencias,
  ensaiosRep,
  repertorio,
  filtros
) {
  var desde = filtros.desde
    ? new Date(filtros.desde + 'T00:00:00')
    : null;

  var ata = filtros.ata
    ? new Date(filtros.ata + 'T23:59:59')
    : null;

  var concerto = textoEnsaiosPortal_(filtros.concerto);
  var voz = textoEnsaiosPortal_(filtros.voz);

  var validos = ensaios.filter(function(e) {
    if (booleanoEnsaiosPortal_(e.cancelado)) {
      return false;
    }

    var d = e.data
      ? new Date(e.data + 'T12:00:00')
      : null;

    if (!d || isNaN(d.getTime()) || d > new Date()) {
      return false;
    }

    if (desde && d < desde) return false;
    if (ata && d > ata) return false;

    if (
      concerto &&
      e.concertoNome !== concerto &&
      e.concerto !== concerto
    ) {
      return false;
    }

    return true;
  });

  var ids = {};

  validos.forEach(function(e) {
    ids[e.idEnsaio] = true;
  });

  var persoasMap = {};

  persoas.forEach(function(p) {
    persoasMap[p.idPersoa] = p;
  });

  var attendance = asistencias.filter(function(a) {
    return (
      ids[a.ensaio] &&
      (
        !voz ||
        (
          persoasMap[a.persoa] &&
          normalizarEnsaiosPortal_(
            persoasMap[a.persoa].voz
          ) === normalizarEnsaiosPortal_(voz)
        )
      )
    );
  });

  var presentes = attendance.filter(function(a) {
    return normalizarEnsaiosPortal_(
      a.estadoAsistencia
    ) === 'asiste';
  }).length;

  var decididas = attendance.filter(function(a) {
    return ['asiste', 'nonasiste'].indexOf(
      normalizarEnsaiosPortal_(
        a.estadoAsistencia
      )
    ) >= 0;
  }).length;

  var ausXust = attendance.filter(function(a) {
    return (
      normalizarEnsaiosPortal_(
        a.estadoAsistencia
      ) === 'nonasiste' &&
      a.xustificada
    );
  }).length;

  var rep = ensaiosRep.filter(function(r) {
    return ids[r.ensaio];
  });

  var works = {};

  repertorio.forEach(function(r) {
    works[r.idRepertorio] = r.nomeObra;
  });

  var obraCounts = {};

  rep.forEach(function(r) {
    obraCounts[r.repertorio] =
      (obraCounts[r.repertorio] || 0) + 1;
  });

  var voices = [
    'Soprano',
    'Contralto',
    'Tenor',
    'Baixo'
  ].map(function(v) {

    var idsPersoas = {};

    persoas
      .filter(function(p) {
        return normalizarEnsaiosPortal_(p.voz) ===
          normalizarEnsaiosPortal_(v);
      })
      .forEach(function(p) {
        idsPersoas[p.idPersoa] = true;
      });

    var a = attendance.filter(function(x) {
      return idsPersoas[x.persoa];
    });

    var d = a.filter(function(x) {
      return ['asiste', 'nonasiste'].indexOf(
        normalizarEnsaiosPortal_(
          x.estadoAsistencia
        )
      ) >= 0;
    });

    var p = d.filter(function(x) {
      return normalizarEnsaiosPortal_(
        x.estadoAsistencia
      ) === 'asiste';
    }).length;

    return {
      voz: v,
      porcentaxe: d.length
        ? Math.round(p * 100 / d.length)
        : 0
    };
  });

  return {
    ensaiosRealizados: validos.length,

    asistenciaMedia: decididas
      ? Math.round(presentes * 100 / decididas)
      : 0,

    ausenciasXustificadas: ausXust,

    obrasTraballadas:
      Object.keys(obraCounts).length,

    porVoz: voices,

    porObra: Object.keys(obraCounts)
      .map(function(id) {
        return {
          idRepertorio: id,
          nome: works[id] || id,
          ensaios: obraCounts[id]
        };
      })
      .sort(function(a, b) {
        return b.ensaios - a.ensaios;
      })
  };
}
function probarEnsaiosPortal() {
  var email = PropertiesService
    .getScriptProperties()
    .getProperty('WEB_TEST_EMAIL');

  var resultado = listarEnsaiosPortal_({
    email: email
  });

  console.log(JSON.stringify(resultado, null, 2));
}
function gardarEnsaioPortal_(datos) {
  var email = textoEnsaiosPortal_(
    datos && datos.email
  ).toLowerCase();

  var permiso = permisoEnsaiosPortal_(email);

  if (!permiso.escritura) {
    return {
      ok: false,
      codigo: 'FORBIDDEN',
      erro: 'Usuario non autorizado para crear ensaios'
    };
  }

  var data = textoEnsaiosPortal_(datos.data);
  var horaInicio = textoEnsaiosPortal_(datos.horaInicio);
  var horaFin = textoEnsaiosPortal_(datos.horaFin);
  var lugar = textoEnsaiosPortal_(datos.lugar);
  var tipoEnsaio = textoEnsaiosPortal_(datos.tipoEnsaio);
  var concerto = textoEnsaiosPortal_(datos.concerto);
  var descricion = textoEnsaiosPortal_(datos.descricion);
  var observacions = textoEnsaiosPortal_(datos.observacions);

  if (!data || !horaInicio) {
    return {
      ok: false,
      codigo: 'INVALID_DATA',
      erro: 'A data e a hora de inicio son obrigatorias'
    };
  }

  var cfg = configuracionEnsaiosPortal_();

  var table = filasEnsaiosPortal_(
    cfg.ensaiosId,
    'Ensaios'
  );

  var headers = table.headers;

  var indices = {};

  [
    'Id_Ensaio',
    'Data',
    'HoraInicio',
    'HoraFin',
    'Lugar',
    'TipoEnsaio',
    'Concerto',
    'Descricion',
    'Observacions',
    'Cancelado'
  ].forEach(function(name) {
    indices[name] = indiceHeaderEnsaiosPortal_(
      headers,
      [name]
    );
  });

  if (
    indices.Id_Ensaio < 0 ||
    indices.Data < 0 ||
    indices.HoraInicio < 0
  ) {
    return {
      ok: false,
      codigo: 'SCHEMA',
      erro: 'A Sheet Ensaios non ten as columnas esperadas'
    };
  }

  var rowValues = new Array(headers.length).fill('');

  var idEnsaio = Utilities.getUuid();

  rowValues[indices.Id_Ensaio] = idEnsaio;
  rowValues[indices.Data] = data;
  rowValues[indices.HoraInicio] = horaInicio;

  if (indices.HoraFin >= 0) {
    rowValues[indices.HoraFin] = horaFin;
  }

  if (indices.Lugar >= 0) {
    rowValues[indices.Lugar] = lugar;
  }

  if (indices.TipoEnsaio >= 0) {
    rowValues[indices.TipoEnsaio] = tipoEnsaio;
  }

  if (indices.Concerto >= 0) {
    rowValues[indices.Concerto] = concerto;
  }

  if (indices.Descricion >= 0) {
    rowValues[indices.Descricion] = descricion;
  }

  if (indices.Observacions >= 0) {
    rowValues[indices.Observacions] = observacions;
  }

  if (indices.Cancelado >= 0) {
    rowValues[indices.Cancelado] = false;
  }

  var rowNumber = table.sheet.getLastRow() + 1;

  table.sheet
    .getRange(rowNumber, 1, 1, headers.length)
    .setValues([rowValues]);

  SpreadsheetApp.flush();

  return {
    ok: true,
    resultado: {
      idEnsaio: idEnsaio,
      data: data,
      horaInicio: horaInicio
    }
  };
}
function eliminarEnsaioRepertorioPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoEnsaiosPortal_(email);

  if (!permiso.escritura) {
    return {
      ok: false,
      codigo: 'FORBIDDEN',
      erro: 'Usuario non autorizado para eliminar obras do ensaio'
    };
  }

  var idEnsaio = textoEnsaiosPortal_(datos && datos.idEnsaio);
  var idRepertorio = textoEnsaiosPortal_(datos && datos.idRepertorio);

  if (!idEnsaio || !idRepertorio) {
    return {
      ok: false,
      codigo: 'INVALID_DATA',
      erro: 'Falta o ensaio ou a obra'
    };
  }

  var cfg = configuracionEnsaiosPortal_();
  var table = filasEnsaiosPortal_(
    cfg.ensaiosRepertorioId,
    'EnsaiosRepertorio'
  );

  var fila = table.rows.find(function(row) {
    return (
      textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Ensaio'])
      ) === idEnsaio &&
      textoEnsaiosPortal_(
        campoEnsaiosPortal_(row, ['Repertorio'])
      ) === idRepertorio
    );
  });

  if (!fila) {
    return {
      ok: false,
      codigo: 'NOT_FOUND',
      erro: 'A obra non está asociada a este ensaio'
    };
  }

  table.sheet.deleteRow(fila.__row);
  SpreadsheetApp.flush();

  return {
    ok: true,
    resultado: {
      idEnsaio: idEnsaio,
      idRepertorio: idRepertorio
    }
  };
}