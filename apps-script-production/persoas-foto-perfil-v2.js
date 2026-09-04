/*
 * Administración → Persoas · fotografía de perfil canónica.
 *
 * A fotografía de Persoas é exactamente a mesma que usa Perfil:
 * - a ruta canónica gárdase en Persoas.FotoPerfil;
 * - o binario continúa na carpeta privada Fotos_Perfil;
 * - Administración non crea unha segunda fotografía paralela en R2.
 *
 * Reutiliza os helpers xa existentes de perfil-portal.js para manter o mesmo
 * formato, límites e limpeza da fotografía anterior.
 */

function persoasV2FotoPerfilFila_(datos, minimo) {
  var auth = persoasV2Autorizar_(datos, minimo || 'lectura');
  if (!auth.ok) return { erroAuth: auth };

  var ref = persoasV2Texto_(datos && (datos.idPersoa || datos.id || datos.rowId));
  if (!ref) return { erro: 'Non se indicou a persoa.' };

  var sheet = persoasV2Sheet_();
  var values = sheet.getDataRange().getValues();
  var headers = values[0] || [];
  var ix = persoasV2Indices_(headers);
  ['Row ID', 'Id', 'FotoPerfil'].forEach(function(header) {
    if (ix[header] === undefined) throw new Error('Falta a columna ' + header + ' na folla Persoas.');
  });

  var rowIndex = persoasV2AtoparFila_(values, ix, ref);
  if (rowIndex < 1) return { erro: 'Non se atopou a persoa.' };

  var row = values[rowIndex].slice();
  return {
    auth: auth,
    sheet: sheet,
    values: values,
    ix: ix,
    rowIndex: rowIndex,
    row: row,
    idPersoa: persoasV2Texto_(row[ix.Id]),
    rowId: persoasV2Texto_(row[ix['Row ID']])
  };
}

function persoasV2FotoPerfilObter_(datos) {
  try {
    var ctx = persoasV2FotoPerfilFila_(datos, 'lectura');
    if (ctx.erroAuth) return ctx.erroAuth;
    if (ctx.erro) return { ok:false, erro:ctx.erro };

    var ruta = persoasV2Texto_(ctx.row[ctx.ix.FotoPerfil]);
    if (!ruta) {
      return {
        ok:true,
        disponible:false,
        idPersoa:ctx.idPersoa,
        rowId:ctx.rowId,
        ruta:''
      };
    }

    if (typeof obterContextoPerfil_ !== 'function' || typeof obterFotoPerfilBase64_ !== 'function') {
      throw new Error('O módulo Perfil non está dispoñible no Apps Script de Producción.');
    }

    var foto = obterFotoPerfilBase64_(obterContextoPerfil_(), ruta);
    return {
      ok:true,
      disponible:Boolean(foto && foto.dataUrl),
      idPersoa:ctx.idPersoa,
      rowId:ctx.rowId,
      ruta:ruta,
      dataUrl:foto && foto.dataUrl ? foto.dataUrl : '',
      aviso:foto && foto.aviso ? foto.aviso : ''
    };
  } catch (erro) {
    console.error('persoasV2FotoPerfilObter_:', erro && erro.stack ? erro.stack : erro);
    return { ok:false, erro:String(erro && erro.message ? erro.message : erro) };
  }
}

function persoasV2FotoPerfilGardar_(datos) {
  try {
    var ctx = persoasV2FotoPerfilFila_(datos, 'escritura');
    if (ctx.erroAuth) return ctx.erroAuth;
    if (ctx.erro) return { ok:false, erro:ctx.erro };

    if (typeof obterContextoPerfil_ !== 'function' || typeof gardarFotoPerfil_ !== 'function') {
      throw new Error('O módulo Perfil non está dispoñible no Apps Script de Producción.');
    }

    var novaFoto = gardarFotoPerfil_(
      obterContextoPerfil_(),
      {
        numeroFila:ctx.rowIndex + 1,
        fila:ctx.row,
        cabeceiras:ctx.values[0] || [],
        indices:ctx.ix
      },
      {
        fotoBase64:persoasV2Texto_(datos && datos.fotoBase64),
        fotoTipo:persoasV2Texto_(datos && datos.fotoTipo)
      }
    );

    if (novaFoto && novaFoto.erro) return { ok:false, erro:novaFoto.erro };
    if (!novaFoto || !novaFoto.ruta) return { ok:false, erro:'Non se recibiu unha fotografía válida.' };

    ctx.sheet.getRange(ctx.rowIndex + 1, ctx.ix.FotoPerfil + 1).setValue(novaFoto.ruta);
    if (ctx.ix.DataActualizacionPerfil !== undefined) {
      ctx.sheet.getRange(ctx.rowIndex + 1, ctx.ix.DataActualizacionPerfil + 1).setValue(new Date());
    }
    if (ctx.ix.ActualizadoPor !== undefined) {
      ctx.sheet.getRange(ctx.rowIndex + 1, ctx.ix.ActualizadoPor + 1).setValue(ctx.auth.email);
    }
    SpreadsheetApp.flush();

    var version = persoasV2MarcarVersion_();
    return {
      ok:true,
      disponible:true,
      idPersoa:ctx.idPersoa,
      rowId:ctx.rowId,
      ruta:novaFoto.ruta,
      version:version
    };
  } catch (erro) {
    console.error('persoasV2FotoPerfilGardar_:', erro && erro.stack ? erro.stack : erro);
    return { ok:false, erro:String(erro && erro.message ? erro.message : erro) };
  }
}

function persoasV2FotoPerfilEliminar_(datos) {
  try {
    var ctx = persoasV2FotoPerfilFila_(datos, 'escritura');
    if (ctx.erroAuth) return ctx.erroAuth;
    if (ctx.erro) return { ok:false, erro:ctx.erro };

    var ruta = persoasV2Texto_(ctx.row[ctx.ix.FotoPerfil]);
    if (ruta) {
      if (typeof obterContextoPerfil_ !== 'function' || typeof eliminarFotoAnteriorPerfil_ !== 'function') {
        throw new Error('O módulo Perfil non está dispoñible no Apps Script de Producción.');
      }
      eliminarFotoAnteriorPerfil_(obterContextoPerfil_(), ruta);
    }

    ctx.sheet.getRange(ctx.rowIndex + 1, ctx.ix.FotoPerfil + 1).setValue('');
    if (ctx.ix.DataActualizacionPerfil !== undefined) {
      ctx.sheet.getRange(ctx.rowIndex + 1, ctx.ix.DataActualizacionPerfil + 1).setValue(new Date());
    }
    if (ctx.ix.ActualizadoPor !== undefined) {
      ctx.sheet.getRange(ctx.rowIndex + 1, ctx.ix.ActualizadoPor + 1).setValue(ctx.auth.email);
    }
    SpreadsheetApp.flush();

    var version = persoasV2MarcarVersion_();
    return {
      ok:true,
      disponible:false,
      eliminada:true,
      idPersoa:ctx.idPersoa,
      rowId:ctx.rowId,
      ruta:'',
      version:version
    };
  } catch (erro) {
    console.error('persoasV2FotoPerfilEliminar_:', erro && erro.stack ? erro.stack : erro);
    return { ok:false, erro:String(erro && erro.message ? erro.message : erro) };
  }
}
