/*
 * Portal > Administración > Persoas.
 * Xestión administrativa con lectura rápida desde R2/Cache no Worker.
 *
 * IMPORTANTE: os libros de Persoas, UsuariosWeb e Aceptación resólvense
 * sempre mediante Script Properties. Preview e Produción comparten lóxica
 * sen risco de escribir no ambiente equivocado.
 */

const PERSOAS_ADMIN_CACHE_SEGUNDOS = 10 * 60;
const PERSOAS_TEXTO_LEGAL_ID_ = 'DATOS_PERSOA_SCPP';

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

    const incluirTextoLegal = datos && datos.incluirTextoLegalPersoas === true;
    if (valoresPersoas.length < 2) {
      const baleiro = { ok: true, perfil: administrador, persoas: [] };
      if (incluirTextoLegal) baleiro.textoLegalPersoas = obterTextoLegalPersoasAdmin_();
      return baleiro;
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

    const resposta = { ok: true, perfil: administrador, persoas: persoas };
    if (incluirTextoLegal) resposta.textoLegalPersoas = obterTextoLegalPersoasAdmin_();
    return resposta;
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

    const aceptacionSolicitada = datos && datos.aceptacion
      ? validarAceptacionPersoasAdmin_(datos.aceptacion)
      : null;

    const filaOrixinal = valores[indiceFila].slice();
    const fila = filaOrixinal.slice();
    aplicarEntradaPersoaAdmin_(fila, indices, entrada, false);
    actualizarNomeCompletoPersoaAdmin_(fila, indices);
    poñerValorPersoaAdmin_(fila, indices, 'DataActualizacionPerfil', new Date());
    poñerValorPersoaAdmin_(fila, indices, 'ActualizadoPor', administrador.email);

    let aceptacionRexistrada = null;
    if (!aceptacionSolicitada) {
      contexto.persoas
        .getRange(indiceFila + 1, 1, 1, fila.length)
        .setValues([fila]);
      SpreadsheetApp.flush();
    } else {
      aceptacionRexistrada = rexistrarAceptacionPersoasAdmin_(
        contexto,
        administrador,
        fila,
        indices,
        idActual,
        aceptacionSolicitada
      );
      try {
        contexto.persoas
          .getRange(indiceFila + 1, 1, 1, fila.length)
          .setValues([fila]);
        SpreadsheetApp.flush();
      } catch (erroPersoa) {
        if (aceptacionRexistrada && aceptacionRexistrada.rowId && aceptacionRexistrada.existente !== true) {
          try { eliminarAceptacionPersoasAdmin_(aceptacionRexistrada.rowId); } catch (erroRollback) {
            console.error('Non foi posible reverter Aceptación:', erroRollback);
          }
        }
        try {
          contexto.persoas
            .getRange(indiceFila + 1, 1, 1, filaOrixinal.length)
            .setValues([filaOrixinal]);
          SpreadsheetApp.flush();
        } catch (erroRestauracion) {
          console.error('Non foi posible restaurar Persoas:', erroRestauracion);
        }
        throw erroPersoa;
      }
    }

    return {
      ok: true,
      mensaxe: aceptacionRexistrada
        ? 'Datos e aceptación actualizados correctamente'
        : 'Datos actualizados correctamente',
      idPersoa: idActual,
      persoa: construirPersoaAdmin_(fila, indices),
      aceptacion: aceptacionRexistrada
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

function contextoAceptacionPersoasAdmin_() {
  const spreadsheetId = obterPropiedadeObrigatoria_('ACEPTACION_SPREADSHEET_ID');
  const aceptacionSheetId = Number(obterPropiedadeObrigatoria_('ACEPTACION_SHEET_ID'));
  const textosSheetId = Number(obterPropiedadeObrigatoria_('TEXTOS_LEGAIS_SHEET_ID'));
  const libro = SpreadsheetApp.openById(spreadsheetId);
  const aceptacion = libro.getSheetById(aceptacionSheetId);
  const textos = libro.getSheetById(textosSheetId);
  if (!aceptacion) throw new Error('Non se atopou a folla Aceptación configurada');
  if (!textos || textos.getName() !== 'TextosLegais') throw new Error('Non se atopou a folla TextosLegais configurada');
  return { aceptacion: aceptacion, textos: textos };
}

function normalizarDataLegalPersoasAdmin_(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor.getTime())) return valor;
  const texto = textoPersoasAdmin_(valor);
  let partes = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(texto);
  if (partes) return new Date(Number(partes[3]), Number(partes[2]) - 1, Number(partes[1]), 12, 0, 0);
  partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (partes) return new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]), 12, 0, 0);
  return null;
}

function obterTextoLegalPersoasAdmin_(versionSolicitada) {
  const contexto = contextoAceptacionPersoasAdmin_();
  const valores = contexto.textos.getDataRange().getValues();
  if (valores.length < 2) throw new Error('TextosLegais non contén textos');
  const indices = indicesPersoasAdmin_(valores[0]);
  ['Id', 'Version', 'Titulo', 'Texto', 'DataVixencia', 'Activo', 'Ambito'].forEach(function(cabeceira) {
    requireHeaderPersoasAdmin_(indices, cabeceira, 'TextosLegais');
  });

  const agora = new Date();
  const version = textoPersoasAdmin_(versionSolicitada);
  const candidatas = valores.slice(1).map(function(fila, indice) {
    return { fila: fila, indice: indice, data: normalizarDataLegalPersoasAdmin_(fila[indices.DataVixencia]) };
  }).filter(function(item) {
    const fila = item.fila;
    if (textoPersoasAdmin_(fila[indices.Id]) !== PERSOAS_TEXTO_LEGAL_ID_) return false;
    if (!item.data || item.data.getTime() > agora.getTime()) return false;
    if (version) return textoPersoasAdmin_(fila[indices.Version]) === version;
    return booleanoPersoasAdmin_(fila[indices.Activo]);
  }).sort(function(a, b) {
    return b.data.getTime() - a.data.getTime() || b.indice - a.indice;
  });

  if (!candidatas.length) {
    throw new Error(version
      ? 'Non se atopou a versión legal ' + version + ' para Persoas'
      : 'Non hai un texto legal activo para Persoas');
  }

  const fila = candidatas[0].fila;
  const resultado = {
    id: textoPersoasAdmin_(fila[indices.Id]),
    version: textoPersoasAdmin_(fila[indices.Version]),
    titulo: textoPersoasAdmin_(fila[indices.Titulo]),
    texto: textoPersoasAdmin_(fila[indices.Texto]),
    ambito: textoPersoasAdmin_(fila[indices.Ambito]),
    dataVixencia: Utilities.formatDate(candidatas[0].data, 'Europe/Madrid', 'dd/MM/yyyy')
  };
  if (!resultado.version || !resultado.titulo || !resultado.texto) throw new Error('O texto legal de Persoas está incompleto');
  return resultado;
}

function validarAceptacionPersoasAdmin_(entrada) {
  const aceptacion = entrada && typeof entrada === 'object' ? entrada : {};
  if (aceptacion.aceptaFines !== true) throw new Error('É necesario confirmar a aceptación do tratamento de datos');
  const idTextoLegal = textoPersoasAdmin_(aceptacion.idTextoLegal);
  if (idTextoLegal !== PERSOAS_TEXTO_LEGAL_ID_) throw new Error('O texto legal indicado non corresponde á revisión de Persoas');
  const version = textoPersoasAdmin_(aceptacion.version);
  if (!version) throw new Error('Non se indicou a versión do texto legal');
  const revisionId = textoPersoasAdmin_(aceptacion.revisionId);
  if (!/^[A-Za-z0-9-]{8,100}$/.test(revisionId)) throw new Error('O identificador da revisión non é válido');
  const documento = textoPersoasAdmin_(aceptacion.documento);
  if (!/^persoas\/aceptacions\/[A-Za-z0-9_-]+\/aceptacion-[A-Za-z0-9_-]+\.pdf$/.test(documento)) {
    throw new Error('A ruta do documento de aceptación non é válida');
  }
  return {
    idTextoLegal: idTextoLegal,
    version: version,
    revisionId: revisionId,
    documento: documento,
    xeradaPor: normalizarEmailPersoasAdmin_(aceptacion.xeradaPor),
    textoLegal: obterTextoLegalPersoasAdmin_(version)
  };
}

function obterUsuarioWebAceptacionPersoasAdmin_(contexto, idPersoa, correo) {
  const valores = contexto.usuarios.getDataRange().getValues();
  if (valores.length < 2) return '';
  const indices = indicesPersoasAdmin_(valores[0]);
  if (indices.Persoa === undefined && indices.Email === undefined) return '';
  const fila = valores.slice(1).find(function(item) {
    const persoa = indices.Persoa === undefined ? '' : textoPersoasAdmin_(item[indices.Persoa]);
    const email = indices.Email === undefined ? '' : normalizarEmailPersoasAdmin_(item[indices.Email]);
    return (idPersoa && persoa === idPersoa) || (correo && email === correo);
  });
  if (!fila) return '';
  return indices['Row ID'] === undefined ? '' : textoPersoasAdmin_(fila[indices['Row ID']]);
}

function rexistrarAceptacionPersoasAdmin_(contexto, administrador, filaPersoa, indicesPersoa, idPersoa, aceptacion) {
  const follas = contextoAceptacionPersoasAdmin_();
  const valores = follas.aceptacion.getDataRange().getValues();
  if (!valores.length) throw new Error('A folla Aceptación non ten cabeceiras');
  const indices = indicesPersoasAdmin_(valores[0]);
  [
    'Row ID', 'Correo electrónico', 'Fecha_Hora', 'Versión', 'Texto_Legal',
    'Acepta_Fines', 'Persoa', 'UsuarioWeb', 'Ambito', 'Canle', 'DataRetirada',
    'TipoAceptacion', 'Estado', 'Documento', 'Observacións', 'Responsable'
  ].forEach(function(cabeceira) { requireHeaderPersoasAdmin_(indices, cabeceira, 'Aceptación'); });

  const marcador = 'Revisión ' + aceptacion.revisionId;
  const existente = valores.slice(1).find(function(fila) {
    return textoPersoasAdmin_(fila[indices.Persoa]) === idPersoa &&
      textoPersoasAdmin_(fila[indices['Observacións']]).indexOf(marcador) >= 0;
  });
  if (existente) {
    return {
      rowId: textoPersoasAdmin_(existente[indices['Row ID']]),
      version: textoPersoasAdmin_(existente[indices['Versión']]),
      documento: textoPersoasAdmin_(existente[indices.Documento]),
      revisionId: aceptacion.revisionId,
      existente: true
    };
  }

  const correo = indicesPersoa['Correo electrónico'] === undefined
    ? ''
    : normalizarEmailPersoasAdmin_(filaPersoa[indicesPersoa['Correo electrónico']]);
  const usuarioWeb = obterUsuarioWebAceptacionPersoasAdmin_(contexto, idPersoa, correo);
  const nova = new Array(valores[0].length).fill('');
  const poñer = function(cabeceira, valor) { nova[indices[cabeceira]] = valor; };
  const rowId = Utilities.getUuid();
  const agora = new Date();

  poñer('Row ID', rowId);
  poñer('Correo electrónico', correo);
  poñer('Fecha_Hora', agora);
  poñer('Versión', aceptacion.textoLegal.version);
  poñer('Texto_Legal', aceptacion.textoLegal.texto);
  poñer('Acepta_Fines', true);
  poñer('Persoa', idPersoa);
  poñer('UsuarioWeb', usuarioWeb);
  poñer('Ambito', aceptacion.textoLegal.ambito);
  poñer('Canle', 'Web · revisión de datos');
  poñer('DataRetirada', '');
  poñer('TipoAceptacion', 'Tratamento de datos persoais');
  poñer('Estado', 'Aceptada');
  poñer('Documento', aceptacion.documento);
  poñer('Observacións', marcador + ' · Ligazón xerada por ' + (aceptacion.xeradaPor || administrador.email));
  poñer('Responsable', 'Persoa interesada');

  follas.aceptacion.appendRow(nova);
  return {
    rowId: rowId,
    version: aceptacion.textoLegal.version,
    documento: aceptacion.documento,
    revisionId: aceptacion.revisionId,
    fechaHora: Utilities.formatDate(agora, 'Europe/Madrid', 'yyyy-MM-dd HH:mm:ss'),
    existente: false
  };
}

function eliminarAceptacionPersoasAdmin_(rowId) {
  const follas = contextoAceptacionPersoasAdmin_();
  const valores = follas.aceptacion.getDataRange().getValues();
  if (valores.length < 2) return false;
  const indices = indicesPersoasAdmin_(valores[0]);
  requireHeaderPersoasAdmin_(indices, 'Row ID', 'Aceptación');
  for (let i = 1; i < valores.length; i += 1) {
    if (textoPersoasAdmin_(valores[i][indices['Row ID']]) === textoPersoasAdmin_(rowId)) {
      follas.aceptacion.deleteRow(i + 1);
      SpreadsheetApp.flush();
      return true;
    }
  }
  return false;
}
// === PERSOAS_ENVIO_REVISION_PRODUCION_V1 ===
function enviarRevisionsPersoasAdministracion_(datos) {
  try {
    var ambiente = obterAmbienteSCPP_();
    if (ambiente !== 'production') {
      throw new Error('Envío de correos bloqueado no ambiente ' + ambiente);
    }

    var propiedades = PropertiesService.getScriptProperties();
    var permitirEnvio = String(
      propiedades.getProperty('PERSOAS_ALLOW_EMAIL_SEND') || ''
    ).toLowerCase() === 'true';
    if (!permitirEnvio) {
      throw new Error('O envío de correos de Persoas non está activado en Produción');
    }

    var emailAdmin = normalizarEmailPersoasAdmin_(datos && datos.email);
    var contexto = obterContextoPersoasAdmin_();
    var valores = contexto.persoas.getDataRange().getValues();
    var administrador = obterAdministradorPersoasAdmin_(contexto, emailAdmin, valores);
    if (!administrador) return { ok: false, erro: 'Usuario non autorizado' };

    var envios = datos && Array.isArray(datos.envios) ? datos.envios : [];
    if (!envios.length) return { ok: false, erro: 'Non se indicaron correos para enviar' };
    if (envios.length > 100) return { ok: false, erro: 'Máximo 100 envíos por operación' };

    var cota = MailApp.getRemainingDailyQuota();
    if (cota < envios.length) {
      return {
        ok: false,
        erro: 'Cota diaria de correo insuficiente. Dispoñibles: ' + cota + ' · necesarios: ' + envios.length
      };
    }

    limparRexistrosEnvioPersoas_(propiedades);

    var indices = indicesPersoasAdmin_(valores[0] || []);
    requireHeaderPersoasAdmin_(indices, 'Id', 'Persoas');
    var bloqueo = LockService.getScriptLock();
    bloqueo.waitLock(15000);

    var enviados = 0;
    var omitidos = 0;
    var erros = 0;
    var detalle = [];

    try {
      envios.forEach(function(item) {
        var revisionId = textoPersoasAdmin_(item && item.revisionId);
        var idPersoa = textoPersoasAdmin_(item && item.idPersoa);
        var correo = primeiroCorreoPersoasEmail_(item && item.correo);
        var nome = textoPersoasAdmin_(item && item.nome) || idPersoa;
        var ligazon = textoPersoasAdmin_(item && item.ligazon);
        var caducaEn = textoPersoasAdmin_(item && item.caducaEn);
        var versionLegal = textoPersoasAdmin_(item && item.versionLegal);

        if (!revisionId || !idPersoa || !correo || !ligazon) {
          erros++;
          detalle.push({ idPersoa: idPersoa, nome: nome, correo: correo, estado: 'ERRO', motivo: 'Datos de envío incompletos' });
          return;
        }

        if (!/^https:\/\/(?:www\.)?coralpolifonicapontevedra\.org\/revision-datos\/?\?token=[A-Za-z0-9_-]{30,160}(?:&.*)?$/i.test(ligazon)) {
          erros++;
          detalle.push({ idPersoa: idPersoa, nome: nome, correo: correo, estado: 'ERRO', motivo: 'Ligazón non pertencente a Produción' });
          return;
        }

        var indiceFila = atoparIndiceFilaPersoaAdmin_(valores, indices, idPersoa);
        if (indiceFila < 1) {
          erros++;
          detalle.push({ idPersoa: idPersoa, nome: nome, correo: correo, estado: 'ERRO', motivo: 'Persoa non atopada' });
          return;
        }

        var persoaActual = construirPersoaAdmin_(valores[indiceFila], indices);
        if (persoaActual.activo !== true) {
          omitidos++;
          detalle.push({ idPersoa: idPersoa, nome: nome, correo: correo, estado: 'OMITIDO', motivo: 'Persoa non activa' });
          return;
        }

        var correoActual = primeiroCorreoPersoasEmail_(persoaActual.correo);
        if (!correoActual || correoActual !== correo) {
          omitidos++;
          detalle.push({ idPersoa: idPersoa, nome: nome, correo: correo, estado: 'OMITIDO', motivo: 'O correo actual da ficha xa non coincide co da revisión' });
          return;
        }

        if (caducaEn && new Date(caducaEn).getTime() <= Date.now()) {
          omitidos++;
          detalle.push({ idPersoa: idPersoa, nome: nome, correo: correo, estado: 'OMITIDO', motivo: 'Ligazón caducada' });
          return;
        }

        var chaveEnvio = 'PERSOAS_EMAIL_SENT_' + revisionId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
        if (propiedades.getProperty(chaveEnvio)) {
          omitidos++;
          detalle.push({ idPersoa: idPersoa, nome: nome, correo: correo, estado: 'OMITIDO', motivo: 'Este enlace xa foi enviado anteriormente' });
          return;
        }

        var asunto = 'Revisión dos teus datos persoais · Sociedade Coral Polifónica de Pontevedra';
        var nomeSeguro = escaparHtmlPersoasEmail_(nome);
        var ligazonSegura = escaparHtmlPersoasEmail_(ligazon);
        var caducidadeTexto = caducaEn
          ? Utilities.formatDate(new Date(caducaEn), 'Europe/Madrid', 'dd/MM/yyyy HH:mm')
          : '';
        var corpoTexto =
          'Ola ' + nome + ',\n\n' +
          'A Sociedade Coral Polifónica de Pontevedra solicita que revises os datos persoais que temos rexistrados e confirmes o texto legal aplicable.\n\n' +
          'Ligazón individual: ' + ligazon + '\n' +
          (caducidadeTexto ? 'Caduca: ' + caducidadeTexto + '\n' : '') +
          '\nA ligazón é persoal e non debe compartirse. Ao completar a revisión quedará rexistrada a aceptación e xerarase o correspondente documento PDF.\n\n' +
          'Sociedade Coral Polifónica de Pontevedra';
        var corpoHtml =
          '<p>Ola <strong>' + nomeSeguro + '</strong>,</p>' +
          '<p>A Sociedade Coral Polifónica de Pontevedra solicita que revises os datos persoais que temos rexistrados e confirmes o texto legal aplicable.</p>' +
          '<p><a href="' + ligazonSegura + '" style="display:inline-block;padding:10px 16px;background:#741827;color:#fff;text-decoration:none;font-weight:bold">Revisar os meus datos</a></p>' +
          (caducidadeTexto ? '<p><strong>Caducidade:</strong> ' + escaparHtmlPersoasEmail_(caducidadeTexto) + '</p>' : '') +
          '<p>Esta ligazón é individual e non debe compartirse. Ao completar a revisión quedará rexistrada a aceptación e xerarase o correspondente documento PDF.</p>' +
          '<p>Sociedade Coral Polifónica de Pontevedra</p>';

        try {
          MailApp.sendEmail({
            to: correo,
            subject: asunto,
            body: corpoTexto,
            htmlBody: corpoHtml,
            name: 'Sociedade Coral Polifónica de Pontevedra',
            replyTo: 'coralpolifonicapontevedra@gmail.com'
          });
          propiedades.setProperty(chaveEnvio, JSON.stringify({
            enviadoEn: new Date().toISOString(),
            idPersoa: idPersoa,
            correo: correo,
            versionLegal: versionLegal
          }));
          enviados++;
          detalle.push({ idPersoa: idPersoa, nome: nome, correo: correo, estado: 'ENVIADO' });
          rexistrarAcceso({
            email: administrador.email,
            tipoEvento: 'Enviar revisión de datos',
            modulo: 'Administración · Persoas',
            resultado: 'Correcto',
            detalle: 'Persoa ' + idPersoa + ' · versión ' + versionLegal
          });
        } catch (erroEnvio) {
          erros++;
          detalle.push({ idPersoa: idPersoa, nome: nome, correo: correo, estado: 'ERRO', motivo: String(erroEnvio && erroEnvio.message ? erroEnvio.message : erroEnvio) });
          rexistrarAcceso({
            email: administrador.email,
            tipoEvento: 'Enviar revisión de datos',
            modulo: 'Administración · Persoas',
            resultado: 'Erro',
            detalle: 'Persoa ' + idPersoa
          });
        }
      });
    } finally {
      try { bloqueo.releaseLock(); } catch (ignorado) {}
    }

    return {
      ok: true,
      ambiente: ambiente,
      enviados: enviados,
      omitidos: omitidos,
      erros: erros,
      detalle: detalle
    };
  } catch (erro) {
    console.error('Erro en enviarRevisionsPersoasAdministracion_:', erro && erro.stack ? erro.stack : erro);
    return { ok: false, erro: erro && erro.message ? String(erro.message) : String(erro) };
  }
}

function primeiroCorreoPersoasEmail_(value) {
  var candidatos = String(value || '').split(/[;,\s]+/).map(function(v) {
    return String(v || '').trim().toLowerCase();
  }).filter(Boolean);
  for (var i = 0; i < candidatos.length; i++) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidatos[i])) return candidatos[i];
  }
  return '';
}

function escaparHtmlPersoasEmail_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function limparRexistrosEnvioPersoas_(propiedades) {
  var todas = propiedades.getProperties();
  var limite = Date.now() - (21 * 24 * 60 * 60 * 1000);
  Object.keys(todas).forEach(function(chave) {
    if (chave.indexOf('PERSOAS_EMAIL_SENT_') !== 0) return;
    try {
      var meta = JSON.parse(todas[chave]);
      var momento = Date.parse(meta && meta.enviadoEn ? meta.enviadoEn : '');
      if (!momento || momento < limite) propiedades.deleteProperty(chave);
    } catch (erro) {
      propiedades.deleteProperty(chave);
    }
  });
}
// === /PERSOAS_ENVIO_REVISION_PRODUCION_V1 ===

