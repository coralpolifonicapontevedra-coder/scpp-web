/* Eliminación definitiva de rexistros de Repertorio en Preview. */
function canonIdRepertorioEliminar_(valor) {
  var texto = String(valor == null ? '' : valor).trim();
  if (!texto) return '';
  var numero = Number(texto.replace(',', '.'));
  return isFinite(numero) ? String(Math.trunc(numero)) : texto;
}

function localizarFilaRepertorioEliminar_(nome, campoId, id) {
  var f = follaRepertorioAdmin_(nome);
  var lastRow = f.getLastRow();
  var lastCol = f.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return null;
  var h = f.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var ixId = h.indexOf(campoId);
  if (ixId < 0) throw new Error('Falta a columna ' + campoId + ' en ' + nome + '.');
  var ids = f.getRange(2, ixId + 1, lastRow - 1, 1).getDisplayValues();
  var buscado = canonIdRepertorioEliminar_(id);
  for (var i = 0; i < ids.length; i++) {
    if (canonIdRepertorioEliminar_(ids[i][0]) === buscado) {
      var row = i + 2;
      var valores = f.getRange(row, 1, 1, lastCol).getValues()[0];
      var rexistro = {};
      h.forEach(function(k, j) { rexistro[k] = valores[j]; });
      return { folla:f, row:row, rexistro:rexistro };
    }
  }
  return null;
}

function localizarDependenciasObraRepertorioEliminar_(nome, campoReferencia, id) {
  var f = follaRepertorioAdmin_(nome);
  var lastRow = f.getLastRow();
  var lastCol = f.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var h = f.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var ixRef = h.indexOf(campoReferencia);
  if (ixRef < 0) throw new Error('Falta a columna ' + campoReferencia + ' en ' + nome + '.');
  var valores = f.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var buscado = canonIdRepertorioEliminar_(id);
  var atopados = [];
  for (var i = 0; i < valores.length; i++) {
    if (canonIdRepertorioEliminar_(valores[i][ixRef]) !== buscado) continue;
    var rexistro = {};
    h.forEach(function(k, j) { rexistro[k] = valores[i][j]; });
    atopados.push({ folla:f, row:i + 2, rexistro:rexistro });
  }
  return atopados;
}

function normalizarCabeceraRepertorioEliminar_(valor) {
  return String(valor == null ? '' : valor)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function localizarDependenciasExternasRepertorioEliminar_(spreadsheetId, nomeFolla, camposReferencia, id) {
  if (!spreadsheetId) throw new Error('Falta a configuración de ' + nomeFolla + '.');
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var f = ss.getSheetByName(nomeFolla) || ss.getSheets()[0];
  if (!f) throw new Error('Non existe a folla ' + nomeFolla + '.');
  var lastRow = f.getLastRow();
  var lastCol = f.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  var h = f.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var normalizadas = h.map(normalizarCabeceraRepertorioEliminar_);
  var ixRef = -1;
  for (var i = 0; i < camposReferencia.length && ixRef < 0; i++) {
    ixRef = normalizadas.indexOf(normalizarCabeceraRepertorioEliminar_(camposReferencia[i]));
  }
  if (ixRef < 0) {
    throw new Error('Non se atopou a referencia ao repertorio en ' + nomeFolla + '.');
  }

  var valores = f.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var buscado = canonIdRepertorioEliminar_(id);
  var atopados = [];
  for (var fila = 0; fila < valores.length; fila++) {
    if (canonIdRepertorioEliminar_(valores[fila][ixRef]) !== buscado) continue;
    var rexistro = {};
    h.forEach(function(k, j) { rexistro[k] = valores[fila][j]; });
    atopados.push({ row:fila + 2, rexistro:rexistro });
  }
  return atopados;
}

function dependenciasHistoricasObraRepertorioEliminar_(id) {
  if (typeof configuracionEnsaiosPortal_ !== 'function') {
    throw new Error('Non se pode comprobar EnsaiosRepertorio antes de eliminar a obra.');
  }
  if (typeof configuracionConcertosAdministracionPortal_ !== 'function') {
    throw new Error('Non se pode comprobar ConcertosRepertorio antes de eliminar a obra.');
  }

  var cfgEnsaios = configuracionEnsaiosPortal_();
  var cfgConcertos = configuracionConcertosAdministracionPortal_();
  var ensaios = localizarDependenciasExternasRepertorioEliminar_(
    cfgEnsaios.ensaiosRepertorioId,
    'EnsaiosRepertorio',
    ['Repertorio', 'Id_Repertorio', 'IdRepertorio'],
    id
  );
  var concertos = localizarDependenciasExternasRepertorioEliminar_(
    cfgConcertos.concertosRepertorioId,
    'ConcertosRepertorio',
    ['Id_Repertorio', 'Repertorio', 'IdRepertorio', 'Id_Obras', 'Id_Obra'],
    id
  );

  return {
    ensaios: ensaios.length,
    concertos: concertos.length,
    filasEnsaios: ensaios,
    filasConcertos: concertos
  };
}

function dependenciasObraRepertorioEliminar_(id) {
  var partituras = localizarDependenciasObraRepertorioEliminar_('Partituras_App', 'Id_Repertorio', id);
  var audios = localizarDependenciasObraRepertorioEliminar_('AudiosRepertorio', 'NomeObra', id);
  var historicas = dependenciasHistoricasObraRepertorioEliminar_(id);
  return {
    partituras: partituras.length,
    audios: audios.length,
    ensaios: historicas.ensaios,
    concertos: historicas.concertos,
    filasPartituras: partituras,
    filasAudios: audios,
    filasEnsaios: historicas.filasEnsaios,
    filasConcertos: historicas.filasConcertos
  };
}

function eliminarFilasDescRepertorio_(filas) {
  filas.slice().sort(function(a, b) { return b.row - a.row; }).forEach(function(item) {
    item.folla.deleteRow(item.row);
  });
}

function claveR2RepertorioEliminar_(tipo, rexistro) {
  return {
    tipo: tipo,
    key: String(rexistro && rexistro.R2Key || '').trim()
  };
}

function eliminarRecursoRepertorioAdministracion_(d) {
  try {
    var tipo = String(d && d.tipo || '').trim();
    var id = String(d && d.id || '').trim();
    var cascada = d && d.cascada === true;
    if (!id || ['obra', 'partitura', 'audio'].indexOf(tipo) < 0) {
      return { ok:false, codigo:'VALIDATION', erro:'Rexistro non válido.' };
    }

    if (tipo === 'obra') {
      var localizadoObra = localizarFilaRepertorioEliminar_('Repertorio', 'Id', id);
      if (!localizadoObra) return { ok:false, codigo:'NOT_FOUND', erro:'Non se atopou a obra ' + id + '.' };

      var deps = dependenciasObraRepertorioEliminar_(id);
      if (deps.ensaios || deps.concertos) {
        return {
          ok:false,
          codigo:'REFERENCIAS_HISTORICAS',
          dependencias:{
            partituras:deps.partituras,
            audios:deps.audios,
            ensaios:deps.ensaios,
            concertos:deps.concertos
          },
          erro:'A obra está utilizada en ensaios ou concertos e non se pode eliminar.'
        };
      }

      if ((deps.partituras || deps.audios) && !cascada) {
        return {
          ok:false,
          codigo:'DEPENDENCIAS',
          dependencias:{ partituras:deps.partituras, audios:deps.audios, ensaios:0, concertos:0 },
          erro:'A obra ten recursos vinculados.'
        };
      }

      var r2Keys = [];
      deps.filasPartituras.forEach(function(item) {
        var k = claveR2RepertorioEliminar_('partitura', item.rexistro);
        if (k.key) r2Keys.push(k);
      });
      deps.filasAudios.forEach(function(item) {
        var k = claveR2RepertorioEliminar_('audio', item.rexistro);
        if (k.key) r2Keys.push(k);
      });

      eliminarFilasDescRepertorio_(deps.filasPartituras);
      eliminarFilasDescRepertorio_(deps.filasAudios);
      localizadoObra.folla.deleteRow(localizadoObra.row);
      SpreadsheetApp.flush();

      return {
        ok:true,
        tipo:'obra',
        id:id,
        nome:String(localizadoObra.rexistro.NomeObra || ''),
        cascada:cascada,
        eliminados:{ partituras:deps.partituras, audios:deps.audios },
        r2Keys:r2Keys
      };
    }

    var nome = tipo === 'partitura' ? 'Partituras_App' : 'AudiosRepertorio';
    var campoId = tipo === 'partitura' ? 'Id_Partitura' : 'Id_Audio';
    var localizado = localizarFilaRepertorioEliminar_(nome, campoId, id);
    if (!localizado) return { ok:false, codigo:'NOT_FOUND', erro:'Non se atopou o rexistro ' + id + '.' };

    var rexistro = localizado.rexistro || {};
    var nomeVisible = tipo === 'partitura'
      ? String(rexistro.Nomepartitura || '')
      : String(rexistro.AudioFile || rexistro.NomeAudio || '');
    var r2Key = String(rexistro.R2Key || '').trim();

    localizado.folla.deleteRow(localizado.row);
    SpreadsheetApp.flush();
    return {
      ok:true,
      tipo:tipo,
      id:id,
      nome:nomeVisible,
      r2Key:r2Key,
      r2Keys:r2Key ? [{ tipo:tipo, key:r2Key }] : []
    };
  } catch (e) {
    return {
      ok:false,
      codigo:'REPERTORIO_DELETE_ERROR',
      erro:String(e && e.message ? e.message : e)
    };
  }
}
