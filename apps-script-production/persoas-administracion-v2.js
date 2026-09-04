/*
 * Administración > Persoas V2 · PRODUCIÓN.
 *
 * Contrato:
 * - Persoas (Sheet) é a fonte de verdade dos datos de negocio.
 * - R2 é copia operativa/caché e almacén de ficheiros; a sincronización R2
 *   realízase no Worker despois de cada escritura e tamén tras edición manual.
 * - Usa os niveis do módulo Persoas en PermisosPortal.
 * - Mantén intactas as funcións legacy para non romper revisións nin Perfil.
 */

var PERSOAS_V2_CONFIG_ = {
  spreadsheetId: '13-WeSz69A50XxPP57HA64Nascx6kXQFbeVKron0wATQ',
  sheetId: 388888827,
  usuariosSpreadsheetId: '1qbW0q1Z6U3JnW0yGM4ELUWqjRkyNdJckJx0VGSoK-i8',
  usuariosSheetName: 'UsuariosWeb',
  aceptacionSpreadsheetId: '1gndQQ1AFQLtg2lUU8ANa5ksU3U6wZNxJI2Ye6z7Mu7k',
  aceptacionSheetId: 974695665,
  textosLegaisSheetId: 2025412208,
  syncUrl: 'https://scpp-web.pages.dev/api/persoas-cache-sync',
  versionProperty: 'PERSOAS_V2_VERSION',
  triggerHandler: 'persoasV2OnEdit_'
};

var PERSOAS_V2_NIVEIS_ = ['sen_acceso','lectura','escritura','administracion'];
var PERSOAS_V2_TEXTO_DATOS_ = 'DATOS_PERSOA_SCPP';
var PERSOAS_V2_TEXTO_COTA_ = 'EXENCION_COTA_SCPP';

var PERSOAS_V2_FIELDS_ = [
  { key:'nome', header:'Nome', label:'Nome', type:'text', required:true, section:'persoa' },
  { key:'primeiroApelido', header:'Primeiro apelido', label:'Primeiro apelido', type:'text', required:true, section:'persoa' },
  { key:'segundoApelido', header:'Segundo apelido', label:'Segundo apelido', type:'text', section:'persoa' },
  { key:'nif', header:'NIF', label:'NIF', type:'text', section:'persoa' },
  { key:'dataNacemento', header:'DataNacemento', label:'Data de nacemento', type:'date', section:'persoa' },
  { key:'telefono', header:'Teléfono', label:'Teléfono', type:'tel', section:'contacto' },
  { key:'correo', header:'Correo electrónico', label:'Correo electrónico', type:'email', section:'contacto' },
  { key:'enderezo', header:'Enderezo', label:'Enderezo', type:'text', wide:true, section:'contacto' },
  { key:'cidade', header:'Cidade', label:'Cidade', type:'text', section:'contacto' },
  { key:'cp', header:'CP', label:'Código postal', type:'text', section:'contacto' },
  { key:'voz', header:'Voz', label:'Voz', type:'enum', section:'coral' },
  { key:'tipoSocio', header:'Tipo de socio', label:'Tipo de socio', type:'enum', section:'coral' },
  { key:'cargo', header:'Cargo', label:'Cargo actual', type:'enum', wide:true, section:'coral' },
  { key:'dataIncorporacion', header:'DataIncorporacionSCPP', label:'Data de incorporación', type:'date', section:'coral' },
  { key:'preferenciaComunicacion', header:'PreferenciaComunicacion', label:'Preferencia de comunicación', type:'enum', section:'coral' },
  { key:'contactoEmerxencia', header:'ContactoEmerxencia', label:'Persoa de contacto', type:'text', wide:true, section:'emerxencia' },
  { key:'telefonoEmerxencia', header:'TelefonoEmerxencia', label:'Teléfono de emerxencia', type:'tel', section:'emerxencia' },
  { key:'consentimentoFoto', header:'ConsentimentoFoto', label:'Consentimento de fotografía', type:'enum', section:'privacidade' },
  { key:'mostrarWeb', header:'MostrarWeb', label:'Mostrar na web cando corresponda', type:'boolean', section:'privacidade' },
  { key:'mostrarAniversario', header:'MostrarAniversario', label:'Mostrar aniversario', type:'boolean', section:'privacidade' },
  { key:'observacions', header:'Observacións', label:'Observacións', type:'textarea', wide:true, section:'interno' },
  { key:'observacionsPrivadas', header:'ObservacionsPrivadas', label:'Observacións privadas', type:'textarea', wide:true, section:'interno' }
];

function persoasV2Texto_(v) {
  return String(v == null ? '' : v).trim();
}

function persoasV2Email_(v) {
  return persoasV2Texto_(v).toLowerCase();
}

function persoasV2Normal_(v) {
  return persoasV2Texto_(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function persoasV2Bool_(v) {
  if (v === true) return true;
  return ['true','y','si','sí','yes','1','verdadeiro','x'].indexOf(persoasV2Normal_(v)) >= 0;
}

function persoasV2Indices_(headers) {
  var out = {};
  (headers || []).forEach(function(v, i) { out[persoasV2Texto_(v)] = i; });
  return out;
}

function persoasV2Sheet_() {
  var sh = SpreadsheetApp.openById(PERSOAS_V2_CONFIG_.spreadsheetId).getSheetById(PERSOAS_V2_CONFIG_.sheetId);
  if (!sh || sh.getName() !== 'Persoas') throw new Error('Non se atopou a folla Persoas de Producción.');
  return sh;
}

function persoasV2VersionActual_() {
  var props = PropertiesService.getScriptProperties();
  var value = persoasV2Texto_(props.getProperty(PERSOAS_V2_CONFIG_.versionProperty));
  if (!value) {
    value = String(Date.now()) + '-' + Utilities.getUuid();
    props.setProperty(PERSOAS_V2_CONFIG_.versionProperty, value);
  }
  return value;
}

function persoasV2MarcarVersion_() {
  var value = String(Date.now()) + '-' + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty(PERSOAS_V2_CONFIG_.versionProperty, value);
  return value;
}

function persoasV2Nivel_(email) {
  var correo = persoasV2Email_(email);
  if (!correo) return { nivel:'sen_acceso', fonte:'sen-email', explicito:false };

  try {
    var permisos = permisosXestionPortal_();
    var especifico = permisos.find(function(p) {
      return p && p.activo !== false && pessoasV2EmailCompat_(p.email) === correo && pessoasV2TextoCompat_(p.modulo).toLowerCase() === 'persoas' && !pessoasV2TextoCompat_(p.contido);
    });
    if (especifico) {
      var nivel = persoasV2Texto_(especifico.nivel).toLowerCase();
      if (PERSOAS_V2_NIVEIS_.indexOf(nivel) < 0) nivel = 'sen_acceso';
      return { nivel:nivel, fonte:'PermisosPortal', explicito:true };
    }
  } catch (erroPermisos) {
    console.warn('Non se puido consultar PermisosPortal para Persoas: ' + String(erroPermisos && erroPermisos.message ? erroPermisos.message : erroPermisos));
  }

  /* Compatibilidade: mentres non exista permiso específico, a gobernanza histórica
   * conserva o acceso que xa tiña ao módulo. En canto exista unha fila Persoas en
   * PermisosPortal, esa fila manda. */
  try {
    var legacy = resolverPermisosPortal_(correo);
    if (legacy && legacy.escritura === true) return { nivel:'administracion', fonte:legacy.fonte || 'Gobernanza', explicito:false };
    if (legacy && legacy.autorizado === true) return { nivel:'lectura', fonte:legacy.fonte || 'Gobernanza', explicito:false };
  } catch (erroLegacy) {
    console.warn('Non se puido resolver o permiso legacy de Persoas: ' + String(erroLegacy && erroLegacy.message ? erroLegacy.message : erroLegacy));
  }
  return { nivel:'sen_acceso', fonte:'PermisosPortal', explicito:false };
}

/* Compatibilidade con valores devoltos por xestion-permisos-portal.js. */
function pessoasV2EmailCompat_(v) { return persoasV2Email_(v); }
function pessoasV2TextoCompat_(v) { return persoasV2Texto_(v); }

function persoasV2Autorizar_(datos, minimo) {
  var correo = persoasV2Email_(datos && (datos.actorEmail || datos.email));
  var permiso = persoasV2Nivel_(correo);
  var rango = { sen_acceso:0, lectura:1, escritura:2, administracion:3 };
  var precisa = rango[minimo] == null ? 1 : rango[minimo];
  if ((rango[permiso.nivel] || 0) < precisa) {
    return {
      ok:false,
      codigo:minimo === 'administracion' ? 'ADMIN_REQUIRED' : (minimo === 'escritura' ? 'WRITE_REQUIRED' : 'READ_REQUIRED'),
      erro:minimo === 'administracion'
        ? 'Esta operación require nivel de administración no módulo Persoas.'
        : (minimo === 'escritura' ? 'Non tes permiso de escritura no módulo Persoas.' : 'Non tes permiso de lectura no módulo Persoas.'),
      permiso:permiso
    };
  }
  return { ok:true, email:correo, permiso:permiso };
}

function persoasV2DataIso_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Europe/Madrid', 'yyyy-MM-dd');
  }
  var t = persoasV2Texto_(v);
  if (!t) return '';
  var iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return t;
  var gl = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(t);
  if (gl) return gl[3] + '-' + String(gl[2]).padStart(2, '0') + '-' + String(gl[1]).padStart(2, '0');
  return t;
}

function persoasV2DataValor_(v) {
  var t = persoasV2Texto_(v);
  if (!t) return '';
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0) : t;
}

function persoasV2Construir_(row, ix) {
  function val(h) { return ix[h] === undefined ? '' : row[ix[h]]; }
  function txt(h) { return persoasV2Texto_(val(h)); }
  var nome = txt('Nome');
  var primeiro = txt('Primeiro apelido');
  var segundo = txt('Segundo apelido');
  var completo = txt('Nomecompleto') || txt('NomeCompleto') || [nome, primeiro, segundo].filter(Boolean).join(' ');
  var id = txt('Id');
  var rowId = txt('Row ID');
  var fichaR2Key = txt('FichaR2Key');
  var fichaR2Estado = txt('FichaR2Estado');

  return {
    rowId: rowId || id,
    id: id,
    idPersoa: id,
    etiqueta: [primeiro, segundo].filter(Boolean).join(' ') + (nome ? ', ' + nome : ''),
    nomeCompleto: completo,
    nome: nome,
    primeiroApelido: primeiro,
    segundoApelido: segundo,
    voz: txt('Voz'),
    mostrarWeb: persoasV2Bool_(val('MostrarWeb')),
    nif: txt('NIF'),
    telefono: txt('Teléfono'),
    correo: txt('Correo electrónico'),
    enderezo: txt('Enderezo'),
    cidade: txt('Cidade'),
    cp: txt('CP'),
    observacions: txt('Observacións'),
    activo: persoasV2Bool_(val('Activo')),
    cargo: txt('Cargo'),
    tipoSocio: txt('Tipo de socio'),
    fotoPerfilLegacy: txt('FotoPerfil'),
    dataNacemento: persoasV2DataIso_(val('DataNacemento')),
    contactoEmerxencia: txt('ContactoEmerxencia'),
    telefonoEmerxencia: txt('TelefonoEmerxencia'),
    preferenciaComunicacion: txt('PreferenciaComunicacion'),
    consentimentoFoto: txt('ConsentimentoFoto'),
    mostrarAniversario: persoasV2Bool_(val('MostrarAniversario')),
    observacionsPrivadas: txt('ObservacionsPrivadas'),
    dataIncorporacion: persoasV2DataIso_(val('DataIncorporacionSCPP')),
    ficha: txt('Ficha'),
    fichaR2Key: fichaR2Key,
    fichaR2Estado: fichaR2Estado,
    fichaDisponibleR2: Boolean(fichaR2Key) && fichaR2Estado === 'SINCRONIZADO'
  };
}

function persoasV2Comparar_(a, b) {
  var aa = [a.primeiroApelido, a.segundoApelido, a.nome].map(persoasV2Texto_).join(' ');
  var bb = [b.primeiroApelido, b.segundoApelido, b.nome].map(persoasV2Texto_).join(' ');
  return aa.localeCompare(bb, 'gl', { sensitivity:'base' });
}

function persoasV2OpcionsValidacion_(sheet, columnIndex, rowCount) {
  try {
    if (rowCount < 2) return [];
    var validations = sheet.getRange(2, columnIndex + 1, Math.max(rowCount - 1, 1), 1).getDataValidations();
    for (var i = 0; i < validations.length; i++) {
      var rule = validations[i][0];
      if (!rule) continue;
      var type = rule.getCriteriaType();
      var values = rule.getCriteriaValues();
      if (type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST && values && Array.isArray(values[0])) {
        return values[0].map(persoasV2Texto_).filter(Boolean);
      }
      if (type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE && values && values[0] && typeof values[0].getDisplayValues === 'function') {
        return values[0].getDisplayValues().reduce(function(out, row) { return out.concat(row); }, []).map(persoasV2Texto_).filter(Boolean);
      }
    }
  } catch (erroValidacion) {
    console.warn('Non se puido ler a validación da columna ' + columnIndex + ': ' + String(erroValidacion));
  }
  return [];
}

function persoasV2OpcionsValores_(values, index) {
  var seen = {};
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var value = persoasV2Texto_(values[i][index]);
    if (!value) continue;
    var key = persoasV2Normal_(value);
    if (seen[key]) continue;
    seen[key] = true;
    out.push(value);
  }
  out.sort(function(a,b) { return a.localeCompare(b, 'gl', { sensitivity:'base' }); });
  return out;
}

function persoasV2Schema_(sheet, values, ix) {
  return {
    version:1,
    source:'Persoas',
    fields:PERSOAS_V2_FIELDS_.reduce(function(out, field) {
      var index = ix[field.header];
      if (index === undefined) return out;
      var item = {
        key:field.key,
        header:field.header,
        label:field.label,
        type:field.type,
        required:field.required === true,
        wide:field.wide === true,
        section:field.section || 'persoa'
      };
      if (field.type === 'enum') {
        var options = persoasV2OpcionsValidacion_(sheet, index, values.length);
        if (!options.length) options = persoasV2OpcionsValores_(values, index);
        item.options = options;
      }
      out.push(item);
      return out;
    }, [])
  };
}

function persoasV2TextoLegal_(id) {
  var sh = SpreadsheetApp.openById(PERSOAS_V2_CONFIG_.aceptacionSpreadsheetId).getSheetById(PERSOAS_V2_CONFIG_.textosLegaisSheetId);
  if (!sh) return null;
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return null;
  var ix = persoasV2Indices_(values[0]);
  var now = new Date(); now.setHours(23,59,59,999);
  var candidates = values.slice(1).reduce(function(out, row) {
    if (persoasV2Texto_(row[ix.Id]) !== id) return out;
    if (ix.Activo !== undefined && !persoasV2Bool_(row[ix.Activo])) return out;
    var vigencia = ix.DataVixencia === undefined ? null : row[ix.DataVixencia];
    var date = vigencia instanceof Date ? vigencia : null;
    if (!date) {
      var iso = persoasV2DataIso_(vigencia);
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      if (m) date = new Date(Number(m[1]), Number(m[2])-1, Number(m[3]), 12, 0, 0);
    }
    if (date && date > now) return out;
    out.push({
      id:id,
      version:ix.Version === undefined ? '' : persoasV2Texto_(row[ix.Version]),
      titulo:ix.Titulo === undefined ? '' : persoasV2Texto_(row[ix.Titulo]),
      texto:ix.Texto === undefined ? '' : persoasV2Texto_(row[ix.Texto]),
      dataVixencia:persoasV2DataIso_(vigencia),
      ambito:ix.Ambito === undefined ? '' : persoasV2Texto_(row[ix.Ambito]),
      idTextoLegal:ix.Id_TextoLegal === undefined ? '' : persoasV2Texto_(row[ix.Id_TextoLegal]),
      sortDate:date ? date.getTime() : 0
    });
    return out;
  }, []);
  candidates.sort(function(a,b) { return b.sortDate - a.sortDate; });
  if (!candidates.length) return null;
  delete candidates[0].sortDate;
  return candidates[0];
}

function persoasV2TextosLegais_() {
  return {
    datosPersoa:persoasV2TextoLegal_(PERSOAS_V2_TEXTO_DATOS_),
    exencionCota:persoasV2TextoLegal_(PERSOAS_V2_TEXTO_COTA_)
  };
}

function persoasV2ListadoBase_(datos, server) {
  var auth = server ? { ok:true, email:'', permiso:{ nivel:'servidor', fonte:'WEB_WRITE_TOKEN' } } : persoasV2Autorizar_(datos, 'lectura');
  if (!auth.ok) return auth;
  var sheet = persoasV2Sheet_();
  var values = sheet.getDataRange().getValues();
  var headers = values[0] || [];
  var ix = persoasV2Indices_(headers);
  ['Row ID','Id','Nome','Primeiro apelido','Activo'].forEach(function(header) {
    if (ix[header] === undefined) throw new Error('Falta a columna ' + header + ' na folla Persoas.');
  });
  var persoas = values.slice(1).reduce(function(out, row) {
    var id = persoasV2Texto_(row[ix.Id]);
    var rowId = persoasV2Texto_(row[ix['Row ID']]);
    if (!id && !rowId) return out;
    out.push(persoasV2Construir_(row, ix));
    return out;
  }, []);
  persoas.sort(persoasV2Comparar_);
  return {
    ok:true,
    version:persoasV2VersionActual_(),
    perfil:server ? null : { email:auth.email, nivel:auth.permiso.nivel, fonte:auth.permiso.fonte },
    schema:persoasV2Schema_(sheet, values, ix),
    textosLegais:persoasV2TextosLegais_(),
    persoas:persoas
  };
}

function persoasV2Listar_(datos) {
  try { return persoasV2ListadoBase_(datos, false); }
  catch (erro) {
    console.error('persoasV2Listar_:', erro && erro.stack ? erro.stack : erro);
    return { ok:false, erro:'Non foi posible cargar Persoas.', detalle:String(erro && erro.message ? erro.message : erro) };
  }
}

function persoasV2SyncListar_(datos) {
  try { return persoasV2ListadoBase_(datos, true); }
  catch (erro) {
    console.error('persoasV2SyncListar_:', erro && erro.stack ? erro.stack : erro);
    return { ok:false, erro:'Non foi posible reconstruír a copia R2 de Persoas.', detalle:String(erro && erro.message ? erro.message : erro) };
  }
}

function persoasV2Version_(datos) {
  var auth = persoasV2Autorizar_(datos, 'lectura');
  if (!auth.ok) return auth;
  return { ok:true, version:persoasV2VersionActual_() };
}

function persoasV2LimparEntrada_(source) {
  var input = source && typeof source === 'object' ? source : {};
  var out = {};
  PERSOAS_V2_FIELDS_.forEach(function(field) {
    if (!Object.prototype.hasOwnProperty.call(input, field.key)) return;
    if (field.type === 'boolean') out[field.key] = input[field.key] === true;
    else out[field.key] = persoasV2Texto_(input[field.key]);
  });
  return out;
}

function persoasV2Poñer_(row, ix, header, value) {
  if (ix[header] !== undefined) row[ix[header]] = value;
}

function persoasV2Aplicar_(row, ix, entrada, alta) {
  PERSOAS_V2_FIELDS_.forEach(function(field) {
    if (!Object.prototype.hasOwnProperty.call(entrada, field.key) || ix[field.header] === undefined) return;
    var value = entrada[field.key];
    if (field.type === 'boolean') value = value ? 'Y' : 'N';
    else if (field.type === 'date') value = pessoasV2DataCompat_(value);
    row[ix[field.header]] = value;
  });
  if (alta && ix.DataIncorporacionSCPP !== undefined && !persoasV2Texto_(row[ix.DataIncorporacionSCPP])) {
    row[ix.DataIncorporacionSCPP] = new Date();
  }
}

function pessoasV2DataCompat_(v) { return persoasV2DataValor_(v); }

function persoasV2NomeCompleto_(row, ix) {
  var nome = ix.Nome === undefined ? '' : persoasV2Texto_(row[ix.Nome]);
  var primeiro = ix['Primeiro apelido'] === undefined ? '' : persoasV2Texto_(row[ix['Primeiro apelido']]);
  var segundo = ix['Segundo apelido'] === undefined ? '' : persoasV2Texto_(row[ix['Segundo apelido']]);
  var completo = [nome, primeiro, segundo].filter(Boolean).join(' ');
  if (ix.Nomecompleto !== undefined) row[ix.Nomecompleto] = completo;
  if (ix.NomeCompleto !== undefined) row[ix.NomeCompleto] = completo;
}

function persoasV2AtoparFila_(values, ix, ref) {
  var target = persoasV2Texto_(ref);
  for (var i = 1; i < values.length; i++) {
    var id = ix.Id === undefined ? '' : persoasV2Texto_(values[i][ix.Id]);
    var rowId = ix['Row ID'] === undefined ? '' : persoasV2Texto_(values[i][ix['Row ID']]);
    if (target && (target === id || target === rowId)) return i;
  }
  return -1;
}

function persoasV2SeguinteId_(values, ix) {
  var max = 0;
  for (var i = 1; i < values.length; i++) {
    var n = Number(values[i][ix.Id]);
    if (isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

function persoasV2Duplicado_(values, ix, entrada, idExcluir) {
  var correo = Object.prototype.hasOwnProperty.call(entrada, 'correo') ? persoasV2Email_(entrada.correo) : '';
  var nif = Object.prototype.hasOwnProperty.call(entrada, 'nif') ? pessoasV2TextoCompat_(entrada.nif).replace(/\s+/g,'').toLowerCase() : '';
  for (var i = 1; i < values.length; i++) {
    var id = ix.Id === undefined ? '' : persoasV2Texto_(values[i][ix.Id]);
    if (idExcluir && id === idExcluir) continue;
    if (correo && ix['Correo electrónico'] !== undefined && persoasV2Email_(values[i][ix['Correo electrónico']]) === correo) return 'Xa existe unha persoa con ese correo electrónico.';
    if (nif && ix.NIF !== undefined && persoasV2Texto_(values[i][ix.NIF]).replace(/\s+/g,'').toLowerCase() === nif) return 'Xa existe unha persoa con ese NIF.';
  }
  return '';
}

function persoasV2Crear_(datos) {
  try {
    var auth = persoasV2Autorizar_(datos, 'escritura');
    if (!auth.ok) return auth;
    var sheet = persoasV2Sheet_();
    var values = sheet.getDataRange().getValues();
    var headers = values[0] || [];
    var ix = persoasV2Indices_(headers);
    ['Row ID','Id','Nome','Primeiro apelido','Activo'].forEach(function(h) { if (ix[h] === undefined) throw new Error('Falta a columna ' + h + ' en Persoas.'); });
    var entrada = persoasV2LimparEntrada_(datos && (datos.persoa || datos.datos || {}));
    if (!entrada.nome) return { ok:false, erro:'O nome é obrigatorio.' };
    if (!entrada.primeiroApelido) return { ok:false, erro:'O primeiro apelido é obrigatorio.' };
    var duplicate = persoasV2Duplicado_(values, ix, entrada, '');
    if (duplicate) return { ok:false, erro:duplicate };

    var row = new Array(headers.length).fill('');
    var id = persoasV2SeguinteId_(values, ix);
    var rowId = Utilities.getUuid();
    persoasV2Poñer_(row, ix, 'Row ID', rowId);
    persoasV2Poñer_(row, ix, 'Id', id);
    persoasV2Aplicar_(row, ix, entrada, true);
    persoasV2Poñer_(row, ix, 'Activo', 'Y');
    persoasV2Poñer_(row, ix, 'DataActualizacionPerfil', new Date());
    persoasV2Poñer_(row, ix, 'ActualizadoPor', auth.email);
    persoasV2NomeCompleto_(row, ix);
    sheet.appendRow(row);
    SpreadsheetApp.flush();
    var version = persoasV2MarcarVersion_();
    return { ok:true, idPersoa:String(id), rowId:rowId, activo:true, version:version, persoa:persoasV2Construir_(row, ix) };
  } catch (erro) {
    console.error('persoasV2Crear_:', erro && erro.stack ? erro.stack : erro);
    return { ok:false, erro:String(erro && erro.message ? erro.message : erro) };
  }
}

function persoasV2Actualizar_(datos) {
  try {
    var auth = persoasV2Autorizar_(datos, 'escritura');
    if (!auth.ok) return auth;
    var ref = persoasV2Texto_(datos && (datos.idPersoa || datos.id || datos.rowId));
    if (!ref) return { ok:false, erro:'Non se indicou a persoa.' };
    var sheet = persoasV2Sheet_();
    var values = sheet.getDataRange().getValues();
    var ix = persoasV2Indices_(values[0] || []);
    var rowIndex = persoasV2AtoparFila_(values, ix, ref);
    if (rowIndex < 1) return { ok:false, erro:'Non se atopou a persoa.' };
    var entrada = persoasV2LimparEntrada_(datos && (datos.persoa || datos.datos || {}));
    var idActual = persoasV2Texto_(values[rowIndex][ix.Id]);
    var duplicate = persoasV2Duplicado_(values, ix, entrada, idActual);
    if (duplicate) return { ok:false, erro:duplicate };
    var row = values[rowIndex].slice();
    persoasV2Aplicar_(row, ix, entrada, false);
    if (!persoasV2Texto_(row[ix.Nome])) return { ok:false, erro:'O nome é obrigatorio.' };
    if (!persoasV2Texto_(row[ix['Primeiro apelido']])) return { ok:false, erro:'O primeiro apelido é obrigatorio.' };
    persoasV2Poñer_(row, ix, 'DataActualizacionPerfil', new Date());
    persoasV2Poñer_(row, ix, 'ActualizadoPor', auth.email);
    persoasV2NomeCompleto_(row, ix);
    sheet.getRange(rowIndex + 1, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();
    var version = persoasV2MarcarVersion_();
    return { ok:true, idPersoa:idActual, rowId:persoasV2Texto_(row[ix['Row ID']]), activo:persoasV2Bool_(row[ix.Activo]), version:version, persoa:persoasV2Construir_(row, ix) };
  } catch (erro) {
    console.error('persoasV2Actualizar_:', erro && erro.stack ? erro.stack : erro);
    return { ok:false, erro:String(erro && erro.message ? erro.message : erro) };
  }
}

function persoasV2Estado_(datos) {
  try {
    var auth = persoasV2Autorizar_(datos, 'escritura');
    if (!auth.ok) return auth;
    var ref = persoasV2Texto_(datos && (datos.idPersoa || datos.id || datos.rowId));
    if (!ref) return { ok:false, erro:'Non se indicou a persoa.' };
    var sheet = persoasV2Sheet_();
    var values = sheet.getDataRange().getValues();
    var ix = persoasV2Indices_(values[0] || []);
    var rowIndex = persoasV2AtoparFila_(values, ix, ref);
    if (rowIndex < 1) return { ok:false, erro:'Non se atopou a persoa.' };
    var row = values[rowIndex].slice();
    var activo = datos && datos.activo === true;
    persoasV2Poñer_(row, ix, 'Activo', activo ? 'Y' : 'N');
    persoasV2Poñer_(row, ix, 'DataActualizacionPerfil', new Date());
    persoasV2Poñer_(row, ix, 'ActualizadoPor', auth.email);
    sheet.getRange(rowIndex + 1, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();
    var version = persoasV2MarcarVersion_();
    return { ok:true, idPersoa:persoasV2Texto_(row[ix.Id]), rowId:persoasV2Texto_(row[ix['Row ID']]), activo:activo, version:version, persoa:persoasV2Construir_(row, ix) };
  } catch (erro) {
    console.error('persoasV2Estado_:', erro && erro.stack ? erro.stack : erro);
    return { ok:false, erro:String(erro && erro.message ? erro.message : erro) };
  }
}

function persoasV2TenUsuarioWeb_(id, rowId, correo) {
  var sh = SpreadsheetApp.openById(PERSOAS_V2_CONFIG_.usuariosSpreadsheetId).getSheetByName(PERSOAS_V2_CONFIG_.usuariosSheetName);
  if (!sh) return false;
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return false;
  var ix = persoasV2Indices_(values[0]);
  return values.slice(1).some(function(row) {
    var ref = ix.Persoa === undefined ? '' : persoasV2Texto_(row[ix.Persoa]);
    var email = ix.Email === undefined ? '' : persoasV2Email_(row[ix.Email]);
    return Boolean((ref && (ref === id || ref === rowId)) || (correo && email === correo));
  });
}

function persoasV2TenAceptacion_(id, rowId, correo) {
  var sh = SpreadsheetApp.openById(PERSOAS_V2_CONFIG_.aceptacionSpreadsheetId).getSheetById(PERSOAS_V2_CONFIG_.aceptacionSheetId);
  if (!sh) return false;
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return false;
  var ix = persoasV2Indices_(values[0]);
  return values.slice(1).some(function(row) {
    var persoa = ix.Persoa === undefined ? '' : persoasV2Texto_(row[ix.Persoa]);
    var email = ix['Correo electrónico'] === undefined ? '' : persoasV2Email_(row[ix['Correo electrónico']]);
    return Boolean((persoa && (persoa === id || persoa === rowId)) || (correo && email === correo));
  });
}

function persoasV2Eliminar_(datos) {
  try {
    var auth = persoasV2Autorizar_(datos, 'administracion');
    if (!auth.ok) return auth;
    if (persoasV2Texto_(datos && datos.confirmacion) !== 'ELIMINAR') {
      return { ok:false, erro:'Confirma a eliminación escribindo ELIMINAR.' };
    }
    var ref = persoasV2Texto_(datos && (datos.idPersoa || datos.id || datos.rowId));
    if (!ref) return { ok:false, erro:'Non se indicou a persoa.' };
    var sheet = persoasV2Sheet_();
    var values = sheet.getDataRange().getValues();
    var ix = persoasV2Indices_(values[0] || []);
    var rowIndex = persoasV2AtoparFila_(values, ix, ref);
    if (rowIndex < 1) return { ok:false, erro:'Non se atopou a persoa.' };
    var row = values[rowIndex];
    var id = persoasV2Texto_(row[ix.Id]);
    var rowId = persoasV2Texto_(row[ix['Row ID']]);
    var correo = ix['Correo electrónico'] === undefined ? '' : persoasV2Email_(row[ix['Correo electrónico']]);
    var nome = ix.Nomecompleto === undefined ? '' : persoasV2Texto_(row[ix.Nomecompleto]);
    var fichaR2Key = ix.FichaR2Key === undefined ? '' : persoasV2Texto_(row[ix.FichaR2Key]);

    if (auth.email && correo && auth.email === correo) return { ok:false, erro:'Non podes eliminar o teu propio rexistro desde esta operación.' };
    if (persoasV2TenUsuarioWeb_(id, rowId, correo)) return { ok:false, erro:'O rexistro ten un usuario web asociado. Dá de baixa a persoa en lugar de eliminala.' };
    if (persoasV2TenAceptacion_(id, rowId, correo)) return { ok:false, erro:'O rexistro ten unha aceptación legal asociada e non se pode eliminar con esta operación. Usa a baixa.' };

    sheet.deleteRow(rowIndex + 1);
    SpreadsheetApp.flush();
    var version = persoasV2MarcarVersion_();
    return { ok:true, idPersoa:id, rowId:rowId, correo:correo, nome:nome, fichaR2Key:fichaR2Key, version:version };
  } catch (erro) {
    console.error('persoasV2Eliminar_:', erro && erro.stack ? erro.stack : erro);
    return { ok:false, erro:String(erro && erro.message ? erro.message : erro) };
  }
}

function persoasV2InstalarTrigger_(datos) {
  try {
    var auth = persoasV2Autorizar_(datos, 'administracion');
    if (!auth.ok) return auth;
    var handler = PERSOAS_V2_CONFIG_.triggerHandler;
    var triggers = ScriptApp.getProjectTriggers();
    var found = triggers.some(function(trigger) {
      return trigger.getHandlerFunction() === handler && trigger.getEventType() === ScriptApp.EventType.ON_EDIT;
    });
    if (!found) {
      ScriptApp.newTrigger(handler)
        .forSpreadsheet(PERSOAS_V2_CONFIG_.spreadsheetId)
        .onEdit()
        .create();
    }
    return { ok:true, instalado:true, creado:!found };
  } catch (erro) {
    console.warn('Non se puido instalar o trigger de Persoas V2: ' + String(erro && erro.message ? erro.message : erro));
    return { ok:false, erro:'Non se puido instalar a sincronización automática de edicións manuais.', detalle:String(erro && erro.message ? erro.message : erro) };
  }
}

function persoasV2OnEdit_(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    if (!sheet || sheet.getParent().getId() !== PERSOAS_V2_CONFIG_.spreadsheetId || sheet.getSheetId() !== PERSOAS_V2_CONFIG_.sheetId) return;
    if (e.range.getRow() < 2) return;
    var version = persoasV2MarcarVersion_();
    var props = PropertiesService.getScriptProperties();
    var token = persoasV2Texto_(props.getProperty('WEB_WRITE_TOKEN'));
    if (!token) {
      console.warn('Persoas V2: WEB_WRITE_TOKEN non está configurado; R2 actualizarase na seguinte lectura.');
      return;
    }
    var response = UrlFetchApp.fetch(PERSOAS_V2_CONFIG_.syncUrl, {
      method:'post',
      contentType:'application/json',
      payload:JSON.stringify({ token:token, version:version, fonte:'sheet-onEdit' }),
      muteHttpExceptions:true,
      followRedirects:true
    });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      console.warn('Persoas V2: sincronización R2 respondeu ' + response.getResponseCode());
    }
  } catch (erro) {
    console.error('persoasV2OnEdit_:', erro && erro.stack ? erro.stack : erro);
  }
}
