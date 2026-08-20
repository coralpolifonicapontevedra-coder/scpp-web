/** Asistencias históricas dos concertos no Portal. Código común Preview/Produción. */
function listarAsistenciasConcertosPortal_(datos) {
  datos = datos || {};
  var correo = String(datos.email || '').trim().toLowerCase();
  var usuario = obterUsuarioWebPorEmail(correo);
  if (!usuario) return { ok: false, erro: 'Usuario non autorizado' };
  var asistencias = lerFollaAsistenciasConcertos_();
  var ordeVoces = { Soprano: 1, Contralto: 2, Tenor: 3, Baixo: 4 };
  var porConcerto = {};
  asistencias.forEach(function(a) {
    var idConcerto = String(a.Concerto || '').trim();
    var nome = String(a.Nome_Completo || a['Nome e apelidos'] || '').trim();
    var voz = String(a.Voz || 'Sen voz indicada').trim();
    if (!idConcerto || !nome) return;
    if (!porConcerto[idConcerto]) porConcerto[idConcerto] = [];
    if (!porConcerto[idConcerto].some(function(p){ return p.nome === nome && p.voz === voz; })) porConcerto[idConcerto].push({ nome: nome, voz: voz });
  });
  Object.keys(porConcerto).forEach(function(id) {
    porConcerto[id].sort(function(a,b) {
      var dv = (ordeVoces[a.voz] || 99) - (ordeVoces[b.voz] || 99);
      return dv !== 0 ? dv : a.nome.localeCompare(b.nome, 'gl', { sensitivity: 'base' });
    });
  });
  return { ok: true, asistenciasPorConcerto: porConcerto };
}

function lerFollaAsistenciasConcertos_() {
  var p = PropertiesService.getScriptProperties();
  var spreadsheetId = p.getProperty('ASISTENCIAS_CONCERTOS_SPREADSHEET_ID');
  var sheetName = p.getProperty('ASISTENCIAS_CONCERTOS_SHEET_NAME') || 'AsistenciasConcertos';
  if (!spreadsheetId) throw new Error('Falta ASISTENCIAS_CONCERTOS_SPREADSHEET_ID nas Script Properties');
  var folla = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
  if (!folla) throw new Error('Non se atopou a folla ' + sheetName);
  var valores = folla.getDataRange().getDisplayValues();
  if (valores.length < 2) return [];
  var cabeceiras = valores[0].map(function(v){ return String(v || '').trim(); });
  return valores.slice(1).filter(function(fila){ return fila.some(function(v){ return String(v || '').trim(); }); }).map(function(fila) {
    var rexistro = {};
    cabeceiras.forEach(function(c, i){ rexistro[c] = fila[i] === undefined ? '' : fila[i]; });
    return rexistro;
  });
}
