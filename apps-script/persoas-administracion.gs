/*
 * Portal > Administración > Persoas.
 * Versión conservadora: autorización compatible + fichas desde R2.
 *
 * Mantén la estructura de datos utilizada por la página existente.
 * La web no descarga ningún PDF desde Drive ni usa Base64.
 */

const PERSOAS_ADMIN_CONFIG = {
  persoasSpreadsheetId: '13-WeSz69A50XxPP57HA64Nascx6kXQFbeVKron0wATQ',
  persoasSheetId: 388888827,
  usuariosSpreadsheetId: '1qbW0q1Z6U3JnW0yGM4ELUWqjRkyNdJckJx0VGSoK-i8',
  usuariosSheetId: 1291817000
};

const PERSOAS_ADMIN_CACHE_SEGUNDOS = 10 * 60;

function probarPersoasAdministracion() {
  const inicio = Date.now();

  const resultado = listarPersoasAdministracion_({
    email: 'jcuinas@gmail.com'
  });

  const persoas = Array.isArray(resultado.persoas)
    ? resultado.persoas
    : [];

  console.log(JSON.stringify({
    ok: resultado.ok === true,
    erro: resultado.erro || '',
    perfil: resultado.perfil || null,
    totalPersoas: persoas.length,
    fichasR2: persoas.filter(function(persoa) {
      return persoa.fichaDisponibleR2 === true;
    }).length,
    duracionMs: Date.now() - inicio
  }));
}

function listarPersoasAdministracion_(datos) {
  try {
    const email = normalizarEmailPersoasAdmin_(datos && datos.email);
    const contexto = obterContextoPersoasAdmin_();

    // Persoas léese unha única vez para autorización e listado.
    const valoresPersoas = contexto.persoas.getDataRange().getValues();
    const administrador = obterAdministradorPersoasAdmin_(
      contexto,
      email,
      valoresPersoas
    );

    if (!administrador) {
      return { ok: false, erro: 'Usuario non autorizado' };
    }

    if (valoresPersoas.length < 2) {
      return {
        ok: true,
        perfil: administrador,
        persoas: []
      };
    }

    const indices = indicesPersoasAdmin_(valoresPersoas[0]);
    requireHeaderPersoasAdmin_(indices, 'Id', 'Persoas');

    const persoas = valoresPersoas.slice(1).reduce(
      function(saida, fila) {
        const id = textoPersoasAdmin_(fila[indices.Id]);
        const rowId = indices['Row ID'] === undefined
          ? ''
          : textoPersoasAdmin_(fila[indices['Row ID']]);

        if (!id && !rowId) return saida;

        saida.push(
          construirPersoaAdmin_(fila, indices)
        );
        return saida;
      },
      []
    );

    persoas.sort(function(a, b) {
      return a.etiqueta.localeCompare(
        b.etiqueta,
        'gl',
        { sensitivity: 'base' }
      );
    });

    return {
      ok: true,
      perfil: administrador,
      persoas: persoas
    };
  } catch (erro) {
    console.error(
      'Erro en listarPersoasAdministracion_:',
      erro && erro.stack ? erro.stack : erro
    );
    return {
      ok: false,
      erro: 'Non foi posible consultar as persoas',
      detalle: erro && erro.message
        ? String(erro.message)
        : String(erro)
    };
  }
}

/*
 * Valida permisos e devolve só a clave privada de R2.
 * O Worker é quen le R2 e entrega o PDF.
 */
function obterFichaPersoaAdministracion_(datos) {
  try {
    const email = normalizarEmailPersoasAdmin_(
      datos && datos.email
    );

    const referencia = textoPersoasAdmin_(
      datos && (
        datos.idPersoa ||
        datos.id ||
        datos.rowId
      )
    );

    if (!referencia) {
      return {
        ok: false,
        erro: 'Non se indicou a persoa'
      };
    }

    const contexto = obterContextoPersoasAdmin_();
    const valoresPersoas =
      contexto.persoas.getDataRange().getValues();

    const administrador = obterAdministradorPersoasAdmin_(
      contexto,
      email,
      valoresPersoas
    );

    if (!administrador) {
      return {
        ok: false,
        erro: 'Usuario non autorizado'
      };
    }

    const indices = indicesPersoasAdmin_(
      valoresPersoas[0] || []
    );

    requireHeaderPersoasAdmin_(
      indices,
      'Id',
      'Persoas'
    );
    requireHeaderPersoasAdmin_(
      indices,
      'FichaR2Key',
      'Persoas'
    );
    requireHeaderPersoasAdmin_(
      indices,
      'FichaR2Estado',
      'Persoas'
    );

    const fila = valoresPersoas.slice(1).find(
      function(item) {
        const id = textoPersoasAdmin_(
          item[indices.Id]
        );
        const rowId =
          indices['Row ID'] === undefined
            ? ''
            : textoPersoasAdmin_(
                item[indices['Row ID']]
              );

        return (
          referencia === id ||
          referencia === rowId
        );
      }
    );

    if (!fila) {
      return {
        ok: false,
        erro: 'Non se atopou a persoa solicitada'
      };
    }

    const r2Key = textoPersoasAdmin_(
      fila[indices.FichaR2Key]
    );
    const estado = textoPersoasAdmin_(
      fila[indices.FichaR2Estado]
    );

    if (!r2Key) {
      return {
        ok: false,
        erro: 'Esta persoa non ten ficha dispoñible en R2'
      };
    }

    if (estado !== 'SINCRONIZADO') {
      return {
        ok: false,
        erro:
          estado === 'CONFLITO'
            ? 'A ficha ten un conflito de sincronización'
            : 'A ficha aínda non está sincronizada con R2'
      };
    }

    return {
      ok: true,
      idPersoa: textoPersoasAdmin_(
        fila[indices.Id]
      ),
      r2Key: r2Key,
      nomeFicheiro:
        r2Key.split('/').pop() || 'ficha.pdf',
      mimeType:
        indices.FichaR2MimeType === undefined
          ? 'application/pdf'
          : (
              textoPersoasAdmin_(
                fila[indices.FichaR2MimeType]
              ) || 'application/pdf'
            ),
      etag:
        indices.FichaR2ETag === undefined
          ? ''
          : textoPersoasAdmin_(
              fila[indices.FichaR2ETag]
            ),
      size:
        indices.FichaR2Size === undefined
          ? ''
          : textoPersoasAdmin_(
              fila[indices.FichaR2Size]
            )
    };
  } catch (erro) {
    console.error(
      'Erro en obterFichaPersoaAdministracion_:',
      erro && erro.stack ? erro.stack : erro
    );
    return {
      ok: false,
      erro: 'Non foi posible consultar a ficha',
      detalle: erro && erro.message
        ? String(erro.message)
        : String(erro)
    };
  }
}

function obterContextoPersoasAdmin_() {
  const persoas = SpreadsheetApp
    .openById(
      PERSOAS_ADMIN_CONFIG.persoasSpreadsheetId
    )
    .getSheetById(
      PERSOAS_ADMIN_CONFIG.persoasSheetId
    );

  const usuarios = SpreadsheetApp
    .openById(
      PERSOAS_ADMIN_CONFIG.usuariosSpreadsheetId
    )
    .getSheetById(
      PERSOAS_ADMIN_CONFIG.usuariosSheetId
    );

  if (!persoas || persoas.getName() !== 'Persoas') {
    throw new Error(
      'Non se atopou a folla Persoas'
    );
  }

  if (
    !usuarios ||
    usuarios.getName() !== 'UsuariosWeb'
  ) {
    throw new Error(
      'Non se atopou a folla UsuariosWeb'
    );
  }

  return {
    persoas: persoas,
    usuarios: usuarios
  };
}

function obterAdministradorPersoasAdmin_(
  contexto,
  email,
  valoresPersoas
) {
  if (!email) return null;

  const cache = CacheService.getScriptCache();
  const claveCache =
    'persoas-admin-v5:' + email;
  const cacheado = cache.get(claveCache);

  if (cacheado) {
    try {
      return JSON.parse(cacheado);
    } catch (erroCache) {
      console.warn(
        'Cache de administración non válida:',
        erroCache
      );
    }
  }

  const valoresUsuarios =
    contexto.usuarios.getDataRange().getValues();

  if (valoresUsuarios.length < 2) {
    return null;
  }

  const iu = indicesPersoasAdmin_(
    valoresUsuarios[0]
  );

  requireHeaderPersoasAdmin_(
    iu,
    'Email',
    'UsuariosWeb'
  );
  requireHeaderPersoasAdmin_(
    iu,
    'Activo',
    'UsuariosWeb'
  );
  requireHeaderPersoasAdmin_(
    iu,
    'Persoa',
    'UsuariosWeb'
  );

  const usuario = valoresUsuarios
    .slice(1)
    .find(function(fila) {
      return (
        normalizarEmailPersoasAdmin_(
          fila[iu.Email]
        ) === email &&
        booleanoPersoasAdmin_(
          fila[iu.Activo]
        )
      );
    });

  if (!usuario) return null;

  const referencia = textoPersoasAdmin_(
    usuario[iu.Persoa]
  );

  const persoas =
    valoresPersoas ||
    contexto.persoas.getDataRange().getValues();

  const ip = indicesPersoasAdmin_(
    persoas[0] || []
  );

  requireHeaderPersoasAdmin_(
    ip,
    'Id',
    'Persoas'
  );

  const persoa = persoas
    .slice(1)
    .find(function(fila) {
      const id = textoPersoasAdmin_(
        fila[ip.Id]
      );
      const rowId =
        ip['Row ID'] === undefined
          ? ''
          : textoPersoasAdmin_(
              fila[ip['Row ID']]
            );
      const correo =
        ip['Correo electrónico'] === undefined
          ? ''
          : normalizarEmailPersoasAdmin_(
              fila[ip['Correo electrónico']]
            );

      return (
        (referencia &&
          (
            referencia === id ||
            referencia === rowId
          )) ||
        correo === email
      );
    });

  if (!persoa) return null;

  const administradorExplicito =
    iu.Administrador !== undefined &&
    booleanoPersoasAdmin_(
      usuario[iu.Administrador]
    );

  const cargo =
    ip.Cargo === undefined
      ? ''
      : normalizarTextoPersoasAdmin_(
          persoa[ip.Cargo]
        );

  const administradorPorCargo = [
    'presidente',
    'presidenta',
    'vicepresidente',
    'vicepresidenta',
    'secretario',
    'secretaria',
    'vicesecretario',
    'vicesecretaria',
    'tesoureiro',
    'tesoureira',
    'contador',
    'contadora'
  ].some(function(valor) {
    return cargo.indexOf(valor) >= 0;
  });

  const modulos =
    iu.ModulosPermitidos === undefined
      ? ''
      : normalizarTextoPersoasAdmin_(
          usuario[iu.ModulosPermitidos]
        );

  const administradorPorModulo =
    modulos
      .split(',')
      .map(function(valor) {
        return valor.trim();
      })
      .indexOf('persoas') >= 0;

  if (
    !administradorExplicito &&
    !administradorPorCargo &&
    !administradorPorModulo
  ) {
    return null;
  }

  const indiceNomeCompleto =
    ip.Nomecompleto !== undefined
      ? ip.Nomecompleto
      : ip.NomeCompleto;

  const perfil = {
    email: email,
    idPersoa: textoPersoasAdmin_(
      persoa[ip.Id]
    ),
    nome:
      (
        iu.Nome === undefined
          ? ''
          : textoPersoasAdmin_(
              usuario[iu.Nome]
            )
      ) ||
      (
        indiceNomeCompleto === undefined
          ? ''
          : textoPersoasAdmin_(
              persoa[indiceNomeCompleto]
            )
      ),
    cargo:
      ip.Cargo === undefined
        ? ''
        : textoPersoasAdmin_(
            persoa[ip.Cargo]
          ),
    nivel: 'Administración'
  };

  try {
    cache.put(
      claveCache,
      JSON.stringify(perfil),
      PERSOAS_ADMIN_CACHE_SEGUNDOS
    );
  } catch (erroCache) {
    console.warn(
      'Non se puido gardar a cache:',
      erroCache
    );
  }

  return perfil;
}

function construirPersoaAdmin_(
  fila,
  indices
) {
  const valor = function(cabeceira) {
    const indice = indices[cabeceira];
    return indice === undefined
      ? ''
      : fila[indice];
  };

  const texto = function(cabeceira) {
    return textoPersoasAdmin_(
      valor(cabeceira)
    );
  };

  const nome = texto('Nome');
  const primeiro = texto(
    'Primeiro apelido'
  );
  const segundo = texto(
    'Segundo apelido'
  );

  const completo =
    texto('Nomecompleto') ||
    texto('NomeCompleto') ||
    [nome, primeiro, segundo]
      .filter(Boolean)
      .join(' ');

  const id = texto('Id');
  const rowId = texto('Row ID');
  const fichaR2Key =
    texto('FichaR2Key');
  const fichaR2Estado =
    texto('FichaR2Estado');

  return {
    // Mantéñense os tres identificadores
    // para compatibilidade co frontend actual.
    rowId: rowId || id,
    id: id,
    idPersoa: id,

    etiqueta:
      [primeiro, segundo, nome]
        .filter(Boolean)
        .join(' · '),

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
    activo: booleanoPersoasAdmin_(
      valor('Activo')
    ),
    mostrarWeb: booleanoPersoasAdmin_(
      valor('MostrarWeb')
    ),
    cargo: texto('Cargo'),
    tipoSocio: texto('Tipo de socio'),
    dataNacemento:
      formatarDataPersoasAdmin_(
        valor('DataNacemento')
      ),
    dataIncorporacion:
      formatarDataPersoasAdmin_(
        valor('DataIncorporacionSCPP')
      ),
    contactoEmerxencia:
      texto('ContactoEmerxencia'),
    telefonoEmerxencia:
      texto('TelefonoEmerxencia'),
    preferenciaComunicacion:
      texto('PreferenciaComunicacion'),
    consentimentoFoto:
      texto('ConsentimentoFoto'),
    mostrarAniversario:
      booleanoPersoasAdmin_(
        valor('MostrarAniversario')
      ),
    observacions:
      texto('Observacións'),
    observacionsPrivadas:
      texto('ObservacionsPrivadas'),
    actualizadoPor:
      texto('ActualizadoPor'),
    dataActualizacion:
      formatarDataHoraPersoasAdmin_(
        valor('DataActualizacionPerfil')
      ),

    // Ficha orixinal queda como metadato.
    ficha: texto('Ficha'),

    // A web só utiliza estes campos.
    fichaR2Key: fichaR2Key,
    fichaR2Estado: fichaR2Estado,
    fichaDisponibleR2:
      Boolean(fichaR2Key) &&
      fichaR2Estado === 'SINCRONIZADO'
  };
}

function indicesPersoasAdmin_(cabeceiras) {
  return cabeceiras.reduce(
    function(saida, valor, indice) {
      saida[
        String(valor || '').trim()
      ] = indice;
      return saida;
    },
    {}
  );
}

function requireHeaderPersoasAdmin_(
  indices,
  cabeceira,
  folla
) {
  if (indices[cabeceira] === undefined) {
    throw new Error(
      'Falta a columna ' +
      cabeceira +
      ' na folla ' +
      folla
    );
  }
}

function textoPersoasAdmin_(valor) {
  return valor == null
    ? ''
    : String(valor).trim();
}

function normalizarEmailPersoasAdmin_(
  valor
) {
  return textoPersoasAdmin_(
    valor
  ).toLowerCase();
}

function normalizarTextoPersoasAdmin_(
  valor
) {
  return textoPersoasAdmin_(valor)
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .toLowerCase();
}

function booleanoPersoasAdmin_(valor) {
  if (valor === true) return true;

  return [
    'true',
    'y',
    'si',
    'sí',
    'yes',
    '1',
    'verdadeiro'
  ].indexOf(
    normalizarTextoPersoasAdmin_(
      valor
    )
  ) >= 0;
}

function formatarDataPersoasAdmin_(
  valor
) {
  if (
    Object.prototype.toString.call(
      valor
    ) === '[object Date]' &&
    !isNaN(valor.getTime())
  ) {
    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone() ||
        'Europe/Madrid',
      'dd/MM/yyyy'
    );
  }

  return textoPersoasAdmin_(valor);
}

function formatarDataHoraPersoasAdmin_(
  valor
) {
  if (
    Object.prototype.toString.call(
      valor
    ) === '[object Date]' &&
    !isNaN(valor.getTime())
  ) {
    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone() ||
        'Europe/Madrid',
      'dd/MM/yyyy HH:mm'
    );
  }

  return textoPersoasAdmin_(valor);
}

function probarFichaPersoaAdministracionR2() {
  const inicio = Date.now();

  const resultado = obterFichaPersoaAdministracion_({
    email: 'jcuinas@gmail.com',
    idPersoa: '37'
  });

  console.log(JSON.stringify({
    ok: resultado.ok,
    erro: resultado.erro || '',
    idPersoa: resultado.idPersoa || '',
    r2Key: resultado.r2Key || '',
    nomeFicheiro: resultado.nomeFicheiro || '',
    mimeType: resultado.mimeType || '',
    size: resultado.size || '',
    tenBase64: Boolean(resultado.base64),
    duracionMs: Date.now() - inicio
  }));
}