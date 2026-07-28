/**
 * Galería privada do Portal do Coralista.
 *
 * Engadir este ficheiro ao mesmo proxecto de Apps Script que atende o portal.
 * No doPost(e), despois de validar WEB_WRITE_TOKEN, encamiñar estas accións:
 *
 * if (datos.accion === 'listarFotosGaleria') {
 *   return respostaJSON(listarFotosGaleriaPortal_(datos));
 * }
 * if (datos.accion === 'obterFotoGaleria') {
 *   return respostaJSON(obterFotoGaleriaPortal_(datos));
 * }
 *
 * Reutiliza FOTOS_SPREADSHEET_ID, FOTOS_SHEET_ID e FOTOS_FOLDER_ID, xa
 * configuradas polo módulo de subida e revisión de fotografías.
 */

function listarFotosGaleriaPortal_(datos) {
  var email = String(datos.email || '').trim().toLowerCase();
  var usuario = obterUsuarioWebPorEmail(email);
  if (!usuario) return { ok: false, erro: 'Usuario non autorizado' };

  var contexto = obterContextoGaleriaFotos_();
  var valores = contexto.folla.getDataRange().getDisplayValues();
  if (valores.length < 2) return { ok: true, fotos: [] };

  var cabeceiras = valores[0].map(function(valor) {
    return String(valor || '').trim();
  });
  var indice = indiceCabeceirasGaleriaFotos_(cabeceiras);

  var fotos = valores.slice(1).filter(function(fila) {
    return String(fila[indice.EstadoRevision] || '').trim().toLowerCase() === 'aprobada' &&
      valorBooleanoGaleriaFotos_(fila[indice.Publicar_Privada]);
  }).map(function(fila) {
    var titulo = String(fila[indice.Titulo] || '').trim();
    var peFoto = String(fila[indice.PeFoto] || '').trim();
    var evento = String(fila[indice.Evento] || '').trim();
    var concerto = String(fila[indice.Concerto] || '').trim();
    var data = String(fila[indice.Data] || '').trim();
    var ano = String(fila[indice.AnoAproximado] || '').trim();
    var grupo = peFoto || evento || concerto || (ano ? 'Arquivo ' + ano : 'Arquivo fotográfico');

    return {
      rowId: String(fila[indice['Row ID']] || '').trim(),
      titulo: titulo || 'Fotografía do arquivo',
      data: data,
      anoAproximado: ano,
      lugar: String(fila[indice.Lugar] || '').trim(),
      concerto: concerto,
      evento: evento,
      peFoto: peFoto,
      autor: String(fila[indice.Autor] || '').trim(),
      procedencia: String(fila[indice.Procedencia] || '').trim(),
      destacada: valorBooleanoGaleriaFotos_(fila[indice.Destacada_Privada]),
      grupo: grupo
    };
  });

  fotos.sort(function(a, b) {
    var dataA = dataOrdenGaleriaFotos_(a.data, a.anoAproximado);
    var dataB = dataOrdenGaleriaFotos_(b.data, b.anoAproximado);
    if (dataA !== dataB) return dataB - dataA;
    if (a.destacada !== b.destacada) return a.destacada ? -1 : 1;
    return String(a.titulo).localeCompare(String(b.titulo), 'gl');
  });

  return { ok: true, fotos: fotos };
}

function obterFotoGaleriaPortal_(datos) {
  var email = String(datos.email || '').trim().toLowerCase();
  var usuario = obterUsuarioWebPorEmail(email);
  if (!usuario) return { ok: false, erro: 'Usuario non autorizado' };

  var rowId = String(datos.rowId || '').trim();
  if (!rowId) return { ok: false, erro: 'Falta identificar a fotografía' };

  var contexto = obterContextoGaleriaFotos_();
  var valores = contexto.folla.getDataRange().getValues();
  var visibles = contexto.folla.getDataRange().getDisplayValues();
  if (valores.length < 2) return { ok: false, erro: 'Non se atopou a fotografía' };

  var cabeceiras = visibles[0].map(function(valor) {
    return String(valor || '').trim();
  });
  var indice = indiceCabeceirasGaleriaFotos_(cabeceiras);
  var filaIndice = valores.findIndex(function(fila, numero) {
    return numero > 0 && String(fila[indice['Row ID']] || '').trim() === rowId;
  });
  if (filaIndice === -1) return { ok: false, erro: 'Non se atopou a fotografía' };

  var fila = valores[filaIndice];
  if (String(fila[indice.EstadoRevision] || '').trim().toLowerCase() !== 'aprobada' ||
      !valorBooleanoGaleriaFotos_(fila[indice.Publicar_Privada])) {
    return { ok: false, erro: 'A fotografía non está publicada na galería privada' };
  }

  var ruta = String(fila[indice.Foto] || '').trim();
  var nome = ruta.split('/').pop();
  if (!nome) return { ok: false, erro: 'A fotografía non ten ficheiro asociado' };

  var ficheiros = DriveApp.getFolderById(contexto.folderId).getFilesByName(nome);
  if (!ficheiros.hasNext()) {
    return { ok: false, erro: 'Non se atopou o ficheiro da fotografía' };
  }

  var ficheiro = ficheiros.next();
  var blob = ficheiro.getBlob();
  var bytes = blob.getBytes();
  if (bytes.length > 8 * 1024 * 1024) {
    return { ok: false, erro: 'A fotografía é demasiado grande para a galería' };
  }

  return {
    ok: true,
    rowId: rowId,
    nomeFicheiro: ficheiro.getName(),
    mimeType: blob.getContentType() || ficheiro.getMimeType() || 'image/jpeg',
    base64: Utilities.base64Encode(bytes)
  };
}

function obterContextoGaleriaFotos_() {
  var propiedades = PropertiesService.getScriptProperties();
  var spreadsheetId = propiedades.getProperty('FOTOS_SPREADSHEET_ID');
  var sheetId = Number(propiedades.getProperty('FOTOS_SHEET_ID'));
  var folderId = propiedades.getProperty('FOTOS_FOLDER_ID');

  if (!spreadsheetId || !sheetId || !folderId) {
    throw new Error('Falta a configuración do módulo Fotos');
  }

  var folla = SpreadsheetApp.openById(spreadsheetId).getSheetById(sheetId);
  if (!folla || folla.getName() !== 'Fotos') {
    throw new Error('Non se atopou a folla Fotos co ID configurado');
  }

  return { folla: folla, folderId: folderId };
}

function indiceCabeceirasGaleriaFotos_(cabeceiras) {
  var necesarias = [
    'Row ID', 'Foto', 'Titulo', 'Data', 'AnoAproximado', 'Lugar',
    'Concerto', 'Evento', 'PeFoto', 'Autor', 'Procedencia',
    'EstadoRevision', 'Publicar_Privada', 'Destacada_Privada'
  ];
  var indice = {};

  necesarias.forEach(function(nome) {
    indice[nome] = cabeceiras.indexOf(nome);
    if (indice[nome] === -1) throw new Error('Falta a columna ' + nome);
  });

  return indice;
}

function valorBooleanoGaleriaFotos_(valor) {
  if (valor === true) return true;
  return ['true', 'verdadero', 'verdadeiro', 'si', 'sí', 'yes', '1']
    .indexOf(String(valor || '').trim().toLowerCase()) !== -1;
}

function dataOrdenGaleriaFotos_(data, ano) {
  var texto = String(data || '').trim();
  var partes = texto.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (partes) {
    return new Date(Number(partes[3]), Number(partes[2]) - 1, Number(partes[1])).getTime();
  }

  var numeroAno = Number(String(ano || '').trim());
  return numeroAno ? new Date(numeroAno, 0, 1).getTime() : 0;
}

function probarGaleriaFotosPortal() {
  var email = String(Session.getEffectiveUser().getEmail() ||
    PropertiesService.getScriptProperties().getProperty('WEB_TEST_EMAIL') || '')
    .trim().toLowerCase();
  console.log(JSON.stringify(listarFotosGaleriaPortal_({ email: email })));
}
