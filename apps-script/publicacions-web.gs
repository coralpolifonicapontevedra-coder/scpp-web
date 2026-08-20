/** Publicacións visibles na páxina pública de Actualidade. Código común Preview/Produción. */
function listarPublicacionsWeb_() {
  var p = PropertiesService.getScriptProperties();
  var spreadsheetId = String(p.getProperty('PUBLICACIONS_SPREADSHEET_ID') || '').trim();
  var sheetName = String(p.getProperty('PUBLICACIONS_SHEET_NAME') || 'Publicacións').trim();
  if (!spreadsheetId) throw new Error('Falta PUBLICACIONS_SPREADSHEET_ID nas Script Properties');
  var folla = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
  if (!folla) throw new Error('Non se atopou a pestana ' + sheetName + '.');
  var valores = folla.getDataRange().getValues();
  if (valores.length < 2) return { ok: true, publicacions: [] };
  var cabeceiras = valores[0].map(function(v){ return String(v || '').trim(); });
  var indice = function(nome){ return cabeceiras.indexOf(nome); };
  var columnas = { id:indice('Id'), data:indice('Data'), titulo:indice('Título'), tipo:indice('Tipo'), medio:indice('Medio'), mostrarWeb:indice('MostrarWeb'), destacada:indice('Destacada'), rutaWeb:indice('RutaWeb') };
  var faltan = Object.keys(columnas).filter(function(k){ return columnas[k] === -1; });
  if (faltan.length) throw new Error('Faltan columnas obrigatorias en Publicacións: ' + faltan.join(', '));
  var zonaHoraria = Session.getScriptTimeZone() || 'Europe/Madrid';
  var publicacions = valores.slice(1).filter(function(fila){ return valorBooleanoPublicacions_(fila[columnas.mostrarWeb]) && String(fila[columnas.titulo] || '').trim() && String(fila[columnas.rutaWeb] || '').trim(); }).map(function(fila){ return { id:String(fila[columnas.id] || '').trim(), titulo:String(fila[columnas.titulo] || '').trim(), tipo:String(fila[columnas.tipo] || '').trim(), medio:String(fila[columnas.medio] || '').trim(), data:formatarDataPublicacion_(fila[columnas.data], zonaHoraria), destacada:valorBooleanoPublicacions_(fila[columnas.destacada]), rutaWeb:String(fila[columnas.rutaWeb] || '').trim() }; }).sort(function(a,b){ return String(b.data).localeCompare(String(a.data)); });
  return { ok:true, publicacions:publicacions };
}
function valorBooleanoPublicacions_(valor){ if(valor===true)return true; return ['true','verdadero','verdadeiro','si','sí','yes','y','1'].indexOf(String(valor || '').trim().toLowerCase()) !== -1; }
function formatarDataPublicacion_(valor,zonaHoraria){ if(!valor)return ''; if(Object.prototype.toString.call(valor)==='[object Date]'&&!isNaN(valor.getTime()))return Utilities.formatDate(valor,zonaHoraria,'yyyy-MM-dd'); var texto=String(valor || '').trim(); if(/^\d{4}-\d{2}-\d{2}$/.test(texto))return texto; var europea=texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return europea ? europea[3]+'-'+europea[2].padStart(2,'0')+'-'+europea[1].padStart(2,'0') : texto; }
