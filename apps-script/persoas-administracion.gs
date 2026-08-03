/* Portal > Administración > Persoas. Fase 1 do Xestor de Arquivos. */

const PERSOAS_ADMIN_CONFIG = {
  persoasSpreadsheetId: '13-WeSz69A50XxPP57HA64Nascx6kXQFbeVKron0wATQ',
  persoasSheetId: 388888827,
  usuariosSpreadsheetId: '1qbW0q1Z6U3JnW0yGM4ELUWqjRkyNdJckJx0VGSoK-i8',
  usuariosSheetId: 1291817000
};

const PERSOAS_ADMIN_CACHE_SEGUNDOS = 10 * 60;

function cachePersoasAdmin_() {
  return CacheService.getScriptCache();
}

function probarPersoasAdministracion() {
  console.log(JSON.stringify(listarPersoasAdministracion_({ email: 'jcuinas@gmail.com' })));
}

function listarPersoasAdministracion_(datos) {
  const email = normalizarEmailPersoasAdmin_(datos && datos.email);
  const contexto = obterContextoPersoasAdmin_();
  const valoresPersoas = contexto.persoas.getDataRange().getValues();
  const administrador = obterAdministradorPersoasAdmin_(contexto, email, valoresPersoas);
  if (!administrador) return { ok: false, erro: 'Usuario non autorizado' };
  if (valoresPersoas.length < 2) return { ok: true, perfil: administrador, persoas: [] };

  const indices = indicesPersoasAdmin_(valoresPersoas[0]);
  requireHeaderPersoasAdmin_(indices, 'Id', 'Persoas');
  const persoas = valoresPersoas.slice(1).reduce(function(saida, fila) {
    if (!textoPersoasAdmin_(fila[indices.Id])) return saida;
    saida.push(construirPersoaAdmin_(fila, indices));
    return saida;
  }, []);
  persoas.sort(function(a, b) {
    return a.etiqueta.localeCompare(b.etiqueta, 'gl', { sensitivity: 'base' });
  });
  return { ok: true, perfil: administrador, persoas: persoas };
}

/* Valida permisos e devolve só a clave R2. O Worker entrega o PDF. */
function obterFichaPersoaAdministracion_(datos) {
  const email = normalizarEmailPersoasAdmin_(datos && datos.email);
  const idPersoa = textoPersoasAdmin_(datos && (datos.idPersoa || datos.id || datos.rowId));
  if (!idPersoa) return { ok: false, erro: 'Non se indicou a persoa' };

  const contexto = obterContextoPersoasAdmin_();
  const valoresPersoas = contexto.persoas.getDataRange().getValues();
  const administrador = obterAdministradorPersoasAdmin_(contexto, email, valoresPersoas);
  if (!administrador) return { ok: false, erro: 'Usuario non autorizado' };

  const indices = indicesPersoasAdmin_(valoresPersoas[0] || []);
  requireHeaderPersoasAdmin_(indices, 'Id', 'Persoas');
  requireHeaderPersoasAdmin_(indices, 'FichaR2Key', 'Persoas');
  requireHeaderPersoasAdmin_(indices, 'FichaR2Estado', 'Persoas');

  const fila = valoresPersoas.slice(1).find(function(item) {
    return textoPersoasAdmin_(item[indices.Id]) === idPersoa;
  });
  if (!fila) return { ok: false, erro: 'Non se atopou a persoa solicitada' };

  const r2Key = textoPersoasAdmin_(fila[indices.FichaR2Key]);
  const estado = textoPersoasAdmin_(fila[indices.FichaR2Estado]);
  if (!r2Key || estado !== 'SINCRONIZADO') {
    return {
      ok: false,
      erro: estado === 'CONFLITO'
        ? 'A ficha ten un conflito de sincronización'
        : 'A ficha aínda non está dispoñible no almacén R2'
    };
  }

  return {
    ok: true,
    idPersoa: idPersoa,
    r2Key: r2Key,
    nomeFicheiro: r2Key.split('/').pop() || 'ficha.pdf',
    mimeType: indices.FichaR2MimeType === undefined
      ? 'application/pdf'
      : textoPersoasAdmin_(fila[indices.FichaR2MimeType]) || 'application/pdf',
    etag: indices.FichaR2ETag === undefined ? '' : textoPersoasAdmin_(fila[indices.FichaR2ETag]),
    size: indices.FichaR2Size === undefined ? '' : textoPersoasAdmin_(fila[indices.FichaR2Size])
  };
}

function obterContextoPersoasAdmin_() {
  const persoas = SpreadsheetApp.openById(PERSOAS_ADMIN_CONFIG.persoasSpreadsheetId)
    .getSheetById(PERSOAS_ADMIN_CONFIG.persoasSheetId);
  const usuarios = SpreadsheetApp.openById(PERSOAS_ADMIN_CONFIG.usuariosSpreadsheetId)
    .getSheetById(PERSOAS_ADMIN_CONFIG.usuariosSheetId);
  if (!persoas || persoas.getName() !== 'Persoas') throw new Error('Non se atopou a folla Persoas');
  if (!usuarios || usuarios.getName() !== 'UsuariosWeb') throw new Error('Non se atopou a folla UsuariosWeb');
  return { persoas: persoas, usuarios: usuarios };
}

function obterAdministradorPersoasAdmin_(contexto, email, valoresPersoas) {
  if (!email) return null;
  const cache = cachePersoasAdmin_();
  const clave = 'persoas-admin-v4:perfil:' + email;
  const cacheado = cache.get(clave);
  if (cacheado) {
    try { return JSON.parse(cacheado); } catch (erroCache) {
      console.warn('Perfil de administración en cache non válido: ' + erroCache);
    }
  }

  const usuarios = contexto.usuarios.getDataRange().getValues();
  const iu = indicesPersoasAdmin_(usuarios[0] || []);
  ['Email', 'Activo', 'Administrador', 'Persoa'].forEach(function(c) {
    requireHeaderPersoasAdmin_(iu, c, 'UsuariosWeb');
  });
  const usuario = usuarios.slice(1).find(function(fila) {
    return normalizarEmailPersoasAdmin_(fila[iu.Email]) === email &&
      booleanoPersoasAdmin_(fila[iu.Activo]) &&
      booleanoPersoasAdmin_(fila[iu.Administrador]);
  });
  if (!usuario) return null;

  const persoas = valoresPersoas || contexto.persoas.getDataRange().getValues();
  const ip = indicesPersoasAdmin_(persoas[0] || []);
  requireHeaderPersoasAdmin_(ip, 'Id', 'Persoas');
  const referencia = textoPersoasAdmin_(usuario[iu.Persoa]);
  const persoa = persoas.slice(1).find(function(fila) {
    const correo = ip['Correo electrónico'] === undefined ? '' : normalizarEmailPersoasAdmin_(fila[ip['Correo electrónico']]);
    return (referencia && referencia === textoPersoasAdmin_(fila[ip.Id])) || correo === email;
  });
  if (!persoa) return null;

  const iNome = ip.Nomecompleto !== undefined ? ip.Nomecompleto : ip.NomeCompleto;
  const perfil = {
    email: email,
    idPersoa: textoPersoasAdmin_(persoa[ip.Id]),
    nome: textoPersoasAdmin_(usuario[iu.Nome]) || (iNome === undefined ? '' : textoPersoasAdmin_(persoa[iNome])),
    cargo: ip.Cargo === undefined ? '' : textoPersoasAdmin_(persoa[ip.Cargo]),
    nivel: 'Administración'
  };
  try { cache.put(clave, JSON.stringify(perfil), PERSOAS_ADMIN_CACHE_SEGUNDOS); } catch (erroCache) {
    console.warn('Non se puido gardar o perfil de administración en cache: ' + erroCache);
  }
  return perfil;
}

function construirPersoaAdmin_(fila, indices) {
  const valor = function(c) { return indices[c] === undefined ? '' : fila[indices[c]]; };
  const texto = function(c) { return textoPersoasAdmin_(valor(c)); };
  const nome = texto('Nome');
  const primeiro = texto('Primeiro apelido');
  const segundo = texto('Segundo apelido');
  const id = texto('Id');
  const r2Key = texto('FichaR2Key');
  const r2Estado = texto('FichaR2Estado');
  return {
    idPersoa: id, id: id, rowId: id,
    etiqueta: [primeiro, segundo, nome].filter(Boolean).join(' · '),
    nomeCompleto: texto('Nomecompleto') || texto('NomeCompleto') || [nome, primeiro, segundo].filter(Boolean).join(' '),
    nome: nome, primeiroApelido: primeiro, segundoApelido: segundo,
    voz: texto('Voz'), nif: texto('NIF'), telefono: texto('Teléfono'), correo: texto('Correo electrónico'),
    enderezo: texto('Enderezo'), cidade: texto('Cidade'), cp: texto('CP'),
    activo: booleanoPersoasAdmin_(valor('Activo')), mostrarWeb: booleanoPersoasAdmin_(valor('MostrarWeb')),
    cargo: texto('Cargo'), tipoSocio: texto('Tipo de socio'),
    dataNacemento: formatarDataPersoasAdmin_(valor('DataNacemento')),
    dataIncorporacion: formatarDataPersoasAdmin_(valor('DataIncorporacionSCPP')),
    contactoEmerxencia: texto('ContactoEmerxencia'), telefonoEmerxencia: texto('TelefonoEmerxencia'),
    preferenciaComunicacion: texto('PreferenciaComunicacion'), consentimentoFoto: texto('ConsentimentoFoto'),
    mostrarAniversario: booleanoPersoasAdmin_(valor('MostrarAniversario')),
    observacions: texto('Observacións'), observacionsPrivadas: texto('ObservacionsPrivadas'),
    actualizadoPor: texto('ActualizadoPor'), dataActualizacion: formatarDataHoraPersoasAdmin_(valor('DataActualizacionPerfil')),
    ficha: texto('Ficha'), fichaR2Key: r2Key, fichaR2Estado: r2Estado,
    fichaDisponibleR2: Boolean(r2Key) && r2Estado === 'SINCRONIZADO'
  };
}

function indicesPersoasAdmin_(cabeceiras) {
  return cabeceiras.reduce(function(saida, valor, indice) {
    saida[String(valor || '').trim()] = indice; return saida;
  }, {});
}
function requireHeaderPersoasAdmin_(indices, cabeceira, folla) {
  if (indices[cabeceira] === undefined) throw new Error('Falta a columna ' + cabeceira + ' na folla ' + folla);
}
function textoPersoasAdmin_(valor) { return valor == null ? '' : String(valor).trim(); }
function normalizarEmailPersoasAdmin_(valor) { return textoPersoasAdmin_(valor).toLowerCase(); }
function normalizarTextoPersoasAdmin_(valor) {
  return textoPersoasAdmin_(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function booleanoPersoasAdmin_(valor) {
  return valor === true || ['true','y','si','sí','yes','1','verdadeiro'].indexOf(normalizarTextoPersoasAdmin_(valor)) >= 0;
}
function formatarDataPersoasAdmin_(valor) {
  return Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())
    ? Utilities.formatDate(valor, Session.getScriptTimeZone() || 'Europe/Madrid', 'dd/MM/yyyy')
    : textoPersoasAdmin_(valor);
}
function formatarDataHoraPersoasAdmin_(valor) {
  return Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())
    ? Utilities.formatDate(valor, Session.getScriptTimeZone() || 'Europe/Madrid', 'dd/MM/yyyy HH:mm')
    : textoPersoasAdmin_(valor);
}
