/*
 * Alta administrativa de ensaios desde o Portal SCPP.
 *
 * A creación só necesita a folla Ensaios. O repertorio, as asistencias e o
 * resto de relacións xestiónanse despois desde o módulo operativo de Ensaios.
 */

function gardarEnsaioPortal_(datos) {
  var email = textoEnsaiosPortal_(datos && datos.email).toLowerCase();
  var permiso = permisoEnsaiosAdministracionPortal_(email);
  if (!permiso.escritura) {
    return { ok: false, codigo: 'FORBIDDEN', erro: 'Usuario non autorizado para crear ensaios' };
  }

  var data = textoEnsaiosPortal_(datos && datos.data);
  var horaInicio = textoEnsaiosPortal_(datos && datos.horaInicio);
  var horaFin = textoEnsaiosPortal_(datos && datos.horaFin);
  var lugar = textoEnsaiosPortal_(datos && datos.lugar);
  var tipoEnsaio = textoEnsaiosPortal_(datos && datos.tipoEnsaio);
  var concerto = textoEnsaiosPortal_(datos && datos.concerto);
  var descricion = textoEnsaiosPortal_(datos && datos.descricion);
  var observacions = textoEnsaiosPortal_(datos && datos.observacions);
  var cancelado = datos && datos.cancelado === true;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { ok: false, codigo: 'VALIDATION', erro: 'A data do ensaio non é válida' };
  }
  if (!horaInicio) {
    return { ok: false, codigo: 'VALIDATION', erro: 'A hora de inicio é obrigatoria' };
  }
  if (!tipoEnsaio) {
    return { ok: false, codigo: 'VALIDATION', erro: 'O tipo de ensaio é obrigatorio' };
  }

  var props = PropertiesService.getScriptProperties();
  var ensaiosId = String(props.getProperty('ENSAIOS_SPREADSHEET_ID') || '').trim();
  if (!ensaiosId) {
    return { ok: false, codigo: 'CONFIG', erro: 'Falta a propiedade obrigatoria do ambiente: ENSAIOS_SPREADSHEET_ID' };
  }

  var aberto = abrirFollaEnsaiosAdministracionPortal_(ensaiosId, 'Ensaios', 'ENSAIOS_SPREADSHEET_ID');
  var sheet = aberto.sheet;
  var values = sheet.getDataRange().getValues();
  if (!values.length) {
    return { ok: false, codigo: 'SCHEMA', erro: 'A folla Ensaios non ten cabeceiras' };
  }

  var headers = values[0].map(function (h) { return textoEnsaiosPortal_(h); });
  var row = new Array(headers.length).fill('');

  function set(nomes, valor) {
    var index = indiceHeaderEnsaiosPortal_(headers, nomes);
    if (index >= 0) row[index] = valor;
  }

  var idEnsaio = Utilities.getUuid();
  set(['Id_Ensaio', 'IdEnsaio', 'Id'], idEnsaio);
  set(['Data'], data);
  set(['HoraInicio'], horaInicio);
  set(['HoraFin'], horaFin);
  set(['Lugar'], lugar);
  set(['TipoEnsaio'], tipoEnsaio);
  set(['Concerto'], concerto);
  set(['Descricion', 'Descripción'], descricion);
  set(['Observacions'], observacions);
  set(['Cancelado'], cancelado);

  sheet.appendRow(row);
  SpreadsheetApp.flush();

  return {
    ok: true,
    resultado: {
      idEnsaio: idEnsaio,
      data: data,
      horaInicio: horaInicio,
      horaFin: horaFin,
      lugar: lugar,
      tipoEnsaio: tipoEnsaio,
      concerto: concerto,
      descricion: descricion,
      observacions: observacions,
      cancelado: cancelado,
      rexistradoPor: email
    }
  };
}
