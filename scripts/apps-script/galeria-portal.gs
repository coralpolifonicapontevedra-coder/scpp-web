/**
 * Galería privada do Portal do Coralista.
 * Usa Id_Foto como clave actual e RutaR2_Privada como orixe principal.
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
      valorBooleanoGaleriaFotos_(fila[indice.Publicar_Privada]) &&
      String(fila[indice.RutaR2_Privada] || '').trim();
  }).map(function(fila) {
    var titulo = String(fila[indice.Titulo] || '').trim();
    var peFoto = String(fila[indice.PeFoto] || '').trim();
    var evento = String(fila[indice.Evento] || '').trim();
    var concerto = String(fila[indice.Concerto] || '').trim();
    var data = String(fila[indice.Data] || '').trim();
    var ano = String(fila[indice.AnoAproximado] || '').trim();
    var idFoto = String(fila[indice.Id_Foto] || '').trim();
    var rutaR2Privada = String(fila[indice.RutaR2_Privada] || '').trim();
    var grupo = peFoto || evento || concerto ||
      (ano ? 'Arquivo ' + ano : 'Arquivo fotográfico');

    return {
      idFoto: idFoto,
      rowId: idFoto,
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
      grupo: grupo,
      rutaR2Privada: rutaR2Privada,
      RutaR2_Privada: rutaR2Privada
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

  var idFoto = String(datos.idFoto || datos.rowId || '').trim();
  if (!idFoto) return { ok: false, erro: 'Falta identificar a fotografía' };

  var contexto = obterContextoGaleriaFotos_();
  var valores = contexto.folla.getDataRange().getValues();
  if (valores.length < 2) return { ok: false, erro: 'Non se atopou a fotografía' };

  var cabeceiras = valores[0].map(function(valor) {
    return String(valor || '').trim();
  });
  var indice = indiceCabeceirasGaleriaFotos_(cabeceiras);
  var filaIndice = valores.findIndex(function(fila, numero) {
    return numero > 0 && String(fila[indice.Id_Foto] || '').trim() === idFoto;
  });
  if (filaIndice === -1) return { ok: false, erro: 'Non se atopou a fotografía' };

  var fila = valores[filaIndice];
  if (String(fila[indice.EstadoRevision] || '').trim().toLowerCase() !== 'aprobada' ||
      !valorBooleanoGaleriaFotos_(fila[indice.Publicar_Privada])) {
    return { ok: false, erro: 'A fotografía non está publicada na galería privada' };
  }

  var rutaR2Privada = String(fila[indice.RutaR2_Privada] || '').trim();
  if (!rutaR2Privada) {
    return { ok: false, erro: 'A fotografía non ten ruta privada en R2' };
  }

  return {
    ok: true,
    idFoto: idFoto,
    rowId: idFoto,
    rutaR2Privada: rutaR2Privada,
    RutaR2_Privada: rutaR2Privada
  };
}

function obterContextoGaleriaFotos_() {
  var propiedades = PropertiesService.getScriptProperties();
  var spreadsheetId = propiedades.getProperty('FOTOS_SPREADSHEET_ID');
  var sheetId = Number(propiedades.getProperty('FOTOS_SHEET_ID'));
  if (!spreadsheetId || !sheetId) {
    throw new Error('Falta a configuración do módulo Fotos');
  }

  var folla = SpreadsheetApp.openById(spreadsheetId).getSheetById(sheetId);
  if (!folla || folla.getName() !== 'Fotos') {
    throw new Error('Non se atopou a folla Fotos co ID configurado');
  }

  return { folla: folla };
}

function indiceCabeceirasGaleriaFotos_(cabeceiras) {
  var necesarias = [
    'Id_Foto', 'Titulo', 'Data', 'AnoAproximado', 'Lugar',
    'Concerto', 'Evento', 'PeFoto', 'Autor', 'Procedencia',
    'EstadoRevision', 'Publicar_Privada', 'Destacada_Privada',
    'RutaR2_Privada'
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
  var iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();
  }
  var local = texto.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (local) {
    return new Date(Number(local[3]), Number(local[2]) - 1, Number(local[1])).getTime();
  }
  var numeroAno = Number(String(ano || '').trim());
  return numeroAno ? new Date(numeroAno, 0, 1).getTime() : 0;
}
