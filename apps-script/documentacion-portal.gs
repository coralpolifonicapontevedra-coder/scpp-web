/*
 * Módulo do Apps Script para o Portal > Documentación.
 *
 * Integración no doPost existente:
 *
 * case 'listarDocumentacionPortal':
 *   return responderJson_(listarDocumentacionPortal_(datos));
 * case 'obterFicheiroDocumentacion':
 *   return responderJson_(obterFicheiroDocumentacion_(datos));
 *
 * Este ficheiro non substitúe o doPost actual: engade estas dúas accións ao
 * despachador xa existente, que debe seguir validando WEB_WRITE_TOKEN.
 */

const DOC_PORTAL_CONFIG = {
  spreadsheetId: '1sAMi9TWZ7YwjOxu1a-KliO_7LtYlo4Zf2AowmPKDQX8',
  sheetDocumentacion: 'Documentación',
  sheetActas: 'Actas XD e AX',
  folderDocumentacionId: '1T8izGJMWiWH0cSNHyKIDvSQZXtB2LgyQ',
  folderActasId: '1dJpIGV-i6kvu6gTkeTphpz9uopvHO2MR'
};

const DOC_NIVEIS = {
  Coralistas: 1,
  'Xunta Directiva': 2,
  Administración: 3
};

function listarDocumentacionPortal_(datos) {
  const email = normalizarEmailDoc_(datos && datos.email);
  const perfil = obterPerfilDocumentacion_(email);
  if (!perfil) return { ok: false, erro: 'Usuario non autorizado' };

  const ss = SpreadsheetApp.openById(DOC_PORTAL_CONFIG.spreadsheetId);
  const documentos = [];
  documentos.push.apply(documentos, lerDocumentosXerais_(ss, perfil));
  documentos.push.apply(documentos, lerActas_(ss, perfil));

  documentos.sort(function(a, b) {
    const seccion = String(a.seccion).localeCompare(String(b.seccion), 'gl');
    if (seccion) return seccion;
    const pendenteA = String(a.estado).toLowerCase().indexOf('pendente') >= 0 ? 0 : 1;
    const pendenteB = String(b.estado).toLowerCase().indexOf('pendente') >= 0 ? 0 : 1;
    if (pendenteA !== pendenteB) return pendenteA - pendenteB;
    return String(b.dataIso || '').localeCompare(String(a.dataIso || '')) || Number(a.orde || 9999) - Number(b.orde || 9999);
  });

  return {
    ok: true,
    perfil: perfil,
    nivel: perfil.nivel,
    documentos: documentos
  };
}

function obterFicheiroDocumentacion_(datos) {
  const email = normalizarEmailDoc_(datos && datos.email);
  const ruta = String(datos && datos.ruta || '').trim();
  const clase = String(datos && datos.clase || '').trim();
  if (!ruta) return { ok: false, erro: 'Non se indicou o documento' };

  const listado = listarDocumentacionPortal_({ email: email });
  if (!listado.ok) return listado;
  const autorizado = listado.documentos.some(function(documento) {
    return documento.ruta === ruta && documento.clase === clase;
  });
  if (!autorizado) return { ok: false, erro: 'Non tes permiso para acceder a este documento' };

  const folderId = clase === 'acta'
    ? DOC_PORTAL_CONFIG.folderActasId
    : DOC_PORTAL_CONFIG.folderDocumentacionId;
  const nome = ruta.split('/').pop();
  const ficheiros = DriveApp.getFolderById(folderId).getFilesByName(nome);
  if (!ficheiros.hasNext()) return { ok: false, erro: 'Non se localizou o ficheiro solicitado' };
  const ficheiro = ficheiros.next();
  const blob = ficheiro.getBlob();
  return {
    ok: true,
    nomeFicheiro: ficheiro.getName(),
    mimeType: blob.getContentType() || 'application/pdf',
    base64: Utilities.base64Encode(blob.getBytes())
  };
}

function lerDocumentosXerais_(ss, perfil) {
  const sheet = ss.getSheetByName(DOC_PORTAL_CONFIG.sheetDocumentacion);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const valores = sheet.getDataRange().getDisplayValues();
  const headers = mapaHeadersDoc_(valores.shift());
  return valores.reduce(function(saida, row) {
    if (!verdadeiroDoc_(row[headers.Publicar_Portal])) return saida;
    const nivel = nivelCanonicoDoc_(row[headers.Nivel_Acceso]);
    if (!podeVerDoc_(perfil.nivel, nivel)) return saida;
    const ruta = String(row[headers.Ficheiro] || '').trim();
    if (!ruta) return saida;
    const titulo = String(row[headers.Título] || '').trim();
    const tipo = String(row[headers.Tipo_Documento] || 'Outros').trim();
    const seccion = nivel === 'Administración'
      ? 'administracion'
      : eTransparenciaDoc_(titulo, tipo, row[headers.Observacións]) ? 'transparencia' : 'xeral';
    const data = String(row[headers.Data_Documento] || '').trim();
    saida.push({
      id: String(row[headers.Id_Documento] || row[headers['Row ID']] || '').trim(),
      clase: 'documento',
      seccion: seccion,
      titulo: titulo,
      tipo: tipo,
      data: data,
      dataIso: isoDesdeDataDoc_(data),
      ano: String(row[headers.Ano] || '').trim(),
      organismo: String(row[headers.Organismo_Emisor] || '').trim(),
      descricion: String(row[headers.Descrición] || '').trim(),
      estado: String(row[headers.Estado] || '').trim(),
      nivel: nivel,
      orde: Number(row[headers.Orde] || 9999),
      ruta: ruta
    });
    return saida;
  }, []);
}

function lerActas_(ss, perfil) {
  const sheet = ss.getSheetByName(DOC_PORTAL_CONFIG.sheetActas);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const valores = sheet.getDataRange().getDisplayValues();
  const headers = mapaHeadersDoc_(valores.shift());
  return valores.reduce(function(saida, row) {
    if (!verdadeiroDoc_(row[headers.Publicar_Portal])) return saida;
    const nivel = nivelCanonicoDoc_(row[headers.Nivel_Acceso]);
    if (!podeVerDoc_(perfil.nivel, nivel)) return saida;
    const ruta = String(row[headers.Acta] || '').trim();
    if (!ruta) return saida;
    const data = String(row[headers.Data] || '').trim();
    saida.push({
      id: String(row[headers.Id_Actas] || row[headers['Row ID']] || '').trim(),
      clase: 'acta',
      seccion: 'actas',
      titulo: String(row[headers.Título] || 'Acta').trim(),
      tipo: 'Acta',
      organo: String(row[headers['Órgano']] || '').trim(),
      tipoSesion: String(row[headers['Tipo de sesión']] || '').trim(),
      numero: String(row[headers['Número de sesión']] || '').trim(),
      data: data,
      dataIso: isoDesdeDataDoc_(data),
      ano: String(row[headers['Libro Actas']] || '').replace(/\./g, '').trim(),
      descricion: String(row[headers.Observacións] || '').trim(),
      estado: String(row[headers.Estado] || '').trim(),
      nivel: nivel,
      dataAprobacion: String(row[headers.Data_Aprobacion] || '').trim(),
      ruta: ruta
    });
    return saida;
  }, []);
}

function obterPerfilDocumentacion_(email) {
  if (!email) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usuarios = ss.getSheetByName('UsuariosWeb');
  const persoas = ss.getSheetByName('Persoas');
  if (!usuarios || !persoas) throw new Error('Non se localizaron UsuariosWeb ou Persoas no ficheiro principal');

  const datosUsuarios = usuarios.getDataRange().getDisplayValues();
  const hu = mapaHeadersDoc_(datosUsuarios.shift());
  const usuario = datosUsuarios.find(function(row) {
    return normalizarEmailDoc_(row[hu.Email]) === email && verdadeiroDoc_(row[hu.Activo]);
  });
  if (!usuario) return null;

  const persoaRef = String(usuario[hu.Persoa] || '').trim();
  const datosPersoas = persoas.getDataRange().getDisplayValues();
  const hp = mapaHeadersDoc_(datosPersoas.shift());
  const persoa = datosPersoas.find(function(row) {
    const id = String(row[hp.Id] || row[hp['Row ID']] || '').trim();
    const correo = normalizarEmailDoc_(row[hp['Correo electrónico']] || row[hp.Email]);
    return (persoaRef && id === persoaRef) || correo === email;
  });

  const cargo = String(persoa ? persoa[hp.Cargo] : '').trim();
  const nivel = nivelDesdeCargoDoc_(cargo);
  const nome = String(
    usuario[hu.Nome] ||
    (persoa && (persoa[hp.nomeCompleto] || persoa[hp.Nome])) ||
    ''
  ).trim();
  return { email: email, nome: nome, cargo: cargo, nivel: nivel };
}

function nivelDesdeCargoDoc_(cargo) {
  const valor = normalizarTextoDoc_(cargo);
  if (['presidente', 'presidenta', 'secretario', 'secretaria', 'tesoureiro', 'tesoureira', 'contador', 'contadora'].some(function(c) { return valor.indexOf(c) >= 0; })) {
    return 'Administración';
  }
  if (valor && valor !== 'ningun' && valor !== 'ningunha') return 'Xunta Directiva';
  return 'Coralistas';
}

function nivelCanonicoDoc_(nivel) {
  const valor = normalizarTextoDoc_(nivel);
  if (valor === 'administracion') return 'Administración';
  if (valor === 'xunta directiva') return 'Xunta Directiva';
  return 'Coralistas';
}

function podeVerDoc_(nivelUsuario, nivelDocumento) {
  return (DOC_NIVEIS[nivelUsuario] || 0) >= (DOC_NIVEIS[nivelDocumento] || 1);
}

function eTransparenciaDoc_(titulo, tipo, observacions) {
  const texto = normalizarTextoDoc_([titulo, tipo, observacions].join(' '));
  return ['balance', 'conta de resultados', 'contas anuais', 'transparencia'].some(function(valor) {
    return texto.indexOf(valor) >= 0;
  });
}

function mapaHeadersDoc_(headers) {
  return headers.reduce(function(mapa, header, index) {
    mapa[String(header).trim()] = index;
    return mapa;
  }, {});
}

function verdadeiroDoc_(valor) {
  return valor === true || ['true', 'si', 'sí', 'yes', '1', 'verdadeiro'].indexOf(normalizarTextoDoc_(valor)) >= 0;
}

function normalizarEmailDoc_(valor) {
  return String(valor || '').trim().toLowerCase();
}

function normalizarTextoDoc_(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function isoDesdeDataDoc_(valor) {
  const partes = String(valor || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return partes ? [partes[3], partes[2].padStart(2, '0'), partes[1].padStart(2, '0')].join('-') : '';
}
