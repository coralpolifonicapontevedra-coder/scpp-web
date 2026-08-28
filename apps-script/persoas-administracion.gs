/*
 * Portal > Administración > Persoas.
 * Xestión administrativa con lectura rápida desde R2/Cache no Worker.
 *
 * IMPORTANTE: os libros de Persoas e UsuariosWeb resólvense sempre mediante
 * Script Properties. Deste xeito Preview e Produción comparten lóxica sen
 * risco de escribir no ambiente equivocado.
 */

const PERSOAS_ADMIN_CACHE_SEGUNDOS = 10 * 60;

function probarPersoasAdministracion() {
  const resultado = listarPersoasAdministracion_({
    email: Session.getEffectiveUser().getEmail()
  });
  console.log(JSON.stringify(resultado));
}

function listarPersoasAdministracion_(datos) {
  try {
    const email = normalizarEmailPersoasAdmin_(datos && datos.email);
    const contexto = obterContextoPersoasAdmin_();
    const valoresPersoas = contexto.persoas.getDataRange().getValues();
    const administrador = obterAdministradorPersoasAdmin_(contexto, email, valoresPersoas);

    if (!administrador) return { ok: false, erro: 'Usuario non autorizado' };

    if (valoresPersoas.length < 2) {
      return { ok: true, perfil: administrador, persoas: [] };
    }

    const indices = indicesPersoasAdmin_(valoresPersoas[0]);
    requireHeaderPersoasAdmin_(indices, 'Id', 'Persoas');

    const persoas = valoresPersoas.slice(1).reduce(function(saida, fila) {
      const id = textoPersoasAdmin_(fila[indices.Id]);
      const rowId = indices['Row ID'] === undefined
        ? ''
        : textoPersoasAdmin_(fila[indices['Row ID']]);
      if (!id && !rowId) return saida;
      saida.push(construirPersoaAdmin_(fila, indices));
      return saida;
    }, []);

    persoas.sort(function(a, b) {
      return a.etiqueta.localeCompare(b.etiqueta, 'gl', { sensitivity: 'base' });
    });

    return { ok: true, perfil: administrador, persoas: persoas };
  } catch (erro) {
    console.error('Erro en listarPersoasAdministracion_:', erro && erro.stack ? erro.stack : erro);
    return {
      ok: false,
      erro: 'Non foi posible consultar as persoas',
      detalle: erro && erro.message ? String(erro.message) : String(erro)
    };
  }
}

function crearPersoaAdministracion_(datos) {
  try {
    validarAccionPermitidaEntorno_('crearPersoaAdministracion');

    const email = normalizarEmailPersoasAdmin_(datos && datos.email);
    const contexto = obterContextoPersoasAdmin_();
    const valores = contexto.persoas.getDataRange().getValues();
    const administrador = obterAdministradorPersoasAdmin_(contexto, email, valores);
    if (!administrador) return { ok: false, erro: 'Usuario non autorizado' };

    const cabeceiras = valores[0] || [];
    const indices = indicesPersoasAdmin_(cabeceiras);
    ['Row ID', 'Id', 'Nome', 'Primeiro apelido', 'Activo'].forEach(function(cabeceira) {
      requireHeaderPersoasAdmin_(indices, cabeceira, 'Persoas');
    });

    const entrada = limparEntradaPersoaAdmin_(datos && (datos.persoa || datos.datos || {}));
    if (!entrada.nome || !entrada.primeiroApelido) {
      return { ok: false, erro: 'Nome e primeiro apelido son obrigatorios' };
    }

    const conflito = detectarDuplicadoPersoaAdmin_(valores, indices, entrada, '');
    if (conflito) return { ok: false, erro: conflito };

    const fila = new Array(cabeceiras.length).fill('');
    const novoId = seguinteIdPersoaAdmin_(valores, indices);
    const rowId = Utilities.getUuid();

    poñerValorPersoaAdmin_(fila, indices, 'Row ID', rowId);
    poñerValorPersoaAdmin_(fila, indices, 'Id', novoId);
    aplicarEntradaPersoaAdmin_(fila, indices, entrada, true);
    poñerValorPersoaAdmin_(fila, indices, 'Activo', 'Y');
    poñerValorPersoaAdmin_(fila, indices, 'DataActualizacionPerfil', new Date());
    poñerValorPersoaAdmin_(fila, indices, 'ActualizadoPor', administrador.email);
    actualizarNomeCompletoPersoaAdmin_(fila, indices);

    contexto.persoas.appendRow(fila);
    SpreadsheetApp.flush();

    return {
      ok: true,
      mensaxe: 'Persoa creada correctamente',
      idPersoa: String(novoId),
      rowId: rowId,
      persoa: construirPersoaAdmin_(fila, indices)
    };
  } catch (erro) {
    console.error('Erro en crearPersoaAdministracion_:', erro && erro.stack ? erro.stack : erro);
    return { ok: false, erro: erro && erro.message ? String(erro.message) : String(erro) };
  }
}

function actualizarPersoaAdministracion_(datos) {
  try {
    validarAccionPermitidaEntorno_('actualizarPersoaAdministracion');

    const email = normalizarEmailPersoasAdmin_(datos && datos.email);
    const referencia = textoPersoasAdmin_(datos && (datos.idPersoa || datos.id || datos.rowId));
    if (!referencia) return { ok: false, erro: 'Non se indicou a persoa' };

    const contexto = obterContextoPersoasAdmin_();
    const valores = contexto.persoas.getDataRange().getValues();
    const administrador = obterAdministradorPersoasAdmin_(contexto, email, valores);
    if (!administrador) return { ok: false, erro: 'Usuario non autorizado' };

    const indices = indicesPersoasAdmin_(valores[0] || []);
    requireHeaderPersoasAdmin_(indices, 'Id', 'Persoas');

    const indiceFila = atoparIndiceFilaPersoaAdmin_(valores, indices, referencia);
    if (indiceFila < 1) return { ok: false, erro: 'Non se atopou a persoa solicitada' };

    const entrada = limparEntradaPersoaAdmin_(datos && (datos.persoa || datos.datos || {}));
    if (entrada.nome !== undefined && !entrada.nome) return { ok: false, erro: 'O nome non pode quedar baleiro' };
    if (entrada.primeiroApelido !== undefined && !entrada.primeiroApelido) {
      return { ok: false, erro: 'O primeiro apelido non pode quedar baleiro' };
    }

    const idActual = textoPersoasAdmin_(valores[indiceFila][indices.Id]);
    const conflito = detectarDuplicadoPersoaAdmin_(valores, indices, entrada, idActual);
    if (conflito) return { ok: false, erro: conflito };

    const fila = valores[indiceFila].slice();
    aplicarEntradaPersoaAdmin_(fila, indices, entrada, false);
    actualizarNomeCompletoPersoaAdmin_(fila, indices);
    poñerValorPersoaAdmin_(fila, indices, 'DataActualizacionPerfil', new Date());
    poñerValorPersoaAdmin_(fila, indices, 'ActualizadoPor', administrador.email);

    contexto.persoas
      .getRange(indiceFila + 1, 1, 1, fila.length)
      .setValues([fila]);
    SpreadsheetApp.flush();

    return {
      ok: true,
      mensaxe: 'Datos actualizados correctamente',
      idPersoa: idActual,
      persoa: construirPersoaAdmin_(fila, indices)
    };
  } catch (erro) {
    console.error('Erro en actualizarPersoaAdministracion_:', erro && erro.stack ? erro.stack : erro);
    return { ok: false, erro: erro && erro.message ? String(erro.message) : String(erro) };
  }
}

function cambiarEstadoPersoaAdministracion_(datos) {
  try {
    validarAccionPermitidaEntorno_('actualizarEstadoPersoaAdministracion');

    const email = normalizarEmailPersoasAdmin_(datos && datos.email);
    const referencia = textoPersoasAdmin_(datos && (datos.idPersoa || datos.id || datos.rowId));
    if (!referencia) return { ok: false, erro: 'Non se indicou a persoa' };

    const activo = datos && datos.activo === true;
    const contexto = obterContextoPersoasAdmin_();
    const valores = contexto.persoas.getDataRange().getValues();
    const administrador = obterAdministradorPersoasAdmin_(contexto, email, valores);
    if (!administrador) return { ok: false, erro: 'Usuario non autorizado' };

    const indices = indicesPersoasAdmin_(valores[0] || []);
    requireHeaderPersoasAdmin_(indices, 'Id', 'Persoas');
    requireHeaderPersoasAdmin_(indices, 'Activo', 'Persoas');

    const indiceFila = atoparIndiceFilaPersoaAdmin_(valores, indices, referencia);
    if (indiceFila < 1) return { ok: false, erro: 'Non se atopou a persoa solicitada' };

    const fila = valores[indiceFila].slice();
    poñerValorPersoaAdmin_(fila, indices, 'Activo', activo ? 'Y' : 'N');
    poñerValorPersoaAdmin_(fila, indices, 'DataActualizacionPerfil', new Date());
    poñerValorPersoaAdmin_(fila, indices, 'ActualizadoPor', administrador.email);

    contexto.persoas
      .getRange(indiceFila + 1, 1, 1, fila.length)
      .setValues([fila]);
    SpreadsheetApp.flush();

    return {
      ok: true,
      mensaxe: activo ? 'Persoa reactivada correctamente' : 'Baixa rexistrada correctamente',
      idPersoa: textoPersoasAdmin_(fila[indices.Id]),
      activo: activo,
      persoa: construirPersoaAdmin_(fila, indices)
    };
  } catch (erro) {
    console.error('Erro en cambiarEstadoPersoaAdministracion_:', erro && erro.stack ? erro.stack : erro);
    return { ok: false, erro: erro && erro.message ? String(erro.message) : String(erro) };
  }
}

/* Valida permisos e devolve só a clave privada de R2. */
function obterFichaPersoaAdministracion_(datos) {
  try {
    const email = normalizarEmailPersoasAdmin_(datos && datos.email);
    const referencia = textoPersoasAdmin_(datos && (datos.idPersoa || datos.id || datos.rowId));
    if (!referencia) return { ok: false, erro: 'Non se indicou a persoa' };

    const contexto = obterContextoPersoasAdmin_();
    const valoresPersoas = contexto.persoas.getDataRange().getValues();
    const administrador = obterAdministradorPersoasAdmin_(contexto, email, valoresPersoas);
    if (!administrador) return { ok: false, erro: 'Usuario non autorizado' };

    const indices = indicesPersoasAdmin_(valoresPersoas[0] || []);
    requireHeaderPersoasAdmin_(indices, 'Id', 'Persoas');
    requireHeaderPersoasAdmin_(indices, 'FichaR2Key', 'Persoas');
    requireHeaderPersoasAdmin_(indices, 'FichaR2Estado', 'Persoas');

    const indiceFila = atoparIndiceFilaPersoaAdmin_(valoresPersoas, indices, referencia);
    if (indiceFila < 1) return { ok: false, erro: 'Non se atopou a persoa solicitada' };

    const fila = valoresPersoas[indiceFila];
    const r2Key = textoPersoasAdmin_(fila[indices.FichaR2Key]);
    const estado = textoPersoasAdmin_(fila[indices.FichaR2Estado]);

    if (!r2Key) return { ok: false, erro: 'Esta persoa non ten ficha dispoñible en R2' };
    if (estado !== 'SINCRONIZADO') {
      return {
        ok: false,
        erro: estado === 'CONFLITO'
          ? 'A ficha ten un conflito de sincronización'
          : 'A ficha aínda non está sincronizada con R2'
      };
    }

    return {
      ok: true,
      idPersoa: textoPersoasAdmin_(fila[indices.Id]),
      r2Key: r2Key,
      nomeFicheiro: r2Key.split('/').pop() || 'ficha.pdf',
      mimeType: indices.FichaR2MimeType === undefined
        ? 'application/pdf'
        : (textoPersoasAdmin_(fila[indices.FichaR2MimeType]) || 'application/pdf'),
      etag: indices.FichaR2ETag === undefined ? '' : textoPersoasAdmin_(fila[indices.FichaR2ETag]),
      size: indices.FichaR2Size === undefined ? '' : textoPersoasAdmin_(fila[indices.FichaR2Size])
    };
  } catch (erro) {
    console.error('Erro en obterFichaPersoaAdministracion_:', erro && erro.stack ? erro.stack : erro);
    return {
      ok: false,
      erro: 'Non foi posible consultar a ficha',
      detalle: erro && erro.message ? String(erro.message) : String(erro)
    };
  }
}

function obterContextoPersoasAdmin_() {
  const persoasSpreadsheetId = obterPropiedadeObrigatoria_('PERSOAS_SPREADSHEET_ID');
  const persoasSheetId = Number(obterPropiedadeObrigatoria_('PERSOAS_SHEET_ID'));
  const usuariosSpreadsheetId = obterPropiedadeObrigatoria_('USUARIOS_WEB_SPREADSHEET_ID');
  const usuariosSheetId = Number(obterPropiedadeObrigatoria_('USUARIOS_WEB_SHEET_ID'));

  const persoas = SpreadsheetApp.openById(persoasSpreadsheetId).getSheetById(persoasSheetId);
  const usuarios = SpreadsheetApp.openById(usuariosSpreadsheetId).getSheetById(usuariosSheetId);

  if (!persoas || persoas.getName() !== 'Persoas') throw new Error('Non se atopou a folla Persoas');
  if (!usuarios || usuarios.getName() !== 'UsuariosWeb') throw new Error('Non se atopou a folla UsuariosWeb');

  return { persoas: persoas, usuarios: usuarios };
}

function obterAdministradorPersoasAdmin_(contexto, email, valoresPersoas) {
  if (!email) return null;

  const cache = CacheService.getScriptCache();
  const claveCache = 'persoas-admin-v7-gobernanza:' + email;
  const cacheado = cache.get(claveCache);
  if (cacheado) {
    try { return JSON.parse(cacheado); } catch (erroCache) {
      console.warn('Cache de administración non válida:', erroCache);
    }
  }

  const valoresUsuarios = contexto.usuarios.getDataRange().getValues();
  if (valoresUsuarios.length < 2) return null;

  const iu = indicesPersoasAdmin_(valoresUsuarios[0]);
  requireHeaderPersoasAdmin_(iu, 'Email', 'UsuariosWeb');
  requireHeaderPersoasAdmin_(iu, 'Activo', 'UsuariosWeb');
  requireHeaderPersoasAdmin_(iu, 'Persoa', 'UsuariosWeb');

  const usuario = valoresUsuarios.slice(1).find(function(fila) {
    return normalizarEmailPersoasAdmin_(fila[iu.Email]) === email && booleanoPersoasAdmin_(fila[iu.Activo]);
  });
  if (!usuario) return null;

  const permiso = resolverPermisosPortal_(email);
  if (!permiso || permiso.escritura !== true) return null;

  const persoas = valoresPersoas || contexto.persoas.getDataRange().getValues();
  const ip = indicesPersoasAdmin_(persoas[0] || []);
  requireHeaderPersoasAdmin_(ip, 'Id', 'Persoas');

  const referencia = textoPersoasAdmin_(usuario[iu.Persoa]);
  const persoa = persoas.slice(1).find(function(fila) {
    const id = textoPersoasAdmin_(fila[ip.Id]);
    const rowId = ip['Row ID'] === undefined ? '' : textoPersoasAdmin_(fila[ip['Row ID']]);
    const correo = ip['Correo electrónico'] === undefined
      ? ''
      : normalizarEmailPersoasAdmin_(fila[ip['Correo electrónico']]);
    return (referencia && (referencia === id || referencia === rowId)) || correo === email;
  });
  if (!persoa) return null;

  const indiceNomeCompleto = ip.Nomecompleto !== undefined ? ip.Nomecompleto : ip.NomeCompleto;
  const perfil = {
    email: email,
    idPersoa: textoPersoasAdmin_(persoa[ip.Id]),
    nome: (iu.Nome === undefined ? '' : textoPersoasAdmin_(usuario[iu.Nome])) ||
      (indiceNomeCompleto === undefined ? '' : textoPersoasAdmin_(persoa[indiceNomeCompleto])),
    cargo: permiso.cargo || permiso.funcion || '',
    nivel: 'Administración',
    perfis: permiso.perfis || [],
    fonte: permiso.fonte || ''
  };

  try { cache.put(claveCache, JSON.stringify(perfil), PERSOAS_ADMIN_CACHE_SEGUNDOS); } catch (erroCache) {
    console.warn('Non se puido gardar a cache:', erroCache);
  }
  return perfil;
}

function construirPersoaAdmin_(fila, indices) {
  const valor = function(cabeceira) {
    const indice = indices[cabeceira];
    return indice === undefined ? '' : fila[indice];
  };
  const texto = function(cabeceira) { return textoPersoasAdmin_(valor(cabeceira)); };

  const nome = texto('Nome');
  const primeiro = texto('Primeiro apelido');
  const segundo = texto('Segundo apelido');
  const completo = texto('Nomecompleto') || texto('NomeCompleto') || [nome, primeiro, segundo].filter(Boolean).join(' ');
  const id = texto('Id');
  const rowId = texto('Row ID');
  const fichaR2Key = texto('FichaR2Key');
  const fichaR2Estado = texto('FichaR2Estado');

  return {
    rowId: rowId || id,
    id: id,
    idPersoa: id,
    etiqueta: [primeiro, segundo, nome].filter(Boolean).join(' · '),
    nomeCompleto: completo,
    nome: nome,
    primeiroApelido: primeiro,
    segundoApelido: segundo,
    voz: texto('Voz'),
    nif: texto('NIF'),
    telefono: texto('Teléfono'),
    correo: texto('Correo electrónico'),
    enderezo: texto('Enderezo'),
    cidade: texto('Cidade'),
    cp: texto('CP'),
    activo: booleanoPersoasAdmin_(valor('Activo')),
    mostrarWeb: booleanoPersoasAdmin_(valor('MostrarWeb')),
    cargo: texto('Cargo'),
    tipoSocio: texto('Tipo de socio'),
    dataNacemento: formatarDataPersoasAdmin_(valor('DataNacemento')),
    dataIncorporacion: formatarDataPersoasAdmin_(valor('DataIncorporacionSCPP')),
    contactoEmerxencia: texto('ContactoEmerxencia'),
    telefonoEmerxencia: texto('TelefonoEmerxencia'),
    preferenciaComunicacion: texto('PreferenciaComunicacion'),
    consentimentoFoto: texto('ConsentimentoFoto'),
    mostrarAniversario: booleanoPersoasAdmin_(valor('MostrarAniversario')),
    observacions: texto('Observacións'),
    observacionsPrivadas: texto('ObservacionsPrivadas'),
    actualizadoPor: texto('ActualizadoPor'),
    dataActualizacion: formatarDataHoraPersoasAdmin_(valor('DataActualizacionPerfil')),
    ficha: texto('Ficha'),
    fichaR2Key: fichaR2Key,
    fichaR2Estado: fichaR2Estado,
    fichaDisponibleR2: Boolean(fichaR2Key) && fichaR2Estado === 'SINCRONIZADO'
  };
}

function limparEntradaPersoaAdmin_(entrada) {
  const fonte = entrada && typeof entrada === 'object' ? entrada : {};
  const textoSeExiste = function(nome) {
    return Object.prototype.hasOwnProperty.call(fonte, nome) ? textoPersoasAdmin_(fonte[nome]) : undefined;
  };
  const booleanoSeExiste = function(nome) {
    return Object.prototype.hasOwnProperty.call(fonte, nome) ? fonte[nome] === true : undefined;
  };

  return {
    nome: textoSeExiste('nome'),
    primeiroApelido: textoSeExiste('primeiroApelido'),
    segundoApelido: textoSeExiste('segundoApelido'),
    voz: textoSeExiste('voz'),
    nif: textoSeExiste('nif'),
    telefono: textoSeExiste('telefono'),
    correo: textoSeExiste('correo'),
    enderezo: textoSeExiste('enderezo'),
    cidade: textoSeExiste('cidade'),
    cp: textoSeExiste('cp'),
    cargo: textoSeExiste('cargo'),
    tipoSocio: textoSeExiste('tipoSocio'),
    dataNacemento: textoSeExiste('dataNacemento'),
    dataIncorporacion: textoSeExiste('dataIncorporacion'),
    contactoEmerxencia: textoSeExiste('contactoEmerxencia'),
    telefonoEmerxencia: textoSeExiste('telefonoEmerxencia'),
    preferenciaComunicacion: textoSeExiste('preferenciaComunicacion'),
    consentimentoFoto: textoSeExiste('consentimentoFoto'),
    observacions: textoSeExiste('observacions'),
    observacionsPrivadas: textoSeExiste('observacionsPrivadas'),
    mostrarWeb: booleanoSeExiste('mostrarWeb'),
    mostrarAniversario: booleanoSeExiste('mostrarAniversario')
  };
}

function aplicarEntradaPersoaAdmin_(fila, indices, entrada, alta) {
  const mapa = {
    nome: 'Nome',
    primeiroApelido: 'Primeiro apelido',
    segundoApelido: 'Segundo apelido',
    voz: 'Voz',
    nif: 'NIF',
    telefono: 'Teléfono',
    correo: 'Correo electrónico',
    enderezo: 'Enderezo',
    cidade: 'Cidade',
    cp: 'CP',
    cargo: 'Cargo',
    tipoSocio: 'Tipo de socio',
    contactoEmerxencia: 'ContactoEmerxencia',
    telefonoEmerxencia: 'TelefonoEmerxencia',
    preferenciaComunicacion: 'PreferenciaComunicacion',
    consentimentoFoto: 'ConsentimentoFoto',
    observacions: 'Observacións',
    observacionsPrivadas: 'ObservacionsPrivadas'
  };

  Object.keys(mapa).forEach(function(chave) {
    if (entrada[chave] !== undefined) poñerValorPersoaAdmin_(fila, indices, mapa[chave], entrada[chave]);
  });

  if (entrada.dataNacemento !== undefined) {
    poñerValorPersoaAdmin_(fila, indices, 'DataNacemento', converterDataPersoasAdmin_(entrada.dataNacemento));
  }
  if (entrada.dataIncorporacion !== undefined) {
    poñerValorPersoaAdmin_(fila, indices, 'DataIncorporacionSCPP', converterDataPersoasAdmin_(entrada.dataIncorporacion));
  } else if (alta) {
    poñerValorPersoaAdmin_(fila, indices, 'DataIncorporacionSCPP', new Date());
  }
  if (entrada.mostrarWeb !== undefined) poñerValorPersoaAdmin_(fila, indices, 'MostrarWeb', entrada.mostrarWeb ? 'Y' : 'N');
  if (entrada.mostrarAniversario !== undefined) {
    poñerValorPersoaAdmin_(fila, indices, 'MostrarAniversario', entrada.mostrarAniversario ? 'Y' : 'N');
  }
  if (alta && entrada.tipoSocio === undefined) poñerValorPersoaAdmin_(fila, indices, 'Tipo de socio', 'Cantor/a');
}

function actualizarNomeCompletoPersoaAdmin_(fila, indices) {
  const nome = indices.Nome === undefined ? '' : textoPersoasAdmin_(fila[indices.Nome]);
  const primeiro = indices['Primeiro apelido'] === undefined ? '' : textoPersoasAdmin_(fila[indices['Primeiro apelido']]);
  const segundo = indices['Segundo apelido'] === undefined ? '' : textoPersoasAdmin_(fila[indices['Segundo apelido']]);
  const completo = [nome, primeiro, segundo].filter(Boolean).join(' ');
  if (indices.Nomecompleto !== undefined) fila[indices.Nomecompleto] = completo;
  if (indices.NomeCompleto !== undefined) fila[indices.NomeCompleto] = completo;
}

function detectarDuplicadoPersoaAdmin_(valores, indices, entrada, idExcluir) {
  const correo = entrada.correo === undefined ? '' : normalizarEmailPersoasAdmin_(entrada.correo);
  const nif = entrada.nif === undefined ? '' : normalizarTextoPersoasAdmin_(entrada.nif).replace(/\s+/g, '');
  if (!correo && !nif) return '';

  for (let i = 1; i < valores.length; i += 1) {
    const fila = valores[i];
    const id = indices.Id === undefined ? '' : textoPersoasAdmin_(fila[indices.Id]);
    if (idExcluir && id === idExcluir) continue;

    if (correo && indices['Correo electrónico'] !== undefined) {
      const correoFila = normalizarEmailPersoasAdmin_(fila[indices['Correo electrónico']]);
      if (correoFila && correoFila === correo) return 'Xa existe unha persoa con ese correo electrónico';
    }
    if (nif && indices.NIF !== undefined) {
      const nifFila = normalizarTextoPersoasAdmin_(fila[indices.NIF]).replace(/\s+/g, '');
      if (nifFila && nifFila === nif) return 'Xa existe unha persoa con ese NIF';
    }
  }
  return '';
}

function seguinteIdPersoaAdmin_(valores, indices) {
  let maximo = 0;
  if (indices.Id === undefined) return 1;
  for (let i = 1; i < valores.length; i += 1) {
    const numero = Number(valores[i][indices.Id]);
    if (Number.isFinite(numero) && numero > maximo) maximo = numero;
  }
  return maximo + 1;
}

function atoparIndiceFilaPersoaAdmin_(valores, indices, referencia) {
  for (let i = 1; i < valores.length; i += 1) {
    const id = indices.Id === undefined ? '' : textoPersoasAdmin_(valores[i][indices.Id]);
    const rowId = indices['Row ID'] === undefined ? '' : textoPersoasAdmin_(valores[i][indices['Row ID']]);
    if (referencia === id || referencia === rowId) return i;
  }
  return -1;
}

function poñerValorPersoaAdmin_(fila, indices, cabeceira, valor) {
  if (indices[cabeceira] !== undefined) fila[indices[cabeceira]] = valor;
}

function converterDataPersoasAdmin_(valor) {
  const texto = textoPersoasAdmin_(valor);
  if (!texto) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0);
  const europea = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (europea) return new Date(Number(europea[3]), Number(europea[2]) - 1, Number(europea[1]), 12, 0, 0);
  return texto;
}

function indicesPersoasAdmin_(cabeceiras) {
  return cabeceiras.reduce(function(saida, valor, indice) {
    saida[String(valor || '').trim()] = indice;
    return saida;
  }, {});
}

function requireHeaderPersoasAdmin_(indices, cabeceira, folla) {
  if (indices[cabeceira] === undefined) throw new Error('Falta a columna ' + cabeceira + ' na folla ' + folla);
}

function textoPersoasAdmin_(valor) {
  return valor == null ? '' : String(valor).trim();
}

function normalizarEmailPersoasAdmin_(valor) {
  return textoPersoasAdmin_(valor).toLowerCase();
}

function normalizarTextoPersoasAdmin_(valor) {
  return textoPersoasAdmin_(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function booleanoPersoasAdmin_(valor) {
  if (valor === true) return true;
  return ['true', 'y', 'si', 'sí', 'yes', '1', 'verdadeiro'].indexOf(normalizarTextoPersoasAdmin_(valor)) >= 0;
}

function formatarDataPersoasAdmin_(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone() || 'Europe/Madrid', 'dd/MM/yyyy');
  }
  return textoPersoasAdmin_(valor);
}

function formatarDataHoraPersoasAdmin_(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone() || 'Europe/Madrid', 'dd/MM/yyyy HH:mm');
  }
  return textoPersoasAdmin_(valor);
}
