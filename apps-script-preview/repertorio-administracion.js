const REPERTORIO_ADMIN_LIBROS_ = {
  Repertorio: '1Hg_ZWsC6a7Sj-OCwRGyywzTJqqsIxUsAshk02yE9Enw',
  Partituras_App: '18KCxQC7UnplDjPoAq2w4EgD8vGZ5G2JDAKvuXIewet0',
  AudiosRepertorio: '16BNPPni5BxowBsdGcvATj-zhYNLJYwjWoy2Zqtdu6i0'
};

function follaRepertorioAdmin_(nome) {
  const libro = SpreadsheetApp.openById(REPERTORIO_ADMIN_LIBROS_[nome]);
  const folla = libro.getSheetByName(nome);
  if (!folla) throw new Error('Falta a pestana ' + nome + '.');
  return folla;
}

function filasRepertorioAdmin_(nome) {
  const f = follaRepertorioAdmin_(nome);
  const v = f.getDataRange().getValues();
  if (!v.length) return [];
  const h = v[0].map(String);
  return v.slice(1)
    .filter(r => r.some(x => String(x).trim()))
    .map(r => {
      const o = {};
      h.forEach((k, i) => {
        o[k] = r[i] instanceof Date
          ? Utilities.formatDate(r[i], 'Europe/Madrid', 'yyyy-MM-dd HH:mm:ss')
          : r[i];
      });
      return o;
    });
}

function diagnosticoRepertorioAdministracion_() {
  const nomes = ['Repertorio', 'Partituras_App', 'AudiosRepertorio'];
  const probas = {};
  nomes.forEach(nome => {
    try {
      const f = follaRepertorioAdmin_(nome);
      probas[nome] = {
        ok: true,
        spreadsheetId: REPERTORIO_ADMIN_LIBROS_[nome],
        sheetName: f.getName(),
        rows: Math.max(0, f.getLastRow() - 1),
        columns: f.getLastColumn()
      };
    } catch (e) {
      probas[nome] = { ok: false, erro: String(e && e.message ? e.message : e) };
    }
  });
  const fallos = nomes.filter(nome => !probas[nome].ok);
  return {
    ok: fallos.length === 0,
    diagnostico: true,
    probas: probas,
    erro: fallos.length ? 'Fallou o acceso a: ' + fallos.join(', ') : ''
  };
}

function listarRepertorioAdministracion_() {
  try {
    return {
      ok: true,
      obras: filasRepertorioAdmin_('Repertorio'),
      partituras: filasRepertorioAdmin_('Partituras_App'),
      audios: filasRepertorioAdmin_('AudiosRepertorio')
    };
  } catch (e) {
    const d = diagnosticoRepertorioAdministracion_();
    return {
      ok: false,
      codigo: 'REPERTORIO_ADMIN_LIST_ERROR',
      erro: String(e && e.message ? e.message : e),
      diagnostico: d.probas
    };
  }
}

function seguinteIdRepertorioAdmin_(filas, campo) {
  return String(filas.reduce((m, x) => Math.max(m, Number(x[campo]) || 0), 0) + 1);
}

function engadirFilaRepertorioAdmin_(nome, datos) {
  const f = follaRepertorioAdmin_(nome);
  const h = f.getRange(1, 1, 1, f.getLastColumn()).getDisplayValues()[0];
  f.appendRow(h.map(k => Object.prototype.hasOwnProperty.call(datos, k) ? datos[k] : ''));
  SpreadsheetApp.flush();
}

function actualizarFilaRepertorioAdmin_(nome, campoId, id, datos) {
  id = String(id || '').trim();
  if (!id) throw new Error('Falta o identificador do rexistro.');
  datos = datos || {};
  const f = follaRepertorioAdmin_(nome);
  const lastCol = f.getLastColumn();
  const h = f.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const ixId = h.indexOf(campoId);
  if (ixId < 0) throw new Error('Falta a columna ' + campoId + ' en ' + nome + '.');
  if (f.getLastRow() < 2) throw new Error('Non se atopou o rexistro.');
  const ids = f.getRange(2, ixId + 1, f.getLastRow() - 1, 1).getDisplayValues();
  let row = -1;
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === id) {
      row = i + 2;
      break;
    }
  }
  if (row < 0) throw new Error('Non se atopou o rexistro ' + id + '.');
  Object.keys(datos).forEach(k => {
    const ix = h.indexOf(k);
    if (ix >= 0 && k !== campoId) f.getRange(row, ix + 1).setValue(datos[k]);
  });
  SpreadsheetApp.flush();
  return { ok: true, id: id };
}

function normalizarCabeceraRepertorioAdmin_(valor) {
  return String(valor == null ? '' : valor)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function booleanoRepertorioAdmin_(valor) {
  if (valor === true) return true;
  return ['Y', 'SI', 'SÍ', 'TRUE', '1', 'YES'].indexOf(String(valor == null ? '' : valor).trim().toUpperCase()) >= 0;
}

function actualizarPartituraRepertorioAdministracion_(d) {
  try {
    const id = String(d && d.id || '').trim();
    const datos = d && d.datos && typeof d.datos === 'object' ? d.datos : {};
    if (!id) return { ok: false, codigo: 'VALIDATION', erro: 'Falta o identificador da partitura.' };

    const f = follaRepertorioAdmin_('Partituras_App');
    const lastRow = f.getLastRow();
    const lastCol = f.getLastColumn();
    if (lastRow < 2 || lastCol < 1) {
      return { ok: false, codigo: 'EMPTY_SHEET', erro: 'Partituras_App non contén rexistros.' };
    }

    const headers = f.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const normalizados = headers.map(normalizarCabeceraRepertorioAdmin_);
    const ixId = normalizados.indexOf('idpartitura');
    if (ixId < 0) {
      return { ok: false, codigo: 'SCHEMA', erro: 'Falta a columna Id_Partitura en Partituras_App.' };
    }

    const ids = f.getRange(2, ixId + 1, lastRow - 1, 1).getDisplayValues();
    let row = -1;
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === id) {
        row = i + 2;
        break;
      }
    }
    if (row < 0) {
      return { ok: false, codigo: 'NOT_FOUND', erro: 'Non se atopou a partitura ' + id + '.' };
    }

    const aliases = {
      Id_Repertorio: ['idrepertorio'],
      Nomepartitura: ['nomepartitura'],
      Voz: ['voz'],
      'Versión': ['version'],
      TipoPartitura: ['tipopartitura'],
      Principal: ['principal'],
      'Pública': ['publica'],
      'Observacións': ['observacions']
    };

    const fila = f.getRange(row, 1, 1, lastCol).getValues()[0];
    const modificados = [];

    Object.keys(aliases).forEach(campo => {
      if (!Object.prototype.hasOwnProperty.call(datos, campo)) return;
      const nomes = aliases[campo];
      let ix = -1;
      for (let i = 0; i < nomes.length && ix < 0; i++) ix = normalizados.indexOf(nomes[i]);
      if (ix < 0) return;

      let valor = datos[campo];
      if (campo === 'Principal' || campo === 'Pública') valor = booleanoRepertorioAdmin_(valor) ? 'Y' : 'N';
      fila[ix] = valor == null ? '' : valor;
      modificados.push(campo);
    });

    if (!modificados.length) {
      return { ok: false, codigo: 'NO_FIELDS', erro: 'Non se recibiu ningún campo editable da partitura.' };
    }

    f.getRange(row, 1, 1, lastCol).setValues([fila]);
    SpreadsheetApp.flush();
    return { ok: true, id: id, camposActualizados: modificados };
  } catch (e) {
    return {
      ok: false,
      codigo: 'PARTITURA_UPDATE_ERROR',
      erro: String(e && e.message ? e.message : e)
    };
  }
}

function altaObraRepertorioAdministracion_(d) {
  const obra = d.obra || {};
  const nome = String(obra.NomeObra || '').trim();
  if (!nome) throw new Error('Indica o nome da obra.');
  const filas = filasRepertorioAdmin_('Repertorio');
  const id = seguinteIdRepertorioAdmin_(filas, 'Id');
  engadirFilaRepertorioAdmin_('Repertorio', Object.assign({}, obra, { 'Row ID': Utilities.getUuid(), Id: id }));
  return { ok: true, id: id };
}

function altaAudioRepertorioAdministracion_(d) {
  const a = d.audio || {};
  const nome = String(a.NomeAudio || a.AudioFile || '').trim();
  const obra = String(a.NomeObra || '').trim();
  const key = String(a.R2Key || '').trim();
  if (!nome || !key || !obra) throw new Error('Faltan a obra, o nome ou o ficheiro do audio.');
  const id = seguinteIdRepertorioAdmin_(filasRepertorioAdmin_('AudiosRepertorio'), 'Id_Audio');
  engadirFilaRepertorioAdmin_('AudiosRepertorio', Object.assign({}, a, { Id_Audio: id, NomeObra: obra, Activo: 'Y' }));
  return { ok: true, id: id };
}

function actualizarObraRepertorioAdministracion_(d) {
  return actualizarFilaRepertorioAdmin_('Repertorio', 'Id', d.id, d.datos);
}

function actualizarAudioRepertorioAdministracion_(d) {
  return actualizarFilaRepertorioAdmin_('AudiosRepertorio', 'Id_Audio', d.id, d.datos);
}

function estadoRecursoRepertorioAdministracion_(d) {
  const tipo = String(d.tipo || '');
  const id = String(d.id || '');
  const activo = d.activo === true;
  const nome = tipo === 'partitura' ? 'Partituras_App' : 'AudiosRepertorio';
  const campoId = tipo === 'partitura' ? 'Id_Partitura' : 'Id_Audio';
  const campoEstado = tipo === 'partitura' ? 'Activa' : 'Activo';
  if (!id || ['partitura', 'audio'].indexOf(tipo) < 0) throw new Error('Recurso non válido.');
  const f = follaRepertorioAdmin_(nome);
  const h = f.getRange(1, 1, 1, f.getLastColumn()).getDisplayValues()[0];
  const ixId = h.indexOf(campoId);
  const ixEstado = h.indexOf(campoEstado);
  if (ixId < 0 || ixEstado < 0) throw new Error('Faltan columnas de estado en ' + nome + '.');
  if (f.getLastRow() < 2) throw new Error('Non se atopou o recurso.');
  const ids = f.getRange(2, ixId + 1, f.getLastRow() - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === id) {
      f.getRange(i + 2, ixEstado + 1).setValue(activo ? 'Y' : 'N');
      SpreadsheetApp.flush();
      return { ok: true, id: id, activo: activo };
    }
  }
  throw new Error('Non se atopou o recurso.');
}
