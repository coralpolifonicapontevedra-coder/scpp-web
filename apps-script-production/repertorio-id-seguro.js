/* Alta segura de obras: non reutiliza IDs aínda presentes en recursos históricos. */
function maxIdRepertorioSeguro_(filas, campo) {
  return filas.reduce(function(maximo, item) {
    var numero = Number(String(item && item[campo] == null ? '' : item[campo]).trim().replace(',', '.'));
    return isFinite(numero) ? Math.max(maximo, Math.trunc(numero)) : maximo;
  }, 0);
}

function seguinteIdObraRepertorioSeguro_() {
  var maximo = 0;
  maximo = Math.max(maximo, maxIdRepertorioSeguro_(filasRepertorioAdmin_('Repertorio'), 'Id'));
  maximo = Math.max(maximo, maxIdRepertorioSeguro_(filasRepertorioAdmin_('Partituras_App'), 'Id_Repertorio'));
  maximo = Math.max(maximo, maxIdRepertorioSeguro_(filasRepertorioAdmin_('AudiosRepertorio'), 'NomeObra'));
  return String(maximo + 1);
}

function altaObraRepertorioAdministracionSegura_(d) {
  var obra = d && d.obra || {};
  var nome = String(obra.NomeObra || '').trim();
  if (!nome) throw new Error('Indica o nome da obra.');
  var id = seguinteIdObraRepertorioSeguro_();
  engadirFilaRepertorioAdmin_('Repertorio', Object.assign({}, obra, {
    'Row ID': Utilities.getUuid(),
    Id: id
  }));
  return { ok:true, id:id };
}
