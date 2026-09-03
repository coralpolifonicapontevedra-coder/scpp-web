/* Texto legal específico para as revisións de datos de Persoas.
 * Acción illada: non modifica a listaxe nin as escrituras de Persoas.
 */

var PERSOAS_REVISION_TEXTO_LEGAL_ID_ = 'DATOS_PERSOA_SCPP';

function obterTextoLegalPersoasAdministracion_(datos) {
  try {
    var correo = String(datos && datos.email || '').trim().toLowerCase();
    if (!correo) {
      return { ok: false, erro: 'Non se puido identificar a conta administradora.' };
    }

    var permiso = resolverPermisosPortal_(correo);
    if (!permiso || permiso.escritura !== true) {
      return { ok: false, erro: 'Usuario non autorizado' };
    }

    var libro = SpreadsheetApp.openById(ACEPTACION_SPREADSHEET_ID_);
    var folla = libro.getSheetById(TEXTOS_LEGAIS_SHEET_ID_);
    if (!folla || folla.getName() !== 'TextosLegais') {
      throw new Error('Non se atopou a folla TextosLegais configurada');
    }

    var valores = folla.getDataRange().getValues();
    if (valores.length < 2) throw new Error('TextosLegais non contén textos');

    var cabeceiras = valores[0].map(function(valor) { return String(valor || '').trim(); });
    var indice = function(nome) {
      var i = cabeceiras.indexOf(nome);
      if (i < 0) throw new Error('Falta a columna ' + nome + ' na folla TextosLegais');
      return i;
    };

    var iId = indice('Id');
    var iVersion = indice('Version');
    var iTitulo = indice('Titulo');
    var iTexto = indice('Texto');
    var iData = indice('DataVixencia');
    var iActivo = indice('Activo');
    var iAmbito = indice('Ambito');

    function booleano(valor) {
      if (valor === true) return true;
      var texto = String(valor == null ? '' : valor).trim().toLowerCase();
      return ['true', 'y', 'si', 'sí', 'yes', '1', 'verdadeiro'].indexOf(texto) >= 0;
    }

    function dataLegal(valor) {
      if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) return valor;
      var texto = String(valor == null ? '' : valor).trim();
      var m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(texto);
      if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
      m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
      return null;
    }

    var agora = new Date();
    var candidatas = valores.slice(1).map(function(fila, orde) {
      return { fila: fila, orde: orde, data: dataLegal(fila[iData]) };
    }).filter(function(item) {
      return String(item.fila[iId] || '').trim() === PERSOAS_REVISION_TEXTO_LEGAL_ID_ &&
        booleano(item.fila[iActivo]) &&
        item.data && item.data.getTime() <= agora.getTime();
    }).sort(function(a, b) {
      return b.data.getTime() - a.data.getTime() || b.orde - a.orde;
    });

    if (!candidatas.length) {
      return { ok: false, erro: 'Non hai un texto legal activo para Persoas' };
    }

    var fila = candidatas[0].fila;
    var textoLegal = {
      id: String(fila[iId] || '').trim(),
      version: String(fila[iVersion] || '').trim(),
      titulo: String(fila[iTitulo] || '').trim(),
      texto: String(fila[iTexto] || '').trim(),
      ambito: String(fila[iAmbito] || '').trim(),
      dataVixencia: Utilities.formatDate(candidatas[0].data, 'Europe/Madrid', 'dd/MM/yyyy')
    };

    if (!textoLegal.version || !textoLegal.titulo || !textoLegal.texto) {
      return { ok: false, erro: 'O texto legal de Persoas está incompleto' };
    }

    return { ok: true, textoLegal: textoLegal };
  } catch (erro) {
    console.error('Erro ao obter o texto legal de Persoas:', erro && erro.stack ? erro.stack : erro);
    return {
      ok: false,
      erro: erro && erro.message ? String(erro.message) : 'Non foi posible cargar o texto legal de Persoas'
    };
  }
}
