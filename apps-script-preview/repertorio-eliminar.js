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

function dependenciasObraRepertorioEliminar_(id) {
  var buscado = canonIdRepertorioEliminar_(id);
  var partituras = filasRepertorioAdmin_('Partituras_App').filter(function(x) {
    return canonIdRepertorioEliminar_(x.Id_Repertorio) === buscado;
  });
  var audios = filasRepertorioAdmin_('AudiosRepertorio').filter(function(x) {
    return canonIdRepertorioEliminar_(x.NomeObra) === buscado;
  });
  return { partituras:partituras.length, audios:audios.length };
}

function eliminarRecursoRepertorioAdministracion_(d) {
  try {
    var tipo = String(d && d.tipo || '').trim();
    var id = String(d && d.id || '').trim();
    if (!id || ['obra', 'partitura', 'audio'].indexOf(tipo) < 0) {
      return { ok:false, codigo:'VALIDATION', erro:'Rexistro non válido.' };
    }

    if (tipo === 'obra') {
      var deps = dependenciasObraRepertorioEliminar_(id);
      if (deps.partituras || deps.audios) {
        return {
          ok:false,
          codigo:'DEPENDENCIAS',
          dependencias:deps,
          erro:'Non se pode eliminar a obra porque ten ' + deps.partituras + ' partitura(s) e ' + deps.audios + ' audio(s) vinculados. Elimina primeiro eses recursos.'
        };
      }
    }

    var nome = tipo === 'obra' ? 'Repertorio' : tipo === 'partitura' ? 'Partituras_App' : 'AudiosRepertorio';
    var campoId = tipo === 'obra' ? 'Id' : tipo === 'partitura' ? 'Id_Partitura' : 'Id_Audio';
    var localizado = localizarFilaRepertorioEliminar_(nome, campoId, id);
    if (!localizado) return { ok:false, codigo:'NOT_FOUND', erro:'Non se atopou o rexistro ' + id + '.' };

    var rexistro = localizado.rexistro || {};
    var nomeVisible = tipo === 'obra'
      ? String(rexistro.NomeObra || '')
      : tipo === 'partitura'
        ? String(rexistro.Nomepartitura || '')
        : String(rexistro.AudioFile || rexistro.NomeAudio || '');
    var r2Key = tipo === 'obra' ? '' : String(rexistro.R2Key || '').trim();

    localizado.folla.deleteRow(localizado.row);
    SpreadsheetApp.flush();
    return { ok:true, tipo:tipo, id:id, nome:nomeVisible, r2Key:r2Key };
  } catch (e) {
    return {
      ok:false,
      codigo:'REPERTORIO_DELETE_ERROR',
      erro:String(e && e.message ? e.message : e)
    };
  }
}
