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

function dependenciasObraRepertorioEliminar_(id) {
  var partituras = localizarDependenciasObraRepertorioEliminar_('Partituras_App', 'Id_Repertorio', id);
  var audios = localizarDependenciasObraRepertorioEliminar_('AudiosRepertorio', 'NomeObra', id);
  return {
    partituras: partituras.length,
    audios: audios.length,
    filasPartituras: partituras,
    filasAudios: audios
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
      if ((deps.partituras || deps.audios) && !cascada) {
        return {
          ok:false,
          codigo:'DEPENDENCIAS',
          dependencias:{ partituras:deps.partituras, audios:deps.audios },
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
