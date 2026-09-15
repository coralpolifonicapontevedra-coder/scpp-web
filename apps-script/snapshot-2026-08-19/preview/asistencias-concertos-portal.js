/**
 * Asistencias dos concertos no Portal do Coralista.
 *
 * A táboa AsistenciasConcertos garda unha referencia a Persoas. Por iso
 * resolvemos Persoa -> nome/voz antes de devolver os datos ao Portal.
 */

function listarAsistenciasConcertosPortal_(datos) {
  datos = datos || {};

  const correo = String(datos.email || '')
    .trim()
    .toLowerCase();

  const usuario = obterUsuarioWebPorEmail(correo);

  if (!usuario) {
    return {
      ok: false,
      erro: 'Usuario non autorizado'
    };
  }

  const asistencias = lerFollaAsistenciasConcertos_();
  const persoas = lerPersoasParaAsistenciasConcertos_();
  const persoasPorId = {};

  persoas.forEach(function(persoa) {
    const id = textoAsistenciasConcertos_(
      campoAsistenciasConcertos_(persoa, [
        'Id',
        'Id_Persoa',
        'Row ID'
      ])
    );

    if (!id) return;

    const nomeCompleto = textoAsistenciasConcertos_(
      campoAsistenciasConcertos_(persoa, [
        'Nome_Completo',
        'Nome completo',
        'Nome e apelidos',
        'NomeApelidos'
      ])
    ) || [
      textoAsistenciasConcertos_(campoAsistenciasConcertos_(persoa, ['Nome'])),
      textoAsistenciasConcertos_(campoAsistenciasConcertos_(persoa, ['Apelidos', 'Apellidos']))
    ].filter(Boolean).join(' ').trim();

    persoasPorId[id] = {
      nome: nomeCompleto,
      voz: textoAsistenciasConcertos_(campoAsistenciasConcertos_(persoa, ['Voz'])) || 'Sen voz indicada'
    };
  });

  const ordeVoces = {
    Soprano: 1,
    Contralto: 2,
    Tenor: 3,
    Baixo: 4
  };

  const porConcerto = {};

  asistencias.forEach(function(asistencia) {
    const idConcerto = textoAsistenciasConcertos_(
      campoAsistenciasConcertos_(asistencia, [
        'Concerto',
        'Id_Conciertos',
        'Id_Concertos',
        'IdConcerto'
      ])
    );

    const idPersoa = textoAsistenciasConcertos_(
      campoAsistenciasConcertos_(asistencia, [
        'Persoa',
        'Id_Persoa',
        'IdPersoa'
      ])
    );

    const estado = campoAsistenciasConcertos_(asistencia, [
      'Estado asistencia',
      'EstadoAsistencia',
      'Asiste'
    ]);

    if (estado !== '' && estado !== null && estado !== undefined && !booleanoAsistenciasConcertos_(estado)) {
      return;
    }

    const persoa = persoasPorId[idPersoa] || null;
    const nomeDirecto = textoAsistenciasConcertos_(
      campoAsistenciasConcertos_(asistencia, [
        'Nome_Completo',
        'Nome completo',
        'Nome e apelidos'
      ])
    );

    const nome = persoa && persoa.nome ? persoa.nome : nomeDirecto;
    const voz = persoa && persoa.voz
      ? persoa.voz
      : textoAsistenciasConcertos_(campoAsistenciasConcertos_(asistencia, ['Voz'])) || 'Sen voz indicada';

    if (!idConcerto || !nome) return;

    if (!porConcerto[idConcerto]) {
      porConcerto[idConcerto] = [];
    }

    const repetida = porConcerto[idConcerto].some(function(item) {
      return item.nome === nome && item.voz === voz;
    });

    if (!repetida) {
      porConcerto[idConcerto].push({
        nome: nome,
        voz: voz
      });
    }
  });

  Object.keys(porConcerto).forEach(function(idConcerto) {
    porConcerto[idConcerto].sort(function(a, b) {
      const diferenzaVoz =
        (ordeVoces[a.voz] || 99) -
        (ordeVoces[b.voz] || 99);

      if (diferenzaVoz !== 0) return diferenzaVoz;

      return a.nome.localeCompare(
        b.nome,
        'gl',
        { sensitivity: 'base' }
      );
    });
  });

  return {
    ok: true,
    asistenciasPorConcerto: porConcerto
  };
}

function textoAsistenciasConcertos_(valor) {
  return String(valor === null || valor === undefined ? '' : valor).trim();
}

function normalizarCabeceiraAsistenciasConcertos_(valor) {
  return textoAsistenciasConcertos_(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function campoAsistenciasConcertos_(rexistro, nomes) {
  if (!rexistro) return '';
  const mapa = {};
  Object.keys(rexistro).forEach(function(chave) {
    mapa[normalizarCabeceiraAsistenciasConcertos_(chave)] = rexistro[chave];
  });

  for (let i = 0; i < nomes.length; i += 1) {
    const chave = normalizarCabeceiraAsistenciasConcertos_(nomes[i]);
    if (Object.prototype.hasOwnProperty.call(mapa, chave)) return mapa[chave];
  }

  return '';
}

function booleanoAsistenciasConcertos_(valor) {
  if (valor === true) return true;
  if (valor === false) return false;
  const texto = textoAsistenciasConcertos_(valor).toLowerCase();
  return ['true', '1', 'si', 'sí', 'yes', 'x', 'asiste'].indexOf(texto) >= 0;
}

function lerFollaAsistenciasConcertos_() {
  return lerFollaAsistenciasConcertosXenerica_(
    obterPropiedadeObrigatoria_('ASISTENCIAS_CONCERTOS_SPREADSHEET_ID'),
    'AsistenciasConcertos'
  );
}

function lerPersoasParaAsistenciasConcertos_() {
  return lerFollaAsistenciasConcertosXenerica_(
    obterPropiedadeObrigatoria_('PERSOAS_SPREADSHEET_ID'),
    'Persoas'
  );
}

function lerFollaAsistenciasConcertosXenerica_(spreadsheetId, nomeFolla) {
  const libro = SpreadsheetApp.openById(spreadsheetId);
  const folla = libro.getSheetByName(nomeFolla) || libro.getSheets()[0];

  if (!folla) {
    throw new Error('Non se atopou a folla ' + nomeFolla);
  }

  const valores = folla.getDataRange().getDisplayValues();

  if (valores.length < 2) return [];

  const cabeceiras = valores[0].map(function(valor) {
    return String(valor || '').trim();
  });

  return valores
    .slice(1)
    .filter(function(fila) {
      return fila.some(function(valor) {
        return String(valor || '').trim();
      });
    })
    .map(function(fila) {
      const rexistro = {};
      cabeceiras.forEach(function(cabeceira, indice) {
        rexistro[cabeceira] = fila[indice] === undefined ? '' : fila[indice];
      });
      return rexistro;
    });
}
