/** Módulo de recepción das solicitudes públicas da web. Código común Preview/Produción. */
function rexistrarSolicitudeWeb_(datos) {
  datos = datos || {};
  var nome = limparSolicitude_(datos.nomeCompleto, 140);
  var correo = limparSolicitude_(datos.correoElectronico, 160).toLowerCase();
  var mensaxe = limparSolicitude_(datos.mensaxe, 4000);
  var orixe = limparSolicitude_(datos.orixe, 30);
  var tipo = limparSolicitude_(datos.tipoSolicitude, 80);
  if (!nome || !correo || !mensaxe || !orixe || !tipo) return { ok:false, erro:'Faltan datos obrigatorios na solicitude' };
  if (datos.aceptacionProteccionDatos !== true) return { ok:false, erro:'Non consta a aceptación da protección de datos' };
  var contexto = obterContextoSolicitudes_(), folla = contexto.folla;
  var cabeceiras = folla.getRange(1,1,1,folla.getLastColumn()).getDisplayValues()[0].map(function(v){ return String(v || '').trim(); });
  var rowId = Utilities.getUuid(), agora = new Date(), idSolicitude = crearIdSolicitude_(agora,rowId);
  var valores = {'Row ID':rowId,'Id_Solicitude':idSolicitude,'DataHora':agora,'Orixe':orixe,'TipoSolicitude':tipo,'NomeCompleto':nome,'CorreoElectronico':correo,'Telefono':limparSolicitude_(datos.telefono,40),'Entidade':limparSolicitude_(datos.entidade,180),'CordaPreferente':limparSolicitude_(datos.cordaPreferente,40),'ExperienciaCoral':limparSolicitude_(datos.experienciaCoral,1200),'Mensaxe':mensaxe,'Estado':'Nova','Prioridade':'Normal','AvisoEnviado':false,'DataAviso':'','DataContacto':'','AtendidaPor':'','DataPeche':'','ObservacionsInternas':'','AceptacionProteccionDatos':true,'VersionTextoLegal':limparSolicitude_(datos.versionTextoLegal,80),'FonteEntrada':limparSolicitude_(datos.fonteEntrada,40)||'Web pública','Id_Interesado':'','Id_Colaboracion':'','ReferenciaTecnica':limparSolicitude_(datos.referenciaTecnica,300)};
  folla.appendRow(cabeceiras.map(function(c){ return Object.prototype.hasOwnProperty.call(valores,c) ? valores[c] : ''; }));
  var numeroFila = folla.getLastRow(), avisoEnviado = false, avisoErro = '';
  try { enviarAvisoSolicitude_(contexto,valores); avisoEnviado=true; actualizarCampoSolicitude_(folla,cabeceiras,numeroFila,'AvisoEnviado',true); actualizarCampoSolicitude_(folla,cabeceiras,numeroFila,'DataAviso',new Date()); }
  catch (e) { avisoErro=String((e&&e.message)||e); console.error('Non se puido enviar o aviso de SolicitudesWeb: '+avisoErro); }
  SpreadsheetApp.flush();
  return { ok:true,rowId:rowId,idSolicitude:idSolicitude,avisoEnviado:avisoEnviado,mensaxe:'A túa solicitude foi recibida correctamente',aviso:avisoErro?'A solicitude gardouse, pero o aviso interno quedou pendente':'' };
}
function obterContextoSolicitudes_(){ var p=PropertiesService.getScriptProperties(), spreadsheetId=String(p.getProperty('SOLICITUDES_SPREADSHEET_ID')||'').trim(), sheetId=Number(p.getProperty('SOLICITUDES_SHEET_ID')); if(!spreadsheetId||!sheetId)throw new Error('Falta configurar SolicitudesWeb mediante Script Properties'); var libro=SpreadsheetApp.openById(spreadsheetId), folla=libro.getSheetById(sheetId); if(!folla||folla.getName()!=='SolicitudesWeb')throw new Error('Non se atopou a folla SolicitudesWeb co ID configurado'); return {libro:libro,folla:folla,propiedades:p}; }
function enviarAvisoSolicitude_(contexto,valores){ var destino=String(contexto.propiedades.getProperty('SOLICITUDES_NOTIFY_EMAIL')||'').trim(); if(!destino)throw new Error('Falta SOLICITUDES_NOTIFY_EMAIL nas Script Properties'); var asunto='Nova solicitude web: '+valores.TipoSolicitude, enlace=contexto.libro.getUrl(); var html='<p>Recibiuse unha nova solicitude desde a web da SCPP.</p><p><strong>Referencia:</strong> '+escaparHtmlSolicitude_(valores.Id_Solicitude)+'<br><strong>Orixe:</strong> '+escaparHtmlSolicitude_(valores.Orixe)+'<br><strong>Tipo:</strong> '+escaparHtmlSolicitude_(valores.TipoSolicitude)+'<br><strong>Nome:</strong> '+escaparHtmlSolicitude_(valores.NomeCompleto)+'<br><strong>Correo:</strong> '+escaparHtmlSolicitude_(valores.CorreoElectronico)+'<br><strong>Teléfono:</strong> '+escaparHtmlSolicitude_(valores.Telefono||'Non indicado')+'<br><strong>Entidade:</strong> '+escaparHtmlSolicitude_(valores.Entidade||'Non indicada')+'</p><p><strong>Mensaxe:</strong><br>'+escaparHtmlSolicitude_(valores.Mensaxe).replace(/\n/g,'<br>')+'</p><p><a href="'+enlace+'">Abrir SolicitudesWeb</a></p>'; MailApp.sendEmail({to:destino,replyTo:valores.CorreoElectronico,subject:asunto,htmlBody:html,name:'Web da Sociedade Coral Polifónica de Pontevedra'}); }
function actualizarCampoSolicitude_(folla,cabeceiras,fila,nomeCampo,valor){ var i=cabeceiras.indexOf(nomeCampo); if(i!==-1)folla.getRange(fila,i+1).setValue(valor); }
function crearIdSolicitude_(data,rowId){ return 'SOL-'+Utilities.formatDate(data,'Europe/Madrid','yyyyMMdd')+'-'+String(rowId).replace(/-/g,'').slice(0,8).toUpperCase(); }
function limparSolicitude_(valor,maximo){ return String(valor==null?'':valor).trim().slice(0,maximo||5000); }
function escaparHtmlSolicitude_(valor){ return String(valor==null?'':valor).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
