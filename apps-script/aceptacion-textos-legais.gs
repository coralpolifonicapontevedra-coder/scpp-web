/**
 * Texto legal vixente do portal privado.
 *
 * Este módulo evita que o navegador decida a versión ou o contido aceptado.
 * Tanto a comprobación como o rexistro resolven a fila activa directamente
 * desde TextosLegais.
 */
const ACEPTACION_SPREADSHEET_ID_ =
  '1gndQQ1AFQLtg2lUU8ANa5ksU3U6wZNxJI2Ye6z7Mu7k';
const TEXTOS_LEGAIS_SHEET_ID_ = 2025412208;
const TEXTO_LEGAL_PORTAL_ID_ = 'PRIVACIDADE_WEB';

function obterTextoLegalVixente_() {
  const libro = SpreadsheetApp.openById(
    ACEPTACION_SPREADSHEET_ID_
  );
  const folla = libro.getSheetById(TEXTOS_LEGAIS_SHEET_ID_);

  if (!folla || folla.getName() !== 'TextosLegais') {
    throw new Error('Non se atopou a pestana TextosLegais configurada');
  }

  const valores = folla.getDataRange().getValues();
  if (valores.length < 2) {
    throw new Error('TextosLegais non contén ningún texto legal');
  }

  const cabeceiras = valores[0].map(function(valor) {
    return normalizarCabeceiraPortal_(valor);
  });
  const columnas = {
    id: indiceCabeceiraPortal_(cabeceiras, ['id']),
    version: indiceCabeceiraPortal_(cabeceiras, ['version']),
    titulo: indiceCabeceiraPortal_(cabeceiras, ['titulo']),
    texto: indiceCabeceiraPortal_(cabeceiras, ['texto']),
    dataVixencia: indiceCabeceiraPortal_(
      cabeceiras,
      ['datavixencia', 'fechavigencia']
    ),
    activo: indiceCabeceiraPortal_(cabeceiras, ['activo']),
    ambito: indiceCabeceiraPortal_(cabeceiras, ['ambito']),
    idTextoLegal: indiceCabeceiraPortal_(
      cabeceiras,
      ['idtextolegal']
    )
  };

  Object.keys(columnas).forEach(function(nome) {
    if (columnas[nome] === -1) {
      throw new Error(
        'Falta a columna obrigatoria ' + nome + ' en TextosLegais'
      );
    }
  });

  const agora = new Date();
  const candidatas = valores
    .slice(1)
    .map(function(fila, indice) {
      const data = normalizarDataTextoLegal_(
        fila[columnas.dataVixencia]
      );
      return { fila: fila, indice: indice, data: data };
    })
    .filter(function(candidata) {
      const fila = candidata.fila;
      return (
        String(fila[columnas.id] || '').trim() ===
          TEXTO_LEGAL_PORTAL_ID_ &&
        valorBooleanoPortal_(fila[columnas.activo]) &&
        candidata.data &&
        candidata.data.getTime() <= agora.getTime()
      );
    })
    .sort(function(a, b) {
      return (
        b.data.getTime() - a.data.getTime() ||
        b.indice - a.indice
      );
    });

  if (!candidatas.length) {
    throw new Error(
      'Non hai un texto legal activo e vixente para o portal privado'
    );
  }

  const fila = candidatas[0].fila;
  const resultado = {
    id: String(fila[columnas.id] || '').trim(),
    idTextoLegal: String(
      fila[columnas.idTextoLegal] || ''
    ).trim(),
    version: String(fila[columnas.version] || '').trim(),
    titulo: String(fila[columnas.titulo] || '').trim(),
    texto: String(fila[columnas.texto] || '').trim(),
    ambito: String(fila[columnas.ambito] || '').trim(),
    dataVixencia: Utilities.formatDate(
      candidatas[0].data,
      'Europe/Madrid',
      'yyyy-MM-dd'
    )
  };

  if (!resultado.version || !resultado.titulo || !resultado.texto) {
    throw new Error('O texto legal vixente está incompleto');
  }
  return resultado;
}

function normalizarDataTextoLegal_(valor) {
  if (
    Object.prototype.toString.call(valor) === '[object Date]' &&
    !isNaN(valor.getTime())
  ) {
    return valor;
  }

  const texto = String(valor || '').trim();
  const partes = texto.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (!partes) return null;

  const data = new Date(
    Number(partes[3]),
    Number(partes[2]) - 1,
    Number(partes[1])
  );
  return isNaN(data.getTime()) ? null : data;
}

function comprobarAceptacionPortal_(correo) {
  const textoLegal = obterTextoLegalVixente_();
  return {
    ok: true,
    aceptacionVixente: tenAceptacionVixente_(
      correo,
      textoLegal.version
    ),
    textoLegal: textoLegal
  };
}

function rexistrarAceptacionPortal_(correo) {
  const usuario = obterOuCrearUsuarioWebPorEmail_(correo);
  if (!usuario) {
    return { ok: false, erro: 'Usuario non autorizado' };
  }

  const textoLegal = obterTextoLegalVixente_();
  rexistrarAceptacion({
    email: correo,
    version: textoLegal.version,
    textoLegal: textoLegal.texto,
    aceptaFines: true,
    persoa: usuario.persoa,
    usuarioWeb: usuario.usuarioWeb,
    ambito: textoLegal.ambito,
    canle: 'Web',
    dataRetirada: ''
  });

  return {
    ok: true,
    mensaxe: 'Aceptación rexistrada correctamente',
    version: textoLegal.version,
    textoLegalId: textoLegal.idTextoLegal,
    usuario: usuario
  };
}

function probarTextoLegalVixente() {
  console.log(JSON.stringify(obterTextoLegalVixente_()));
}

