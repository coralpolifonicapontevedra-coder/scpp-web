/**
 * Publicacións visibles na páxina pública de Actualidade.
 */
function listarPublicacionsWeb_() {
  const spreadsheetId =
    '1UjEvc2x6n2zmpXp6bgATTwAORbKPmI2zePdMTB5kmVU';

  const folla = SpreadsheetApp
    .openById(spreadsheetId)
    .getSheetByName('Publicacións');

  if (!folla) {
    throw new Error(
      'Non se atopou a pestana Publicacións.'
    );
  }

  const valores = folla.getDataRange().getValues();

  if (valores.length < 2) {
    return {
      ok: true,
      publicacions: []
    };
  }

  const cabeceiras = valores[0].map(function(valor) {
    return String(valor || '').trim();
  });

  const indice = function(nome) {
    return cabeceiras.indexOf(nome);
  };

  const columnas = {
    id: indice('Id'),
    data: indice('Data'),
    titulo: indice('Título'),
    tipo: indice('Tipo'),
    medio: indice('Medio'),
    mostrarWeb: indice('MostrarWeb'),
    destacada: indice('Destacada'),
    rutaWeb: indice('RutaWeb')
  };

  const faltan = Object.keys(columnas).filter(function(chave) {
    return columnas[chave] === -1;
  });

  if (faltan.length) {
    throw new Error(
      'Faltan columnas obrigatorias en Publicacións: ' +
      faltan.join(', ')
    );
  }

  const zonaHoraria =
    Session.getScriptTimeZone() || 'Europe/Madrid';

  const publicacions = valores
    .slice(1)
    .filter(function(fila) {
      return (
        valorBooleanoPublicacions_(fila[columnas.mostrarWeb]) &&
        String(fila[columnas.titulo] || '').trim() &&
        String(fila[columnas.rutaWeb] || '').trim()
      );
    })
    .map(function(fila) {
      return {
        id: String(fila[columnas.id] || '').trim(),

        titulo: String(
          fila[columnas.titulo] || ''
        ).trim(),

        tipo: String(
          fila[columnas.tipo] || ''
        ).trim(),

        medio: String(
          fila[columnas.medio] || ''
        ).trim(),

        data: formatarDataPublicacion_(
          fila[columnas.data],
          zonaHoraria
        ),

        destacada: valorBooleanoPublicacions_(
          fila[columnas.destacada]
        ),

        rutaWeb: String(
          fila[columnas.rutaWeb] || ''
        ).trim()
      };
    })
    .sort(function(a, b) {
      return String(b.data).localeCompare(String(a.data));
    });

  return {
    ok: true,
    publicacions: publicacions
  };
}


/**
 * Converte valores de AppSheet/Sheets en booleanos.
 */
function valorBooleanoPublicacions_(valor) {
  if (valor === true) {
    return true;
  }

  return [
    'true',
    'verdadero',
    'verdadeiro',
    'si',
    'sí',
    'yes',
    'y',
    '1'
  ].includes(
    String(valor || '')
      .trim()
      .toLowerCase()
  );
}


/**
 * Devolve a data no formato YYYY-MM-DD esperado pola web.
 */
function formatarDataPublicacion_(valor, zonaHoraria) {
  if (!valor) {
    return '';
  }

  if (
    Object.prototype.toString.call(valor) === '[object Date]' &&
    !isNaN(valor.getTime())
  ) {
    return Utilities.formatDate(
      valor,
      zonaHoraria,
      'yyyy-MM-dd'
    );
  }

  const texto = String(valor || '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return texto;
  }

  const europea = texto.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  );

  if (europea) {
    return (
      europea[3] +
      '-' +
      europea[2].padStart(2, '0') +
      '-' +
      europea[1].padStart(2, '0')
    );
  }

  return texto;
}