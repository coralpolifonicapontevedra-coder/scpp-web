/*
 * Administración > Persoas NOVO.
 * Backend independente para Preview, mantendo compatibilidade co fluxo de revisións.
 * Reutiliza só os helpers de lectura/autorización xa estables de persoas-administracion.js.
 */

var PERSOAS_NOVO_TEXTO_LEGAL_ID_ = 'DATOS_PERSOA_SCPP';

function persoasNovoListar_(datos) {
  var entrada = Object.assign({}, datos || {}, { incluirTextoLegalPersoas: true });
  return listarPersoasAdministracion_(entrada);
}

function persoasNovoCrear_(datos) {
  try {
    var email = normalizarEmailPersoasAdmin_(datos && datos.email);
    var contexto = obterContextoPersoasAdmin_();
    var valores = contexto.persoas.getDataRange().getValues();
    var administrador = obterAdministradorPersoasAdmin_(contexto, email, valores);
    if (!administrador) return { ok:false, erro:'Usuario non autorizado' };

    var cabeceiras = valores[0] || [];
    var indices = indicesPersoasAdmin_(cabeceiras);
    ['Row ID','Id','Nome','Primeiro apelido','Activo'].forEach(function(c){ requireHeaderPersoasAdmin_(indices,c,'Persoas'); });

    var entrada = persoasNovoLimparEntrada_(datos && (datos.persoa || datos.datos || {}));
    var invitacion = datos && datos.modo === 'invitacion';
    if (!entrada.nome) return { ok:false, erro:'O nome é obrigatorio' };
    if (!invitacion && !entrada.primeiroApelido) return { ok:false, erro:'O primeiro apelido é obrigatorio' };
    if (invitacion && !entrada.correo) return { ok:false, erro:'O correo é obrigatorio para unha invitación' };

    var conflito = persoasNovoDuplicado_(valores, indices, entrada, '');
    if (conflito) return { ok:false, erro:conflito };

    var fila = new Array(cabeceiras.length).fill('');
    var novoId = persoasNovoSeguinteId_(valores, indices);
    var rowId = Utilities.getUuid();
    persoasNovoPoñer_(fila, indices, 'Row ID', rowId);
    persoasNovoPoñer_(fila, indices, 'Id', novoId);
    persoasNovoAplicar_(fila, indices, entrada, true);
    persoasNovoPoñer_(fila, indices, 'Activo', 'Y');
    persoasNovoPoñer_(fila, indices, 'DataActualizacionPerfil', new Date());
    persoasNovoPoñer_(fila, indices, 'ActualizadoPor', administrador.email);
    if (indices.EstadoAlta !== undefined) fila[indices.EstadoAlta] = invitacion ? 'PENDENTE' : 'COMPLETA';
    persoasNovoNomeCompleto_(fila, indices);

    contexto.persoas.appendRow(fila);
    SpreadsheetApp.flush();
    return { ok:true, idPersoa:String(novoId), rowId:rowId, estadoAlta:invitacion?'PENDENTE':'COMPLETA', persoa:construirPersoaAdmin_(fila,indices) };
  } catch (erro) {
    console.error('persoasNovoCrear_:', erro && erro.stack ? erro.stack : erro);
    return { ok:false, erro:String(erro && erro.message ? erro.message : erro) };
  }
}

function persoasNovoActualizar_(datos) {
  try {
    var email = normalizarEmailPersoasAdmin_(datos && datos.email);
    var referencia = textoPersoasAdmin_(datos && (datos.idPersoa || datos.id || datos.rowId));
    if (!referencia) return { ok:false, erro:'Non se indicou a persoa' };
    var contexto = obterContextoPersoasAdmin_();
    var valores = contexto.persoas.getDataRange().getValues();
    var administrador = obterAdministradorPersoasAdmin_(contexto, email, valores);
    if (!administrador) return { ok:false, erro:'Usuario non autorizado' };
    var indices = indicesPersoasAdmin_(valores[0] || []);
    var indiceFila = persoasNovoAtoparFila_(valores, indices, referencia);
    if (indiceFila < 1) return { ok:false, erro:'Non se atopou a persoa' };

    var entrada = persoasNovoLimparEntrada_(datos && (datos.persoa || datos.datos || {}));
    var idActual = textoPersoasAdmin_(valores[indiceFila][indices.Id]);
    var conflito = persoasNovoDuplicado_(valores, indices, entrada, idActual);
    if (conflito) return { ok:false, erro:conflito };

    var filaOrixinal = valores[indiceFila].slice();
    var fila = filaOrixinal.slice();
    persoasNovoAplicar_(fila, indices, entrada, false);
    persoasNovoNomeCompleto_(fila, indices);
    persoasNovoPoñer_(fila, indices, 'DataActualizacionPerfil', new Date());
    persoasNovoPoñer_(fila, indices, 'ActualizadoPor', administrador.email);

    var aceptacionRexistrada = null;
    if (datos && datos.aceptacion) {
      var aceptacion = persoasNovoValidarAceptacion_(datos.aceptacion);
      aceptacionRexistrada = persoasNovoRexistrarAceptacion_(contexto, administrador, fila, indices, idActual, aceptacion);
    }

    if (indices.EstadoAlta !== undefined && datos && datos.completarAlta === true) fila[indices.EstadoAlta] = 'COMPLETA';
    contexto.persoas.getRange(indiceFila + 1, 1, 1, fila.length).setValues([fila]);
    SpreadsheetApp.flush();
    return { ok:true, idPersoa:idActual, persoa:construirPersoaAdmin_(fila,indices), aceptacion:aceptacionRexistrada };
  } catch (erro) {
    console.error('persoasNovoActualizar_:', erro && erro.stack ? erro.stack : erro);
    return { ok:false, erro:String(erro && erro.message ? erro.message : erro) };
  }
}

function persoasNovoEstado_(datos) {
  try {
    var email = normalizarEmailPersoasAdmin_(datos && datos.email);
    var referencia = textoPersoasAdmin_(datos && (datos.idPersoa || datos.id || datos.rowId));
    var contexto = obterContextoPersoasAdmin_();
    var valores = contexto.persoas.getDataRange().getValues();
    var administrador = obterAdministradorPersoasAdmin_(contexto, email, valores);
    if (!administrador) return { ok:false, erro:'Usuario non autorizado' };
    var indices = indicesPersoasAdmin_(valores[0] || []);
    var indiceFila = persoasNovoAtoparFila_(valores, indices, referencia);
    if (indiceFila < 1) return { ok:false, erro:'Non se atopou a persoa' };
    var fila = valores[indiceFila].slice();
    var activo = datos && datos.activo === true;
    persoasNovoPoñer_(fila, indices, 'Activo', activo ? 'Y' : 'N');
    persoasNovoPoñer_(fila, indices, 'DataActualizacionPerfil', new Date());
    persoasNovoPoñer_(fila, indices, 'ActualizadoPor', administrador.email);
    contexto.persoas.getRange(indiceFila + 1,1,1,fila.length).setValues([fila]);
    SpreadsheetApp.flush();
    return { ok:true, idPersoa:textoPersoasAdmin_(fila[indices.Id]), activo:activo, persoa:construirPersoaAdmin_(fila,indices) };
  } catch (erro) { return { ok:false, erro:String(erro && erro.message ? erro.message : erro) }; }
}

function persoasNovoCompletarAlta_(datos) {
  return persoasNovoActualizar_(Object.assign({}, dadosSeguro_(datos), { completarAlta:true, persoa:(datos && (datos.persoa || datos.datos)) || {} }));
}

function dadosSeguro_(datos) { return dadosClone_(datos || {}); }
function dadosClone_(obj) { var out={}; Object.keys(obj || {}).forEach(function(k){ out[k]=obj[k]; }); return out; }

/* Compatibilidade co módulo anterior e co endpoint de revisións. */
function crearPersoaAdministracion_(datos) { return persoasNovoCrear_(datos); }
function actualizarPersoaAdministracion_(datos) {
  var entrada = dadosSeguro_(datos);
  if (entrada.aceptacion) entrada.completarAlta = true;
  return persoasNovoActualizar_(entrada);
}
function cambiarEstadoPersoaAdministracion_(datos) { return persoasNovoEstado_(datos); }
function completarAltaPersoaAdministracion_(datos) { return persoasNovoActualizar_(Object.assign({}, dadosSeguro_(datos), { completarAlta:true })); }

function persoasNovoLimparEntrada_(entrada) {
  var fonte = entrada && typeof entrada === 'object' ? entrada : {};
  function t(k){ return Object.prototype.hasOwnProperty.call(fonte,k) ? textoPersoasAdmin_(fonte[k]) : undefined; }
  function b(k){ return Object.prototype.hasOwnProperty.call(fonte,k) ? fonte[k] === true : undefined; }
  return { nome:t('nome'), primeiroApelido:t('primeiroApelido'), segundoApelido:t('segundoApelido'), voz:t('voz'), nif:t('nif'), telefono:t('telefono'), correo:t('correo'), enderezo:t('enderezo'), cidade:t('cidade'), cp:t('cp'), cargo:t('cargo'), tipoSocio:t('tipoSocio'), dataNacemento:t('dataNacemento'), dataIncorporacion:t('dataIncorporacion'), contactoEmerxencia:t('contactoEmerxencia'), telefonoEmerxencia:t('telefonoEmerxencia'), preferenciaComunicacion:t('preferenciaComunicacion'), consentimentoFoto:t('consentimentoFoto'), observacions:t('observacions'), observacionsPrivadas:t('observacionsPrivadas'), mostrarWeb:b('mostrarWeb'), mostrarAniversario:b('mostrarAniversario') };
}

function persoasNovoAplicar_(fila, indices, entrada, alta) {
  var mapa={nome:'Nome',primeiroApelido:'Primeiro apelido',segundoApelido:'Segundo apelido',voz:'Voz',nif:'NIF',telefono:'Teléfono',correo:'Correo electrónico',enderezo:'Enderezo',cidade:'Cidade',cp:'CP',cargo:'Cargo',tipoSocio:'Tipo de socio',contactoEmerxencia:'ContactoEmerxencia',telefonoEmerxencia:'TelefonoEmerxencia',preferenciaComunicacion:'PreferenciaComunicacion',consentimentoFoto:'ConsentimentoFoto',observacions:'Observacións',observacionsPrivadas:'ObservacionsPrivadas'};
  Object.keys(mapa).forEach(function(k){ if (entrada[k] !== undefined) persoasNovoPoñer_(fila,indices,mapa[k],entrada[k]); });
  if (entrada.dataNacemento !== undefined) persoasNovoPoñer_(fila,indices,'DataNacemento',persoasNovoData_(entrada.dataNacemento));
  if (entrada.dataIncorporacion !== undefined) persoasNovoPoñer_(fila,indices,'DataIncorporacionSCPP',persoasNovoData_(entrada.dataIncorporacion));
  else if (alta) persoasNovoPoñer_(fila,indices,'DataIncorporacionSCPP',new Date());
  if (entrada.mostrarWeb !== undefined) persoasNovoPoñer_(fila,indices,'MostrarWeb',entrada.mostrarWeb?'Y':'N');
  if (entrada.mostrarAniversario !== undefined) persoasNovoPoñer_(fila,indices,'MostrarAniversario',entrada.mostrarAniversario?'Y':'N');
  if (alta && entrada.tipoSocio === undefined) persoasNovoPoñer_(fila,indices,'Tipo de socio','Cantor/a');
}
function persoasNovoNomeCompleto_(fila,indices){ var n=indices.Nome===undefined?'':textoPersoasAdmin_(fila[indices.Nome]); var p=indices['Primeiro apelido']===undefined?'':textoPersoasAdmin_(fila[indices['Primeiro apelido']]); var s=indices['Segundo apelido']===undefined?'':textoPersoasAdmin_(fila[indices['Segundo apelido']]); var c=[n,p,s].filter(Boolean).join(' '); if(indices.Nomecompleto!==undefined)fila[indices.Nomecompleto]=c; if(indices.NomeCompleto!==undefined)fila[indices.NomeCompleto]=c; }
function persoasNovoPoñer_(fila,indices,c,v){ if(indices[c]!==undefined) fila[indices[c]]=v; }
function persoasNovoData_(v){ var t=textoPersoasAdmin_(v); if(!t)return ''; var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(t); return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12,0,0):t; }
function persoasNovoSeguinteId_(valores,indices){ var max=0; for(var i=1;i<valores.length;i++){var n=Number(valores[i][indices.Id]);if(isFinite(n)&&n>max)max=n;} return max+1; }
function persoasNovoAtoparFila_(valores,indices,ref){ ref=textoPersoasAdmin_(ref); for(var i=1;i<valores.length;i++){var id=indices.Id===undefined?'':textoPersoasAdmin_(valores[i][indices.Id]);var row=indices['Row ID']===undefined?'':textoPersoasAdmin_(valores[i][indices['Row ID']]);if(ref===id||ref===row)return i;} return -1; }
function persoasNovoDuplicado_(valores,indices,e,idExcluir){ var correo=e.correo===undefined?'':normalizarEmailPersoasAdmin_(e.correo); var nif=e.nif===undefined?'':textoPersoasAdmin_(e.nif).replace(/\s+/g,'').toLowerCase(); for(var i=1;i<valores.length;i++){var id=indices.Id===undefined?'':textoPersoasAdmin_(valores[i][indices.Id]);if(idExcluir&&id===idExcluir)continue;if(correo&&indices['Correo electrónico']!==undefined&&normalizarEmailPersoasAdmin_(valores[i][indices['Correo electrónico']])===correo)return 'Xa existe unha persoa con ese correo electrónico';if(nif&&indices.NIF!==undefined&&textoPersoasAdmin_(valores[i][indices.NIF]).replace(/\s+/g,'').toLowerCase()===nif)return 'Xa existe unha persoa con ese NIF';} return ''; }

/* Texto legal e aceptación. */
function contextoAceptacionPersoasAdmin_(){ var p=PropertiesService.getScriptProperties(); var sid=p.getProperty('ACEPTACION_SPREADSHEET_ID'); var aid=Number(p.getProperty('ACEPTACION_SHEET_ID')); var tid=Number(p.getProperty('TEXTOS_LEGAIS_SHEET_ID')); if(!sid||!aid||!tid)throw new Error('Falta a configuración de Aceptación/TextosLegais'); var libro=SpreadsheetApp.openById(sid); var a=libro.getSheetById(aid), t=libro.getSheetById(tid); if(!a||!t)throw new Error('Non se atoparon Aceptación/TextosLegais'); return {aceptacion:a,textos:t}; }
function persoasNovoDataLegal_(v){ if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime()))return v;var t=textoPersoasAdmin_(v),m=/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(t);if(m)return new Date(Number(m[3]),Number(m[2])-1,Number(m[1]),12);m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(t);return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12):null;}
function obterTextoLegalPersoasAdmin_(versionSolicitada){ var c=contextoAceptacionPersoasAdmin_(),v=c.textos.getDataRange().getValues(),idx=indicesPersoasAdmin_(v[0]||[]),agora=new Date(),ver=textoPersoasAdmin_(versionSolicitada); ['Id','Version','Titulo','Texto','DataVixencia','Activo','Ambito'].forEach(function(h){requireHeaderPersoasAdmin_(idx,h,'TextosLegais');}); var cand=v.slice(1).map(function(f,i){return{f:f,i:i,d:persoasNovoDataLegal_(f[idx.DataVixencia])};}).filter(function(x){return textoPersoasAdmin_(x.f[idx.Id])===PERSOAS_NOVO_TEXTO_LEGAL_ID_&&x.d&&x.d<=agora&&(ver?textoPersoasAdmin_(x.f[idx.Version])===ver:booleanoPersoasAdmin_(x.f[idx.Activo]));}).sort(function(a,b){return b.d-a.d||b.i-a.i;}); if(!cand.length)throw new Error('Non hai texto legal activo para Persoas'); var f=cand[0].f;return{id:textoPersoasAdmin_(f[idx.Id]),version:textoPersoasAdmin_(f[idx.Version]),titulo:textoPersoasAdmin_(f[idx.Titulo]),texto:textoPersoasAdmin_(f[idx.Texto]),ambito:textoPersoasAdmin_(f[idx.Ambito]),dataVixencia:Utilities.formatDate(cand[0].d,'Europe/Madrid','dd/MM/yyyy')}; }
function persoasNovoValidarAceptacion_(a){ if(!a||a.aceptaFines!==true)throw new Error('É necesario confirmar a aceptación do tratamento de datos'); var id=textoPersoasAdmin_(a.idTextoLegal),ver=textoPersoasAdmin_(a.version),rev=textoPersoasAdmin_(a.revisionId),doc=textoPersoasAdmin_(a.documento);if(id!==PERSOAS_NOVO_TEXTO_LEGAL_ID_||!ver||!rev||!doc)throw new Error('A aceptación legal está incompleta');return{idTextoLegal:id,version:ver,revisionId:rev,documento:doc,xeradaPor:normalizarEmailPersoasAdmin_(a.xeradaPor),textoLegal:obterTextoLegalPersoasAdmin_(ver)}; }
function persoasNovoRexistrarAceptacion_(contexto,admin,filaPersoa,ip,idPersoa,a){ var f=contextoAceptacionPersoasAdmin_(),v=f.aceptacion.getDataRange().getValues(),idx=indicesPersoasAdmin_(v[0]||[]); ['Row ID','Correo electrónico','Fecha_Hora','Versión','Texto_Legal','Acepta_Fines','Persoa','UsuarioWeb','Ambito','Canle','DataRetirada','TipoAceptacion','Estado','Documento','Observacións','Responsable'].forEach(function(h){requireHeaderPersoasAdmin_(idx,h,'Aceptación');}); var marcador='Revisión '+a.revisionId; for(var i=1;i<v.length;i++){if(textoPersoasAdmin_(v[i][idx.Persoa])===idPersoa&&textoPersoasAdmin_(v[i][idx['Observacións']]).indexOf(marcador)>=0)return{rowId:textoPersoasAdmin_(v[i][idx['Row ID']]),version:textoPersoasAdmin_(v[i][idx['Versión']]),documento:textoPersoasAdmin_(v[i][idx.Documento]),revisionId:a.revisionId,existente:true};} var correo=ip['Correo electrónico']===undefined?'':normalizarEmailPersoasAdmin_(filaPersoa[ip['Correo electrónico']]); var nova=new Array(v[0].length).fill(''),rowId=Utilities.getUuid(),agora=new Date(); function put(h,val){nova[idx[h]]=val;} put('Row ID',rowId);put('Correo electrónico',correo);put('Fecha_Hora',agora);put('Versión',a.textoLegal.version);put('Texto_Legal',a.textoLegal.texto);put('Acepta_Fines',true);put('Persoa',idPersoa);put('UsuarioWeb','');put('Ambito',a.textoLegal.ambito);put('Canle','Web · revisión de datos');put('TipoAceptacion','Tratamento de datos persoais');put('Estado','Aceptada');put('Documento',a.documento);put('Observacións',marcador+' · Ligazón xerada por '+(a.xeradaPor||admin.email));put('Responsable','Persoa interesada');f.aceptacion.appendRow(nova);SpreadsheetApp.flush();return{rowId:rowId,version:a.textoLegal.version,documento:a.documento,revisionId:a.revisionId,existente:false}; }
