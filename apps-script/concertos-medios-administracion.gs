/* Medios de Administración → Concertos. Mesmo código en Preview e Produción. */
function actualizarMedioConcertoAdministracionPortal_(datos){
  var email=textoEnsaiosPortal_(datos&&datos.email).toLowerCase();
  var permiso=permisoConcertosAdministracionPortal_(email);
  if(!permiso.escritura)return{ok:false,codigo:'FORBIDDEN',erro:'Usuario non autorizado para modificar medios do concerto'};
  var id=textoEnsaiosPortal_(datos&&datos.idConcerto);
  var tipo=textoEnsaiosPortal_(datos&&datos.tipo).toLowerCase();
  var nomeFicheiro=textoEnsaiosPortal_(datos&&datos.nomeFicheiro);
  if(!id||['cartel','triptico'].indexOf(tipo)<0||!nomeFicheiro)return{ok:false,codigo:'VALIDATION',erro:'Datos do medio incompletos'};
  if(nomeFicheiro.length>220||/[\\/\r\n]/.test(nomeFicheiro))return{ok:false,codigo:'VALIDATION',erro:'Nome de ficheiro non válido'};
  var cfg=configuracionConcertosAdministracionPortal_();
  var t=filasEnsaiosAdministracionPortal_(cfg.concertosId,'Concertos','CONCERTOS_SPREADSHEET_ID');
  var row=t.rows.find(function(r){return textoEnsaiosPortal_(campoEnsaiosPortal_(r,['Id','Id_Concerto','IdConcerto']))===id;});
  if(!row)return{ok:false,codigo:'NOT_FOUND',erro:'Non se atopou o concerto indicado'};
  var indice=indiceHeaderEnsaiosPortal_(t.headers,tipo==='cartel'?['Cartel']:['Triptico','Tríptico']);
  if(indice<0)return{ok:false,codigo:'SCHEMA',erro:'A folla Concertos non ten a columna '+(tipo==='cartel'?'Cartel':'Triptico')};
  t.sheet.getRange(row.__row,indice+1).setValue(nomeFicheiro);
  SpreadsheetApp.flush();
  return{ok:true,resultado:{idConcerto:id,tipo:tipo,nomeFicheiro:nomeFicheiro,actualizadoPor:email}};
}
