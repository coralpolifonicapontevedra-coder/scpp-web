/* Textos específicos para alta e revisión de Persoas en Preview.
 * Preview usa unha Sheet illada de Produción.
 */

var PERSOAS_REVISION_TEXTO_LEGAL_ID_ = 'DATOS_PERSOA_SCPP';
var PERSOAS_REVISION_EXENCION_COTA_ID_ = 'EXENCION_COTA_SCPP';
var PERSOAS_REVISION_PREVIEW_SPREADSHEET_ID_ = '1-p5dAqF17LIMwHdSraqoxqN_2NIWIv2VRZjhMhK9SeM';
var PERSOAS_REVISION_PREVIEW_TEXTOS_SHEET_ID_ = 1317527542;

function obterFollaTextosPersoasPreview_() {
  var libro = SpreadsheetApp.openById(PERSOAS_REVISION_PREVIEW_SPREADSHEET_ID_);
  var folla = libro.getSheetById(PERSOAS_REVISION_PREVIEW_TEXTOS_SHEET_ID_);
  if (!folla || folla.getName() !== 'TextosLegais') {
    throw new Error('Non se atopou a folla TextosLegais de Preview');
  }
  return folla;
}

function textoPersoasPreviewBooleano_(valor) {
  if (valor === true) return true;
  var texto = String(valor == null ? '' : valor).trim().toLowerCase();
  return ['true', 'y', 'si', 'sí', 'yes', '1', 'verdadeiro'].indexOf(texto) >= 0;
}

function textoPersoasPreviewData_(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) return valor;
  var texto = String(valor == null ? '' : valor).trim();
  var m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(texto);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return null;
}

function obterTextoPersoasPreviewPorId_(idTexto) {
  var folla = obterFollaTextosPersoasPreview_();
  var valores = folla.getDataRange().getValues();
  if (valores.length < 2) throw new Error('TextosLegais de Preview non contén textos');

  var cabeceiras = valores[0].map(function(valor) { return String(valor || '').trim(); });
  var indice = function(nome) {
    var i = cabeceiras.indexOf(nome);
    if (i < 0) throw new Error('Falta a columna ' + nome + ' na folla TextosLegais de Preview');
    return i;
  };

  var iId = indice('Id');
  var iVersion = indice('Version');
  var iTitulo = indice('Titulo');
  var iTexto = indice('Texto');
  var iData = indice('DataVixencia');
  var iActivo = indice('Activo');
  var iAmbito = indice('Ambito');
  var agora = new Date();

  var candidatas = valores.slice(1).map(function(fila, orde) {
    return { fila: fila, orde: orde, data: textoPersoasPreviewData_(fila[iData]) };
  }).filter(function(item) {
    return String(item.fila[iId] || '').trim() === idTexto &&
      textoPersoasPreviewBooleano_(item.fila[iActivo]) &&
      item.data && item.data.getTime() <= agora.getTime();
  }).sort(function(a, b) {
    return b.data.getTime() - a.data.getTime() || b.orde - a.orde;
  });

  if (!candidatas.length) throw new Error('Non hai un texto activo para ' + idTexto + ' en Preview');

  var fila = candidatas[0].fila;
  var resultado = {
    id: String(fila[iId] || '').trim(),
    version: String(fila[iVersion] || '').trim(),
    titulo: String(fila[iTitulo] || '').trim(),
    texto: String(fila[iTexto] || '').trim(),
    ambito: String(fila[iAmbito] || '').trim(),
    dataVixencia: Utilities.formatDate(candidatas[0].data, 'Europe/Madrid', 'dd/MM/yyyy')
  };

  if (!resultado.version || !resultado.titulo || !resultado.texto) {
    throw new Error('O texto ' + idTexto + ' de Preview está incompleto');
  }
  return resultado;
}

function obterTextoExencionCotaPersoasAdmin_() {
  return obterTextoPersoasPreviewPorId_(PERSOAS_REVISION_EXENCION_COTA_ID_);
}

function obterTextoLegalPersoasAdministracion_(datos) {
  try {
    var correo = String(datos && datos.email || '').trim().toLowerCase();
    if (!correo) return { ok: false, erro: 'Non se puido identificar a conta administradora.' };

    var permiso = resolverPermisosPortal_(correo);
    if (!permiso || permiso.escritura !== true) {
      return { ok: false, erro: 'Usuario non autorizado' };
    }

    return {
      ok: true,
      textoLegal: obterTextoPersoasPreviewPorId_(PERSOAS_REVISION_TEXTO_LEGAL_ID_),
      textoExencionCota: obterTextoExencionCotaPersoasAdmin_(),
      entorno: 'PREVIEW'
    };
  } catch (erro) {
    console.error('Erro ao obter os textos de Persoas en Preview:', erro && erro.stack ? erro.stack : erro);
    return {
      ok: false,
      erro: erro && erro.message ? String(erro.message) : 'Non foi posible cargar os textos de Persoas en Preview'
    };
  }
}
